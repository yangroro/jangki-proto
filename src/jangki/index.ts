import { splitReceipt, binaryReceipt, readReceipt } from "./image";
import { makeBoxedImage, OCRResult, performAndMergeOCR } from "./ocr";
import * as fs from "fs-extra";
import * as path from "path";
import { Jimp, JimpInstance } from "jimp";

import { receiptToCSV, validateCSV } from "./llm";

export async function processReceipt(
  targetDir: string,
  imagePath: string
): Promise<void> {
  // 1. 이미지 처리
  let filename = imagePath.split("/").pop();
  const extension = filename?.split(".").pop();
  filename = filename?.split(".")[0];
  let processedImages: JimpInstance[];

  try {
    const image = await readReceipt(imagePath);
    // await writeImageCache(`${filename}_original`, image);

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
      // await writeImageCache(`${filename}_binarized`, binarizedImage);
    } else {
      processedImages = [image];
    }
  } catch (error) {
    console.error(`${filename} 이미지 처리 중 오류 발생: ${error}`);
    return;
  } 
  // 중간결과물 저장

  // processedImages.forEach(async (img, index) => {
  //   await writeImageCache(`${filename}_${index}`, img);
  // });
  const filenames = processedImages.map(
    (img, index) => `${filename}_${index}.${extension}`
  );
  // 이미 OCR 처리된 결과가 있으면 그대로 사용
  let mergedOCRResult: OCRResult;
  const cachedOCRResult = await getTextCache(
    targetDir,
    `${filename}_merged.json`
  );
  if (cachedOCRResult) {
    mergedOCRResult = cachedOCRResult;
  } else {
    // 2. OCR 처리
    mergedOCRResult = await performAndMergeOCR(processedImages, filenames);
    await writeTextCache(
      targetDir,
      `${filename}_merged.json`,
      JSON.stringify(mergedOCRResult, null, 2)
    );
  }

  // const boxedImage = await makeBoxedImage(image, mergedOCRResult);
  // await writeImageCache(`${filename}_boxed`, boxedImage);
  let csvResult: string = "";
  let isValid = false;
  const maxRetry = 3;

  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    // 오류 발생시 filename_error.txt에 csv와 함께 오류 콘솔 내용을 저장
    try {
      csvResult = await receiptToCSV(mergedOCRResult.text, attempt > 1);
      isValid = await validateCSV(csvResult);
      if (isValid) break;
    } catch (error) {
      if (attempt === maxRetry) {
        console.error(
          `${filename} ${maxRetry}번 시도 후 오류 발생. 오류 내용을 저장합니다.`
        );
        await writeTextCache(
          targetDir,
          `${filename}_error_final.txt`,
          csvResult + "\n" + error
        );
      } else {
        console.error(
          `${filename} CSV 변환 또는 검증 중 오류 발생 (시도 ${attempt}/${maxRetry}):`
        );
        await writeTextCache(
          targetDir,
          `${filename}_error_${attempt}.txt`,
          csvResult + "\n" + error
        );
      }
    }
  }

  const totalResultCount = csvResult.split("\n").length - 1;
  const notSentCount = csvResult
    .split("\n")
    .filter((line) => line.endsWith("Y")).length;

  console.log(
    filename,
    "주문 건수:",
    totalResultCount,
    "미송 건수:",
    notSentCount,
    "confidence:",
    mergedOCRResult.confidence
  );
  await writeTextCache(targetDir, `${filename}.csv`, csvResult);
}

async function writeImageCache(
  targetDir: string,
  key: string,
  image: JimpInstance
): Promise<void> {
  await fs.ensureDir(targetDir);
  const cachePath = path.join(targetDir, `${key}.png`);
  // @ts-ignore
  await image.write(cachePath);
}

async function getImageCache(
  targetDir: string,
  key: string
): Promise<JimpInstance | null> {
  const cachePath = path.join(targetDir, `${key}.png`);
  if (await fs.pathExists(cachePath)) {
    return (await Jimp.read(cachePath)) as JimpInstance;
  }
  return null;
}

async function writeTextCache(
  targetDir: string,
  filename: string,
  data: any
): Promise<void> {
  await fs.ensureDir(targetDir);
  const cachePath = path.join(targetDir, `${filename}`);

  await fs.writeFile(cachePath, data);
}

async function getTextCache(
  targetDir: string,
  key: string
): Promise<any | null> {
  const cachePath = path.join(targetDir, `${key}.json`);
  if (await fs.pathExists(cachePath)) {
    return await fs.readJson(cachePath);
  }
  return null;
}
