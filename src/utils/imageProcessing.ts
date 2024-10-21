import { Jimp } from "jimp";

export async function splitImageAtY(
  imagePath: string,
  y: number,
  outputPath: string
): Promise<void> {
  try {
    const image = await Jimp.read(imagePath);
    const width = image.width;
    const height = image.height;

    if (y <= 0 || y >= height) {
      throw new Error("유효하지 않은 y 좌표입니다.");
    }

    const topImage = image.clone().crop({
      x: 0,
      y: 0,
      w: width,
      h: y,
    });
    const bottomImage = image.clone().crop({
      x: 0,
      y: y,
      w: width,
      h: height - y,
    });

    await topImage.write(`${outputPath}1.png`);
    await bottomImage.write(`${outputPath}2.png`);

    console.log(
      `이미지가 성공적으로 나뉘었습니다. 출력 파일: ${outputPath}1.png, ${outputPath}2.png`
    );
  } catch (error) {
    console.error("이미지 나누기 중 오류 발생:", error);
    throw error;
  }
}
