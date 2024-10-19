import * as fs from 'fs-extra';
import * as path from 'path';

interface ExtractionResult {
  inputFile: string;
  outputFile: string;
}

export async function extractTextFromOCRResults(inputDir: string, outputDir: string): Promise<ExtractionResult[]> {
  const files = await fs.readdir(inputDir);
  const jsonFiles = files.filter(file => file.endsWith('_ocr_result.json'));

  await fs.ensureDir(outputDir);

  const results: ExtractionResult[] = [];

  for (const file of jsonFiles) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, `${path.parse(file).name}.txt`);

    console.log(`처리 중: ${file}`);

    try {
      const jsonContent = await fs.readJson(inputPath);
      const extractedText = jsonContent.text;

      await fs.writeFile(outputPath, extractedText);

      results.push({ inputFile: file, outputFile: path.basename(outputPath) });
      console.log(`텍스트 추출 완료: ${outputPath}`);
    } catch (error) {
      console.error(`파일 처리 중 오류 발생: ${file}`, error);
    }
  }

  return results;
}
