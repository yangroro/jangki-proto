import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

interface ConversionResult {
  inputFile: string;
  outputFile: string;
}

const systemPrompt = `
주어진 영수증 데이터를 CSV 형식으로 변환해주세요. CSV의 열은 품명, 색상, 사이즈, 단가, 수량, 금액, 미송여부로 이루어져 있습니다.

다음 규칙을 따르세요:
-  영수증 데이터에서 '품명', '색상', '사이즈', '단가', '수량', '금액', '미송여부'를 추출합니다.
- '미송여부'는 영수증 내에 명시된 정보를 바탕으로 입력합니다. 업체마다 미송여부를 표기하는 방법이 다를 수 있습니다.
  - '※'가 붙은 상품의 경우 미송여부는 'Y'로 표기합니다.
  - 품명에 '(미송)'이 포함된 상품의 경우 미송여부는 'Y'로 표기합니다.
  - 미송건과 송건을 구분하는 구분자가 있을 수 있습니다.
- 영수증에서 추출한 정보를 정리하여 CSV 형식으로 출력하세요.
- 품명은 원본을 그대로 유지하세요. 단 미송여부를 표시하는 특수문자는 제거하세요. 품명에 ','가 포함되어있을 경우 '.'으로 변경하세요.
- 품명의 형식은 일관성 있게 표기하세요.
- 색상정보가 없는 경우가 있을 수 있습니다. 이 경우 색상은 비워두세요.

출력 예시는 다음과 같습니다. 

제품명,색상,사이즈,단가,수량,금액,미송여부
23.ST시보리티,베이지,M,9000,1,9000,N
33.골덴팔부바지,베이지,S,15000,1,15000,Y
33.골덴팔부바지,차콜,XL,15000,1,15000,N
5.그라운드남방,아이보리,XL,18000,1,18000,N
20.덴깡카라맨투맨,검정,4XL,21000,1,21000,N
20.덴장카라맨투맨,,S,18000,1,18000,Y
20.덴깡카라맨투맨,,M,18000,1,18000,Y
8.면카라니트,검정,L,22000,2,44000,N
`;

async function convertToCSV(inputText: string, apiKey: string): Promise<string> {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: "gpt-4o",
    messages: [
      { role: "system", content: `${systemPrompt}` },
      { role: "user", content: `${inputText}` }
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.choices[0].message.content.trim();
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

async function processFile(file: string, inputDir: string, outputDir: string, apiKey: string): Promise<ConversionResult | null> {
  const inputPath = path.join(inputDir, file);
  const outputPath = path.join(outputDir, `${path.parse(file).name}.csv`);
  const errorPath = path.join(outputDir, 'errors', `${path.parse(file).name}.csv`);

  console.log(`처리 중: ${file}`);

  try {
    const jsonContent = await fs.readJson(inputPath);
    let csvContent = await convertToCSV(jsonContent.text, apiKey);
    if (csvContent.startsWith('```')) {
      csvContent = csvContent.slice(csvContent.indexOf('\n') + 1, csvContent.lastIndexOf('\n'));
    }

    let isValid = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        parse(csvContent, { skip_empty_lines: true });
        isValid = true;
        break;
      } catch (error) {
        if (attempt === 0) {
          console.error(`CSV 형식 검증 중 오류 발생: ${file}. 재시도 중...`, error);
          csvContent = await convertToCSV(jsonContent.text, apiKey);
        } else {
          console.error(`CSV 형식 검증 중 오류 발생: ${file}. 재시도 실패.`, error);
          await fs.ensureDir(path.dirname(errorPath));
          await fs.writeFile(errorPath, csvContent);
        }
      }
    }

    if (isValid) {
      await fs.writeFile(outputPath, csvContent);
      console.log(`변환 완료: ${outputPath}`);
      return { inputFile: file, outputFile: path.basename(outputPath) };
    }
  } catch (error) {
    console.error(`파일 처리 중 오류 발생: ${file}`, error);
  }

  return null;
}

export async function processOCRResults(inputDir: string, outputDir: string, apiKey: string): Promise<ConversionResult[]> {
  const files = await fs.readdir(inputDir);
  const jsonFiles = files.filter(file => file.endsWith('_ocr_result.json'));

  await fs.ensureDir(outputDir);

  const results: ConversionResult[] = [];
  const chunks = chunkArray(jsonFiles, 3);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(file => processFile(file, inputDir, outputDir, apiKey));
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults.filter((result): result is ConversionResult => result !== null));

    // 각 청크 처리 후 잠시 대기 (필요한 경우)
    // await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
