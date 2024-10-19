import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import FormData from 'form-data';
import * as csv from 'fast-csv';

interface OCRResult {
  filename: string;
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    boundingBox: {
      vertices: Array<{ x: number; y: number }>;
    };
  }>;
}

interface SummaryResult {
  filename: string;
  confidence: number;
}

async function processImage(imagePath: string, apiKey: string): Promise<OCRResult> {
  const formData = new FormData();
  formData.append('document', fs.createReadStream(imagePath));

  const response = await axios.post('https://api.upstage.ai/v1/document-ai/ocr', formData, {
    headers: {
      ...formData.getHeaders(),
      'Authorization': `Bearer ${apiKey}`
    }
  });

  const { text, confidence, pages } = response.data;
  const words = pages[0].words;

  return {
    filename: path.basename(imagePath),
    text,
    confidence,
    words
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSummary(results: SummaryResult[], outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    csv.writeToPath(outputFile, results, { headers: true })
      .on('error', error => reject(error))
      .on('finish', () => {
        console.log(`요약 CSV 파일이 생성되었습니다: ${outputFile}`);
        resolve();
      });
  });
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

async function processSingleFile(inputPath: string, outputDir: string, apiKey: string): Promise<SummaryResult | null> {
  console.log(`처리 중: ${path.basename(inputPath)}`);
  
  try {
    const result = await processImage(inputPath, apiKey);
    
    const outputFilename = path.join(outputDir, `${path.parse(inputPath).name}_ocr_result.json`);
    await fs.writeJson(outputFilename, result, { spaces: 2 });
    
    console.log(`결과 저장 완료: ${outputFilename}`);
    return {
      filename: result.filename,
      confidence: result.confidence
    };
  } catch (error) {
    console.error(`파일 처리 중 오류 발생: ${inputPath}`, error);
    return null;
  }
}

export async function processOCR(input: string, outputDir: string, apiKey: string): Promise<void> {
  await fs.ensureDir(outputDir);
  const summaryResults: SummaryResult[] = [];

  const stats = await fs.stat(input);
  if (stats.isFile()) {
    // 단일 파일 처리
    const result = await processSingleFile(input, outputDir, apiKey);
    if (result) summaryResults.push(result);
  } else if (stats.isDirectory()) {
    // 디렉토리 처리
    const files = await fs.readdir(input);
    const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png'].includes(path.extname(file).toLowerCase()));
    const chunks = chunkArray(imageFiles, 3);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (file) => {
        const imagePath = path.join(input, file);
        return processSingleFile(imagePath, outputDir, apiKey);
      });

      const chunkResults = await Promise.all(chunkPromises);
      summaryResults.push(...chunkResults.filter((result): result is SummaryResult => result !== null));
    }
  } else {
    throw new Error('입력이 파일이나 디렉토리가 아닙니다.');
  }

  // 요약 CSV 파일 생성
  const summaryFilename = path.join(outputDir, 'ocr_summary.csv');
  await generateSummary(summaryResults, summaryFilename);

  console.log('모든 처리 완료');
}
