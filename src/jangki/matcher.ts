import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import ExcelJS from "exceljs";

interface ReceiptData {
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
  
  normalizedProductName?: string;
  normalizedColor?: string;
  normalizedSize?: string;
}

export function csvToReceiptData(
  csv: any[],
  receiptName: string
): ReceiptData[] {
  // 마지막 글자가 숫자인 경우 숫자 제거
  const brandName = receiptName.replace(/\d+$/, "");
  return csv.map((row) => ({
    brandName,
    productName: row["품명"],
    color: row["색상"],
    size: row["사이즈"],
    wholesalePrice: row["단가"],
    quantity: row["수량"],
    amount: row["금액"],
    isNotSent: row["미송여부"] === "Y",
    foundCount: 0,
    normalizedProductName: normalizeProductName(row["품명"]),
    normalizedColor: normalizeColor(row["색상"]),
    normalizedSize: normalizeSize(row["사이즈"]),
  }));
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
  return input.normalize('NFC');
}

export function normalizeProductName(productName: string): string {
  productName = convertToComposite(productName);
  // 대문자로 전환
  productName = productName.toUpperCase();
  // 예시: 01.공룡맨투맨 -> 공룡맨투맨
  productName = productName.replace(/^\d+\./, "");

  // 예시: 기획)공룡맨투맨 -> 공룡맨투맨
  // 게으른 매칭 사용(첫번째 괄호만 제거)
  productName = productName.replace(/.*?\)/, "");

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
    메란: "메란지",
    멜란지: "메란지",
    밤색: "브라운",

    // 오타 수정
    덕색: "먹색",
  };
  const exactDictionary: { [key: string]: string } = {
    아이: "아이보리",
    차콜: "챠콜",
    연핑: "연핑크",
    회: "그레이",
    검: "블랙",
    연회: "연회색",
    연베: "연베이지",
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

  constructor(excelData: ExcelJS.Workbook) {
    this.excelData = excelData;
    this.firstSheet = this.excelData.worksheets[0];
    this.columns = this.firstSheet.getRow(1).values as ExcelJS.CellValue[];
    this.columnCount = this.firstSheet.getRow(1).values.length as number;
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
}

export async function run(csvPath: string, excelPath: string) {
  const csvs = await loadCSVFilesFromDirectory(csvPath);
  const excelData = await readExcelFile(excelPath);
  const orderSheet = new OrderSheet(excelData);
  const totalReceiptData: ReceiptData[] = [];
  for (const csv of csvs) {
    const { fileName, data } = csv;
    const receiptName = fileName.replace(".csv", "");
    const receiptData = csvToReceiptData(data, receiptName);
    orderSheet.addSheet(receiptName, receiptDataToSheetData(receiptData));
    totalReceiptData.push(...receiptData);
  }

  const brandNameColumnNumber = orderSheet.findOrAddColumn("브랜드");
  const productNameColumnNumber = orderSheet.findOrAddColumn("상품명");
  const colorColumnNumber = orderSheet.findOrAddColumn("색상");
  const sizeColumnNumber = orderSheet.findOrAddColumn("사이즈");
  const countColumnNumber = orderSheet.findOrAddColumn("수량");

  // 매칭 여부 칼럼을 찾고 없는 경우 첫번째 Row끝에 추가
  let matchingColumnNumber = orderSheet.findOrAddColumn("매칭여부");
  // 미송여부 칼럼을 찾고 없는 경우 끝에 추가
  let isNotSentColumnNumber = orderSheet.findOrAddColumn("미송여부");
  //  normalizeProductName 찾고 없는 경우 끝에 추가
  let normalizeProductNameColumnNumber =
    orderSheet.findOrAddColumn("Nor상품명");
  let normalizeColorColumnNumber = orderSheet.findOrAddColumn("Nor색상");
  let normalizeSizeColumnNumber = orderSheet.findOrAddColumn("Nor사이즈");
  console.log(
    "matchingColumnNumber",
    matchingColumnNumber,
    "isNotSentColumnNumber",
    isNotSentColumnNumber,
    "normalizeProductNameColumnNumber",
    normalizeProductNameColumnNumber,
    "normalizeColorColumnNumber",
    normalizeColorColumnNumber,
    "normalizeSizeColumnNumber",
    normalizeSizeColumnNumber
  );

  for (const row of orderSheet.firstSheet.getRows(
    2,
    orderSheet.firstSheet.rowCount - 1
  ) ?? []) {
    const brandName = convertToComposite(row.getCell(brandNameColumnNumber).value as string);
    const productName = row.getCell(productNameColumnNumber).value as string;
    const color = row.getCell(colorColumnNumber).value as string;
    const size = row.getCell(sizeColumnNumber).value as string;
    const count = parseInt(row.getCell(countColumnNumber).value as string);
    const isMatching =
      row.getCell(matchingColumnNumber).value?.toString().toUpperCase() ===
      "TRUE";

    const normalizedProductName = normalizeProductName(productName);
    const normalizedColor = normalizeColor(color);
    const normalizedSize = normalizeSize(size);
    // row 번호가 100번마다 출력
    if (row.number % 100 === 0) {
      console.log(`Processing row ${row.number}`);
    }
    // receiptData에서 해당하는 데이터 찾기
    const foundReceiptData = totalReceiptData.find(
      (data) =>
        convertToComposite(data.brandName) === brandName &&
        data.normalizedProductName === normalizedProductName &&
        data.normalizedColor === normalizedColor &&
        data.normalizedSize === normalizedSize
    );
    // 베베데일리 양말 찾아보기
    if (productName == "베베데일리양말" && color == "겨자") {
      console.log({
        brandName,
        normalizedProductName,
        normalizedColor,
        normalizedSize,
      });
      console.log(
        totalReceiptData.find((data) => data.productName == productName)
      );
      console.log("foundReceiptData", foundReceiptData);
    }

    if (foundReceiptData) {
      // 찾은 데이터가 중복으로 찾아지는 경우 예외 처리
      if (foundReceiptData.foundCount + count > foundReceiptData.quantity) {
        console.error(
          `Found receipt data: ${foundReceiptData.brandName} ${foundReceiptData.productName} ${foundReceiptData.color} ${foundReceiptData.size} ${foundReceiptData.quantity} ${foundReceiptData.foundCount} ${count}`
        );
      }
      foundReceiptData.foundCount += count;

      // 데이터를 찾은 경우 첫번째 시트의 매칭여부 칼럼에 true 추가
      row.getCell(matchingColumnNumber).value = true;
      // 미송 여부 칼럼에 미송 여부 추가
      row.getCell(isNotSentColumnNumber).value = foundReceiptData.isNotSent;
    }
    // 일반화된 이름 칼럼에 일반화된 이름 추가
    row.getCell(normalizeProductNameColumnNumber).value = normalizedProductName;
    // 일반화된 색상 칼럼에 일반화된 색상 추가
    row.getCell(normalizeColorColumnNumber).value = normalizedColor;
    // 일반화된 사이즈 칼럼에 일반화된 사이즈 추가
    row.getCell(normalizeSizeColumnNumber).value = normalizedSize;
  }
  // 매칭된 건만 모아서 시트 추가
  const matchingReceiptData = totalReceiptData.filter(
    (data) => data.foundCount > 0
  );
  addSheetToExcel(excelData, "매칭된 건", matchingReceiptData);
  console.log(`Matching count: ${matchingReceiptData.length}`);

  // 매칭안된 건만 모아서 시트 추가
  const notMatchingReceiptData = totalReceiptData.filter(
    (data) => data.foundCount === 0
  );
  addSheetToExcel(excelData, "매칭안된 건", notMatchingReceiptData);
  console.log(`Not matching count: ${notMatchingReceiptData.length}`);
  const newExcelPath = `${excelPath.replace(".xlsx", "")}_new.xlsx`;
  await saveExcelFile(excelData, newExcelPath);
  return;
}


