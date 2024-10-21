import { splitReceipt, binaryReceipt, readReceipt } from "./image";
import { makeBoxedImage, performAndMergeOCR } from "./ocr";
import * as fs from "fs-extra";
import * as path from "path";
import { Jimp, JimpInstance } from "jimp";

const CACHE_DIR = "./desktop";

import { textToCSV, validateCSV } from "./llm";

export async function processReceipt(path: string): Promise<void> {
  // 1. 이미지 처리
  let filename = path.split("/").pop();
  const extension = filename?.split(".").pop();
  filename = filename?.split(".")[0];
  const image = await readReceipt(path);
  let processedImages: JimpInstance[];

  await writeImageCache(`${filename}_original`, image);

  const imageRatio = image.height / image.width;

  // 7:1 이상이면 crop처리 cropRatio는 6으로
  const cropRatio = 6;
  if (imageRatio >= 7) {
    const binarizedImage = await binaryReceipt(image);
    processedImages = splitReceipt(
      image,
      binarizedImage,
      Math.floor(image.width * cropRatio)
    );
    await writeImageCache(`${filename}_binarized`, binarizedImage);
  } else {
    processedImages = [image];
  }

  // 중간결과물 저장

  processedImages.forEach(async (img, index) => {
    await writeImageCache(`${filename}_${index}`, img);
  });
  const filenames = processedImages.map(
    (img, index) => `${filename}_${index}.${extension}`
  );
  // // 2. OCR 처리
  const mergedOCRResult = await performAndMergeOCR(processedImages, filenames);
  console.log("confidence", mergedOCRResult.confidence);

  // 중간 결과물 저장
  await writeTextCache(
    `${filename}_merged.json`,
    JSON.stringify(mergedOCRResult, null, 2)
  );

  const boxedImage = await makeBoxedImage(image, mergedOCRResult);
  await writeImageCache(`${filename}_boxed`, boxedImage);

  const csvResult = await textToCSV(mergedOCRResult.text);

  const isValid = await validateCSV(csvResult);
  if (!isValid) {
    console.error("CSV 형식이 유효하지 않습니다. 오류 내용을 저장합니다.");
    await writeTextCache(`${filename}_error.txt`, csvResult);
    return;
  }

  console.log("CSV 형식이 유효합니다. 결과를 저장합니다.");
  await writeTextCache(`${filename}.csv`, csvResult);
}

async function writeImageCache(
  key: string,
  image: JimpInstance
): Promise<void> {
  await fs.ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, `${key}.png`);
  // @ts-ignore
  await image.write(cachePath);
}

async function getImageCache(key: string): Promise<JimpInstance | null> {
  const cachePath = path.join(CACHE_DIR, `${key}.png`);
  if (await fs.pathExists(cachePath)) {
    return (await Jimp.read(cachePath)) as JimpInstance;
  }
  return null;
}

async function writeTextCache(filename: string, data: any): Promise<void> {
  await fs.ensureDir(CACHE_DIR);
  const cachePath = path.join(CACHE_DIR, `${filename}`);

  await fs.writeFile(cachePath, data);
}

async function getTextCache(key: string): Promise<any | null> {
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  if (await fs.pathExists(cachePath)) {
    return await fs.readJson(cachePath);
  }
  return null;
}
