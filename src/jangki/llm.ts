import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { parse } from "csv-parse/sync";

const SYSTEM_PROMPT = `
당신은 아주 꼼꼼하고 정확한 영수증 정리 전문가입니다. 주어진 영수증 데이터를 분석하고, 명확하고 일관된 형식으로 CSV 파일로 변환하는 작업을 수행하세요. 
주어지는 영수증 데이터는 영수증을 OCR한 텍스트 결과입니다. 아래 단계와 규칙을 따라 작업한 후 결과를 검토하고 실행하세요.

### 단계별 지침:
1. 데이터 추출:
   - 영수증에서 "품명", "색상", "사이즈", "단가", "수량", "금액", "미송여부" 항목을 각각 추출하세요.

2. 미송여부 판단 규칙:
   - 영수증 내에 명시된 정보를 바탕으로 미송여부를 판단합니다.
     - 품명에 "※"가 포함된 상품은 미송여부를 "Y"로 표기합니다.
     - 품명에 "(미송)"이라는 단어가 포함된 경우도 미송여부를 "Y"로 표기합니다.
     - 미송여부와 송건을 구분하는 별도의 표시나 구분자가 있으면 확인 후 반영하세요.
   - 어떤 업체의 경우엔 미송 여부를 표기하는 방법이 다릅니다. 표의 아래쪽에 미송건만 모아서 미송이라고 표기하기도 합니다.

3. 품명과 데이터 형식 정리:
   - 품명은 원본 그대로 유지하되, "※"나 기타 특수문자를 제거하세요.
   - 품명에 ","가 포함된 경우 "."으로 변경하세요.
   - 모든 품명의 형식이 일관성 있게 정리되도록 합니다.
   - 색상과 사이즈는 "/"로 구분되는 경우가 많습니다.
   - 상품명과 색상을 구분하는 것에 유의하세요.

4. 누락된 데이터 처리:
   - 색상이나 사이즈 정보가 없는 상품도 있습니다. 이 경우 해당 칸은 비워둡니다. 이때, csv에서 비어있는 칸 표기를 놓치지 않게 주의하세요.

5. CSV 파일 형식:
   - 최종 결과는 다음 열 순서로 정리하세요:  
     "품명", "색상", "사이즈", "단가", "수량", "금액", "미송여부"  
   - CSV 형식에 맞게 데이터를 정리한 후 정확히 출력하세요.
   - 사이즈가 색상이 없는 경우에도 , 를 빠뜨리지 않게 주의하세요.

6. 최종 검토
   - 생성된 CSV 데이터에서 각 항목이 올바르게 추출되었는지 검토하세요.
   - 품명이 일관성 있게 처리되었는지, 미송여부가 올바르게 판단되었는지 확인하세요. 미송 여부 실수는 아주 치명적입니다. 

7. 응답형식
   - 응답에 설명등은 포함하지 말고 csv 결과만 출력하세요.

### 출력 예시:
품명,색상,사이즈,단가,수량,금액,미송여부
23.ST시보리티,베이지,M,9000,1,9000,N
33.골덴팔부바지,블루/네이비,S,15000,1,15000,Y
33.골덴팔부바지,크림/먹색,XL,15000,1,15000,N
5.그라운드남방,아이보리,,18000,1,18000,N
20.덴깡카라맨투맨,검정,4XL,21000,1,21000,N
20.덴장카라맨투맨,,S,18000,1,18000,Y
20.덴깡카라맨투맨,,M,18000,1,18000,Y
8.면카라니트,검정,L,22000,2,44000,N
`;

export async function receiptToCSV(
  receiptText: string,
  isRetry: boolean
): Promise<string> {
  const { text: responseText } = await generateText({
    // model: isRetry ? openai("gpt-4o") : openai("gpt-4o-mini"),
    // 무조건 gpt-4o로 처리
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    prompt: receiptText,
  });
  // 종종 응답이 markdown 형식으로 오기 때문에 이를 처리합니다.
  if (responseText.startsWith("```")) {
    const lines = responseText.split("\n");
    const csvContent = lines.slice(1, -1).join("\n");
    return csvContent;
  }
  return responseText;
}

export async function validateCSV(csv: string): Promise<boolean> {
  const records = parse(csv, { columns: true });
  // columns이 품명,색상,사이즈,단가,수량,금액,미송여부 인지 확인
  // 추출된 결과가 비어있는 경우 오류
  if (records.length === 0) {
    return false;
  }
  return csv.split("\n")[0] === "품명,색상,사이즈,단가,수량,금액,미송여부";
}
