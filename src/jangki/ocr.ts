import FormData from "form-data";
import axios from "axios";
import { Jimp, JimpInstance, rgbaToInt } from "jimp";

interface Word {
  boundingBox: {
    vertices: { x: number; y: number }[];
  };
  confidence: number;
  id: number;
  text: string;
}

interface OCRResult {
  text: string;
  confidence: number;
  words: Word[];
  metadata: {
    pages: {
      height: number;
      width: number;
    }[];
  };
}
// 원본: 3603
// 0번 이미지: 1869
// 1번 이미지: 1729
async function callOCRAPI(
  image: JimpInstance,
  filename: string
): Promise<OCRResult> {
  const extension = filename.split(".").pop();
  const mime = `image/${extension}`;
  // @ts-ignore
  const buffer = await image.getBuffer(mime);
  const formData = new FormData();
  formData.append("document", buffer, {
    filename: filename,
    contentType: mime,
  });

  const API_KEY = process.env.UPSTAGE_API_KEY;
  const response = await axios.post(
    "https://api.upstage.ai/v1/document-ai/ocr",
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${API_KEY}`,
      },
    }
  );
  const { confidence, pages, text, metadata } = response.data;
  return {
    text,
    confidence,
    words: pages[0].words,
    metadata,
  };
}

export async function performAndMergeOCR(
  images: JimpInstance[],
  filenames: string[]
): Promise<OCRResult> {
  const originalResults = await Promise.all(
    images.map((image, index) => callOCRAPI(image, filenames[index]))
  );

  let mergedText = "";
  let mergedWords: Word[] = [];
  let totalConfidence = 0;
  let totalHeight = 0;
  let widths = new Set<number>();
  let wordIdOffset = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const result = originalResults[i];

    // Concatenate the texts with a newline separator
    mergedText += result.text + "\n";

    // Sum the confidences for averaging later
    totalConfidence += result.confidence;

    // Get the height and width of the current image
    const imageHeight = image.bitmap.height;
    const imageWidth = image.bitmap.width;

    // Ensure all images have the same width
    widths.add(imageWidth);

    // Adjust the word bounding boxes and IDs
    for (const word of result.words) {
      const adjustedWord: Word = {
        ...word,
        id: word.id + wordIdOffset,
        boundingBox: {
          vertices: word.boundingBox.vertices.map((vertex) => ({
            x: vertex.x,
            y: vertex.y + totalHeight,
          })),
        },
      };
      mergedWords.push(adjustedWord);
    }

    // Update the word ID offset and total height
    wordIdOffset += result.words.length;
    totalHeight += imageHeight;
  }

  // Compute the minimum confidence
  const minConfidence = Math.min(
    ...originalResults.map((result) => result.confidence)
  );

  // Validate that all images have the same width
  if (widths.size !== 1) {
    throw new Error("Image widths are not consistent.");
  }
  const width = [...widths][0];

  // Construct the merged metadata
  const mergedMetadata = {
    pages: [
      {
        height: totalHeight,
        width: width,
        page: 1,
      },
    ],
  };

  // Trim any trailing newlines from the merged text
  mergedText = mergedText.trim();

  const mergedResult: OCRResult = {
    text: mergedText,
    confidence: minConfidence,
    words: mergedWords,
    metadata: mergedMetadata,
  };

  return mergedResult;
}

export async function makeBoxedImage(
  image: JimpInstance,
  ocrResult: OCRResult
) {
  // OCR 결과의 vertices를 이용해서 ocr인식한 텍스트를 이미지에 빨간색 박스로 표시
  const red = rgbaToInt(255, 0, 0, 255);

  for (const word of ocrResult.words) {
    const vertices = word.boundingBox.vertices;
    const minX = Math.min(...vertices.map((v) => v.x));
    const minY = Math.min(...vertices.map((v) => v.y));
    const maxX = Math.max(...vertices.map((v) => v.x));
    const maxY = Math.max(...vertices.map((v) => v.y));

    // 박스 그리기
    for (let x = minX; x <= maxX; x++) {
      image.setPixelColor(red, x, minY);
      image.setPixelColor(red, x, maxY);
    }
    for (let y = minY; y <= maxY; y++) {
      image.setPixelColor(red, minX, y);
      image.setPixelColor(red, maxX, y);
    }
  }

  return image;
}
