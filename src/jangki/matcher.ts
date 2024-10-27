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
  }));
}

function receiptDataToSheetData(receiptData: ReceiptData[]): any[] {
  return receiptData.map((data) => ({
    브랜드: data.brandName,
    상품명: data.productName,
    색상: data.color,
    사이즈: data.size,
    수량: data.quantity,
    매칭여부: data.foundCount > 0,
    미송여부: data.isNotSent,
    상품명2: data.normalizedProductName,
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

      console.log(`Loading CSV file: ${filePath}`);

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
  console.log(`Added sheet: ${sheetName}`);
}

export async function saveExcelFile(
  workbook: ExcelJS.Workbook,
  filePath: string
): Promise<void> {
  await workbook.xlsx.writeFile(filePath);
  console.log(`Saved Excel file: ${filePath}`);
}

export function normalizeProductName(productName: string): string {
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
    t: "티",
    mtm: "맨투맨",
    pt: "팬츠",
    jp: "점퍼",
    jk: "자켓",
  };
  // key의 길이순으로 정렬 길이 내림차순
  const sortedPostfixDictionary = Object.keys(nameDictionary).sort(
    (a, b) => b.length - a.length
  );
  // 대문자 소문자 모두 매칭₩
  for (const postfix of sortedPostfixDictionary) {
    productName = productName.replace(postfix.toLowerCase(), nameDictionary[postfix]);
    productName = productName.replace(postfix.toUpperCase(), nameDictionary[postfix]);
  }

  return productName;
}

function normalizeColor(color: string): string {
  // 공백 제거
  color = color.replace(/\s+/g, "");
  // 특수문자 제거
  color = color.replace(/[^\w가-힣]+/g, "");

  return color;
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
  let normalizeProductNameColumnNumber = orderSheet.findOrAddColumn(
    "상품명2"
  );
  console.log(
    "matchingColumnNumber",
    matchingColumnNumber,
    "isNotSentColumnNumber",
    isNotSentColumnNumber,
    "normalizeProductNameColumnNumber",
    normalizeProductNameColumnNumber
  );

  for (const row of orderSheet.firstSheet.getRows(2, orderSheet.firstSheet.rowCount - 1) ?? []) {
    const brandName = row.getCell(brandNameColumnNumber).value as string;
    const productName = row.getCell(productNameColumnNumber).value as string;
    const color = row.getCell(colorColumnNumber).value as string;
    const size = row.getCell(sizeColumnNumber).value as string;
    const count = parseInt(row.getCell(countColumnNumber).value as string);

    const normalizedProductName = normalizeProductName(productName);

    // row 번호가 100번마다 출력
    if (row.number % 100 === 0) {
      console.log(`Processing row ${row.number}`);
    }
    // receiptData에서 해당하는 데이터 찾기
    const foundReceiptData = totalReceiptData.find(
      (data) =>
        data.brandName === brandName &&
        data.normalizedProductName === normalizedProductName &&
        data.color === color &&
        data.size === size &&
        row.getCell(matchingColumnNumber).value !== true
    );
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
  }
  // 매칭된 건만 모아서 시트 추가
  const matchingReceiptData = totalReceiptData.filter((data) => data.foundCount > 0);
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
