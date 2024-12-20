import { Jimp, JimpInstance } from "jimp";
import sharp from 'sharp';

export async function readReceipt(path: string): Promise<JimpInstance> {
  try {
    // Jimp보다 오류에 더 강인한 sharp로 이미지를 png로 변환하여 로드
    const buffer = await sharp(path)
      .toFormat('png')
      .toBuffer();
    
    return (await Jimp.read(buffer)) as JimpInstance;
  } catch (error) {
    console.error(`${path} 이미지 로드 중 오류 발생:`, error);
    throw error;
  }
}

export async function binaryReceipt(
  image: JimpInstance
): Promise<JimpInstance> {
  try {
    // 이미지 로드
    image = image.clone();
    // 그레이스케일로 변환
    image.greyscale();

    // Otsu's 방법을 사용한 임계값 계산
    const threshold = otsuThreshold(image as JimpInstance);

    // 이진화 적용
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
      const gray = image.bitmap.data[idx];
      const binary = gray > threshold ? 255 : 0;
      image.bitmap.data[idx] = binary;
      image.bitmap.data[idx + 1] = binary;
      image.bitmap.data[idx + 2] = binary;
    });
    // 버퍼로 변환하여 반환
    return image;
  } catch (error) {
    console.error("이미지 이진화 중 오류 발생:", error);
    throw error;
  }
}

function otsuThreshold(image: JimpInstance): number {
  const histogram = new Array(256).fill(0);
  let total = 0;

  // 히스토그램 계산

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
    const gray = image.bitmap.data[idx];
    histogram[gray]++;
    total++;
  });

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let mB;
  let mF;
  let max = 0;
  let threshold = 0;
  let between = 0;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];
    mB = sumB / wB;
    mF = (sum - sumB) / wF;

    between = wB * wF * Math.pow(mB - mF, 2);
    if (between > max) {
      max = between;
      threshold = i;
    }
  }

  return threshold;
}

export function findWhiteLine(
  image: JimpInstance,
  startY: number,
  minThickness: number
): number | null {
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  for (let y = startY; y < height - minThickness; y++) {
    let lineStart = -1;
    let lineEnd = -1;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (image.bitmap.data[idx] === 255) {
        // 흰색 픽셀 확인
        if (lineStart === -1) lineStart = x;
        lineEnd = x;
      } else if (lineStart !== -1) {
        if (lineEnd - lineStart + 1 >= width) {
          // 두께 확인
          let isThickEnough = true;
          for (let thickness = 1; thickness < minThickness; thickness++) {
            if (y + thickness >= height) {
              isThickEnough = false;
              break;
            }
            for (let x = lineStart; x <= lineEnd; x++) {
              const idx = ((y + thickness) * width + x) * 4;
              if (image.bitmap.data[idx] !== 255) {
                isThickEnough = false;
                break;
              }
            }
            if (!isThickEnough) break;
          }
          if (isThickEnough) return y;
        }
        lineStart = -1;
        lineEnd = -1;
      }
    }
    if (lineStart !== -1 && lineEnd - lineStart + 1 >= width) {
      // 마지막 줄 확인
      let isThickEnough = true;
      for (let thickness = 1; thickness < minThickness; thickness++) {
        if (y + thickness >= height) {
          isThickEnough = false;
          break;
        }
        for (let x = lineStart; x <= lineEnd; x++) {
          const idx = ((y + thickness) * width + x) * 4;
          if (image.bitmap.data[idx] !== 255) {
            isThickEnough = false;
            break;
          }
        }
        if (!isThickEnough) break;
      }
      if (isThickEnough) return y;
    }
  }

  return null; // 조건을 만족하는 흰색 가로줄을 찾지 못함
}

export function splitReceipt(
  image: JimpInstance,
  binarizedImage: JimpInstance,
  minHeight: number,
  minThickness: number = 5
): JimpInstance[] {
  const images: JimpInstance[] = [];
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  let currentY = 0;

  const whiteLineYs: number[] = [];

  while (currentY < height) {
    let searchStartY = currentY + minHeight;

    // Ensure the search doesn't go beyond the image height
    if (searchStartY >= height) {
      searchStartY = height - 1;
    }

    const whiteLineY = findWhiteLine(
      binarizedImage,
      searchStartY,
      minThickness
    );
    if (whiteLineY !== null && whiteLineY < height) {
      whiteLineYs.push(whiteLineY);
      const splitHeight = whiteLineY - currentY;
      const croppedImage = image.clone().crop({
        x: 0,
        y: currentY,
        w: width,
        h: splitHeight,
      }) as JimpInstance;
      images.push(croppedImage);

      // Move currentY past the white line to avoid overlapping
      currentY = whiteLineY;
    } else {
      // If no more white lines are found, take the remaining part of the image
      const splitHeight = height - currentY;
      if (splitHeight > 0) {
        const croppedImage = image.clone().crop({
          x: 0,
          y: currentY,
          w: width,
          h: splitHeight,
        }) as JimpInstance;
        images.push(croppedImage);
      }
      break;
    }
  }
  return images;
}
