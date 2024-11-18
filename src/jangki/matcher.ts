import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import ExcelJS from "exceljs";
import {
  weightedLevenshteinDistance,
  weightedLevenshteinRatio,
} from "../utils/match";
import { generateId } from "../utils/id";

interface ReceiptData {
  id: string;
  // 영수증 파일명
  receiptName: string;
  // 품명,색상,사이즈,단가,수량,금액,미송여부
  brandName: string;
  productName: string;
  color: string;
  size: string;
  wholesalePrice: number;
  quantity: number;
  amount: number;
  isNotSent: boolean;
  foundCount: number;

  normalizedBrandName: string;
  normalizedProductName: string;
  normalizedColor: string;
  normalizedSize: string;
}

class OrderData {
  orderSheet: OrderSheet;
  row: ExcelJS.Row;
  brandName: string;
  productName: string;
  color: string;
  size: string;
  count: number;
  normalizedBrandName: string;
  normalizedProductName: string;
  normalizedColor: string;
  normalizedSize: string;

  constructor(orderSheet: OrderSheet, row: ExcelJS.Row) {
    this.orderSheet = orderSheet;
    this.row = row;

    this.brandName = convertToComposite(
      (row.getCell(orderSheet.brandNameColumnNumber).value as string) ?? ""
    );
    this.productName = row.getCell(orderSheet.productNameColumnNumber)
      .value as string;
    this.color =
      (row.getCell(orderSheet.colorColumnNumber).value as string) ?? "";
    this.size =
      (row.getCell(orderSheet.sizeColumnNumber).value as string) ?? "";
    this.count =
      (row.getCell(orderSheet.countColumnNumber).value as number) ?? 0;

    this.normalizedBrandName = convertToComposite(this.brandName);
    this.normalizedProductName = normalizeProductName(this.productName);
    this.normalizedColor = normalizeColor(this.color);
    this.normalizedSize = normalizeSize(this.size);
  }
  recordNormalizedData() {
    this.row.getCell(this.orderSheet.normalizeProductNameColumnNumber).value =
      this.normalizedProductName;
    this.row.getCell(this.orderSheet.normalizeColorColumnNumber).value =
      this.normalizedColor;
    this.row.getCell(this.orderSheet.normalizeSizeColumnNumber).value =
      this.normalizedSize;
  }

  recordWithReceiptData(receiptData: ReceiptData) {
    this.row.getCell(this.orderSheet.matchingColumnNumber).value = true;
    this.row.getCell(this.orderSheet.isNotSentColumnNumber).value =
      receiptData.isNotSent;
    this.row.getCell(this.orderSheet.matchingIdColumnNumber).value =
      receiptData.id;
  }
}

export function csvToReceiptData(
  csv: any[],
  receiptName: string
): ReceiptData[] {
  // 마지막 글자가 숫자인 경우 숫자 제거
  const brandName = receiptName.replace(/\d+$/, "");
  return csv.map((row) => {
    if (row["품명"] == "1898뉴욕후드") {
      console.log(row);
    }
    return {
      id: generateId(),
      receiptName,
      brandName,
      productName: row["품명"],
      color: row["색상"],
      size: row["사이즈"],
      wholesalePrice: row["단가"],
      quantity: row["수량"],
      amount: row["금액"],
      isNotSent: row["미송여부"] === "Y",
      foundCount: 0,

      normalizedBrandName: convertToComposite(brandName),
      normalizedProductName: normalizeProductName(row["품명"]),
      normalizedColor: normalizeColor(row["색상"]),
      normalizedSize: normalizeSize(row["사이즈"]),
    };
  });
}

function receiptDataToSheetData(receiptData: ReceiptData[]): any[] {
  return receiptData.map((data) => ({
    브랜드: data.brandName,
    상품명: data.productName,
    색상: data.color,
    사이즈: data.size,
    수량: data.quantity,
    미송여부: data.isNotSent,
    Nor상품명: data.normalizedProductName,
    Nor색상: data.normalizedColor,
    Nor사이즈: data.normalizedSize,
    매칭여부: data.foundCount > 0,
    매치ID: data.id,
  }));
}

export async function loadCSVFilesFromDirectory(
  directoryPath: string
): Promise<any[]> {
  const results: any[] = [];
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    if (path.extname(file) === ".csv") {
      const filePath = path.join(directoryPath, file);
      const fileResults: any[] = [];

      const parser = fs.createReadStream(filePath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
        })
      );

      for await (const record of parser) {
        fileResults.push(record);
      }

      results.push({ fileName: file, data: fileResults });
    }
  }

  return results;
}

export async function readExcelFile(
  filePath: string
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  console.log(`Loaded Excel file: ${filePath}`);
  return workbook;
}

export async function addSheetToExcel(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  data: any[]
): Promise<void> {
  const worksheet = workbook.addWorksheet(sheetName);
  if (data.length > 0) {
    worksheet.columns = Object.keys(data[0]).map((key) => ({
      header: key,
      key,
    }));
    data.forEach((row) => worksheet.addRow(row));
  }
}

export async function saveExcelFile(
  workbook: ExcelJS.Workbook,
  filePath: string
): Promise<void> {
  await workbook.xlsx.writeFile(filePath);
  console.log(`Saved Excel file: ${filePath}`);
}

function convertToComposite(input: string): string {
  return input.normalize("NFC");
}

export function normalizeProductName(productName: string): string {
  productName = convertToComposite(productName);
  // 대문자로 전환
  productName = productName.toUpperCase();
  // // 예시: 01.공룡맨투맨 -> 공룡맨투맨
  // productName = productName.replace(/^\d+\./, "");

  // // 예시: 기획)공룡맨투맨 -> 공룡맨투맨
  // // 게으른 매칭 사용(첫번째 괄호만 제거)
  // productName = productName.replace(/.*?\)/, "");

  // 숫자로 시작하는 경우 숫자 제거
  productName = productName.replace(/^\d+/, "");

  // 공백 제거
  productName = productName.replace(/\s+/g, "");

  // 특수문자 단순 제거
  productName = productName.replace(/[^\w가-힣]+/g, "");

  // postfix 용어집, 대소문자 모두 매칭
  const nameDictionary: { [key: string]: string } = {
    TEE: "티셔츠",
    OPS: "원피스",
    MTM: "맨투맨",
    PT: "팬츠",
    JP: "점퍼",
    JK: "자켓",
    SET: "세트",
    LE: "레깅스",
    P: "팬츠",
    T: "티셔츠",
    SK: "스커트",
    바지: "팬츠",
    맨투맨티셔츠: "맨투맨",
  };
  // key의 길이순으로 정렬 길이 내림차순
  const sortedPostfixDictionary = Object.keys(nameDictionary).sort(
    (a, b) => b.length - a.length
  );

  for (const postfix of sortedPostfixDictionary) {
    productName = productName.replace(
      postfix.toUpperCase(),
      nameDictionary[postfix]
    );
  }

  // 상품명에 시즌 표기로 시작하는 경우 제거
  // 예시: 23SS, 24SS, 23FW, 24FW, 23S, 23F, 24S, 24F
  productName = productName.replace(/[0-9]+[S|F|W|FW|SS|]/, "");
  // "티"로 끝나는 경우 티셔츠로 변경
  productName = productName.replace(/티$/, "티셔츠");

  return productName;
}

function normalizeColor(color: string): string {
  color = convertToComposite(color);
  // 모두 대문자로 전환
  color = color.toUpperCase();
  // 공백 제거
  color = color.replace(/\s+/g, "");
  // 특수문자 제거
  color = color.replace(/[^\w가-힣]+/g, "");

  const nameDictionary: { [key: string]: string } = {
    검정: "블랙",
    흰색: "화이트",
    파랑: "블루",
    빨강: "레드",
    초록: "그린",
    노랑: "옐로우",
    보라: "퍼플",
    회색: "그레이",
    밤색: "브라운",

    세트: "SET",
  };
  const exactDictionary: { [key: string]: string } = {
    아이: "아이보리",
    차콜: "챠콜",
    연핑: "연핑크",
    회: "그레이",
    검: "블랙",
    연회: "연회색",
    연베: "연베이지",
    메란: "메란지",
    멜란지: "메란지",
    beige: "베이지",
    black: "블랙",
    cream: "크림",
    navy: "네이비",
    red: "레드",
    brown: "브라운",
    khaki: "카키",
  };

  if (exactDictionary[color]) {
    color = exactDictionary[color];
  } else if (nameDictionary[color]) {
    color = nameDictionary[color];
  }

  const sortedPostfixDictionary = Object.keys(nameDictionary).sort(
    (a, b) => b.length - a.length
  );

  for (const postfix of sortedPostfixDictionary) {
    color = color.replace(postfix.toUpperCase(), nameDictionary[postfix]);
  }

  return color;
}

function normalizeSize(size: string | null | number): string {
  if (!size) {
    return "";
  } else if (typeof size === "number") {
    size = size.toString();
  }
  size = convertToComposite(size);
  size = size.toUpperCase();
  // 공백 제거
  size = size.replace(/\s+/g, "");
  // 호로 끝나는 경우 호 제거
  size = size.replace(/호$/, "");
  // ONESIZE -> ONE
  size = size.replace("ONESIZE", "ONE");

  const exactDictionary: { [key: string]: string } = {
    ONESIZE: "ONE",
    세트: "ONE",
    SET: "ONE",
  };
  if (exactDictionary[size]) {
    size = exactDictionary[size];
  }

  // S(0-6M) -> S L(5~8) -> L 과같이 괄호 안에 내용물이 있고 XS, S, M, L, XL 과같이 크기만 표기된 경우 괄호 제거
  size = size.replace(/\([^\)]+\)/, "");

  return size;
}
class OrderSheet {
  excelData: ExcelJS.Workbook;
  firstSheet: ExcelJS.Worksheet;
  columns: ExcelJS.CellValue[];
  columnCount: number;

  brandNameColumnNumber: number;
  productNameColumnNumber: number;
  colorColumnNumber: number;
  sizeColumnNumber: number;
  countColumnNumber: number;

  matchingColumnNumber: number;
  isNotSentColumnNumber: number;
  normalizeProductNameColumnNumber: number;
  normalizeColorColumnNumber: number;
  normalizeSizeColumnNumber: number;

  matchingIdColumnNumber: number;

  constructor(excelData: ExcelJS.Workbook) {
    this.excelData = excelData;
    this.firstSheet = this.excelData.worksheets[0];
    this.columns = this.firstSheet.getRow(1).values as ExcelJS.CellValue[];
    this.columnCount = this.firstSheet.getRow(1).values.length as number;

    this.brandNameColumnNumber = this.findOrAddColumn("브랜드");
    this.productNameColumnNumber = this.findOrAddColumn("상품명");
    this.colorColumnNumber = this.findOrAddColumn("색상");
    this.sizeColumnNumber = this.findOrAddColumn("사이즈");
    this.countColumnNumber = this.findOrAddColumn("수량");

    this.matchingColumnNumber = this.findOrAddColumn("매칭여부");
    this.isNotSentColumnNumber = this.findOrAddColumn("미송여부");
    this.normalizeProductNameColumnNumber = this.findOrAddColumn("Nor상품명");
    this.normalizeColorColumnNumber = this.findOrAddColumn("Nor색상");
    this.normalizeSizeColumnNumber = this.findOrAddColumn("Nor사이즈");

    this.matchingIdColumnNumber = this.findOrAddColumn("매치ID");
  }
  findOrAddColumn(columnName: string): number {
    const index = this.columns.findIndex((column) => column === columnName);
    if (index === -1) {
      this.firstSheet.getRow(1).getCell(this.columnCount).value = columnName;
      return this.columnCount++;
    }
    return index;
  }

  addSheet(sheetName: string, data: any[]) {
    addSheetToExcel(this.excelData, sheetName, data);
  }

  getOrderData(): OrderData[] {
    const rows = this.firstSheet.getRows(2, this.firstSheet.rowCount - 1) ?? [];
    return rows.map((row) => new OrderData(this, row));
  }
}

export async function run(csvPath: string, excelPath: string) {
  const csvs = await loadCSVFilesFromDirectory(csvPath);
  const excelData = await readExcelFile(excelPath);
  const orderSheet = new OrderSheet(excelData);
  const orderData = orderSheet.getOrderData();

  const totalReceiptData = new Map<string, ReceiptData[]>();
  const totalOrderData = new Map<string, OrderData[]>();
  for (const csv of csvs) {
    const { fileName, data } = csv;
    const receiptName = fileName.replace(".csv", "");
    if (!receiptName) {
      console.error(`${fileName} 영수증 이름 오류`);
      continue;
    }
    const receiptData = csvToReceiptData(data, receiptName);
    if (!receiptData[0]) {
      console.error(`${fileName} 영수증 데이터 오류`);
      continue;
    }
    if (totalReceiptData.has(receiptData[0].brandName)) {
      totalReceiptData.get(receiptData[0].brandName)?.push(...receiptData);
    } else {
      totalReceiptData.set(receiptData[0].brandName, receiptData);
    }
  }

  for (const order of orderData) {
    totalOrderData.set(order.normalizedBrandName, [
      ...(totalOrderData.get(order.normalizedBrandName) ?? []),
      order,
    ]);
    order.recordNormalizedData();
  }
  let matchCount = 0;

  // 브랜드별로 매칭 수행
  for (const brandName of totalOrderData.keys()) {
    const orderData = totalOrderData.get(brandName) ?? [];
    const receiptData = totalReceiptData.get(brandName) ?? [];
    const matchingReceiptData = matchOrderToReceipt(
      orderData,
      receiptData,
      0.3
    );
    for (const match of matchingReceiptData) {
      if (match.matchedReceipt) {
        match.order.recordWithReceiptData(match.matchedReceipt);
        matchCount++;
      }
    }
  }

  // 브랜드별로 ReceiptData를 시트에 추가
  // for (const [_, receiptData] of totalReceiptData) {
  //   orderSheet.addSheet(
  //     receiptData[0].receiptName,
  //     receiptDataToSheetData(receiptData)
  //   );
  // }
  const receiptExcel = new ExcelJS.Workbook();
  const allReceiptData = Array.from(totalReceiptData.values()).flat();
  addSheetToExcel(
    receiptExcel,
    "영수증",
    receiptDataToSheetData(allReceiptData)
  );

  console.log(`Matching count: ${matchCount}`);
  const totalReceiptCount = Array.from(totalReceiptData.values()).reduce(
    (acc, curr) => acc + curr.length,
    0
  );
  console.log(`Total Receipt count: ${totalReceiptCount}`);
  console.log(
    `Total Match Ratio: ${((matchCount / totalReceiptCount) * 100).toFixed(1)}%`
  );
  const matchedExcelPath = `${excelPath.replace(".xlsx", "")}_matched.xlsx`;
  const receiptExcelPath = `${excelPath.replace(".xlsx", "")}_receipt.xlsx`;

  await saveExcelFile(excelData, matchedExcelPath);
  await saveExcelFile(receiptExcel, receiptExcelPath);
  return;
}

// 메인 매칭 함수
function matchOrderToReceipt(
  orders: OrderData[],
  receipts: ReceiptData[],
  similarityThreshold: number = 0.8, // 유사도 임계값 설정 (기본값: 80%)
  distanceThreshold: number = 1 // 거리 임계값 설정 (기본값: 1)
): {
  order: OrderData;
  matchedReceipt?: ReceiptData;
  similarity?: number;
  distance?: number;
}[] {
  const matches = [];

  for (const orderItem of orders) {
    // 주문 항목의 필드 정규화
    const orderBrand = orderItem.normalizedBrandName;
    const orderProductName = orderItem.normalizedProductName;
    const orderColor = orderItem.normalizedColor;
    const orderSize = orderItem.normalizedSize;

    // 브랜드, 색상, 사이즈가 일치하는 영수증 항목 필터링
    const candidateReceipts = receipts.filter((receiptItem) => {
      const receiptBrand = receiptItem.normalizedBrandName;
      const receiptColor = receiptItem.normalizedColor;
      const receiptSize = receiptItem.normalizedSize;
      const receiptQuantity = receiptItem.quantity;

      // 필수 조건: 브랜드명 일치, 이미 매칭된 수량을 초과하지 않는 경우만 포함
      return (
        orderBrand === receiptBrand &&
        orderColor === receiptColor &&
        orderSize === receiptSize &&
        // (orderColor === receiptColor ||
        //   orderSize === receiptSize ||
        //   (receiptColor === "" && receiptSize === "")) &&
        receiptItem.quantity > receiptItem.foundCount //
      );
    });

    let bestMatch: ReceiptData | undefined;
    let highestSimilarity = 0;
    let bestDistance = 0;

    for (const receiptItem of candidateReceipts) {
      // 영수증 상품명 정규화
      const receiptProductName = receiptItem.normalizedProductName;

      // 상품명 유사도 계산
      const similarity = weightedLevenshteinRatio(
        orderProductName,
        receiptProductName
      );
      const distance = weightedLevenshteinDistance(
        orderProductName,
        receiptProductName
      );

      // 가장 높은 유사도를 가진 항목 찾기
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = receiptItem;
        bestDistance = distance;
      }
    }

    // 유사도가 임계값 이상인 경우 매칭
    if (bestMatch && highestSimilarity >= similarityThreshold) {
      bestMatch.foundCount += orderItem.count; // 매칭된 수량 증가
      matches.push({
        order: orderItem,
        matchedReceipt: bestMatch,
        similarity: highestSimilarity,
      });
    } else {
      // 데이터 확인을 위해 특정 제품 명인 경우 bestMatch 출력
      if (orderItem.productName === "") {
        console.log(orderItem);
        console.log(
          "highestSimilarity",
          highestSimilarity,
          "bestDistance",
          bestDistance
        );
        console.log("bestMatch", bestMatch);
      }
      // 매칭되는 항목이 없는 경우
      matches.push({
        order: orderItem,
        matchedReceipt: undefined,
        similarity: undefined,
      });
    }
  }

  return matches;
}
