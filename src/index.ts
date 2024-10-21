#!/usr/bin/env node

import { Command } from "commander";
import { processOCR } from "./processors/ocr";
import { processOCRResults } from "./processors/csvConverter";
import { extractTextFromOCRResults } from "./processors/textExtractor";
import dotenv from "dotenv";
import path from "path";
import { binarizeReceipt } from "./utils/binarization";
import fs from "fs/promises";
import { splitImageAtY } from "./utils/imageProcessing";
import { processReceipt } from "./jangki";

// .env 파일 로드
dotenv.config();

const program = new Command();

program.version("1.0.0").description("엑셀 파일 처리 및 OCR 프로그램");

program
  .command("ocr <input> <outputDir>")
  .description("이미지 OCR 처리 (파일 또는 디렉토리)")
  .action(async (input: string, outputDir: string) => {
    console.log(`입력: ${input}`);
    console.log(`출력 디렉토리: ${outputDir}`);

    const apiKey = process.env.UPSTAGE_API_KEY;
    if (!apiKey) {
      console.error(
        "API 키가 설정되지 않았습니다. .env 파일에 UPSTAGE_API_KEY를 설정해주세요."
      );
      process.exit(1);
    }

    try {
      await processOCR(input, outputDir, apiKey);
      console.log("OCR 처리 완료");
    } catch (error) {
      console.error("OCR 처리 중 오류 발생:", error);
    }
  });

program
  .command("convert <inputDir> <outputDir>")
  .description("OCR 결과를 CSV로 변환")
  .action(async (inputDir: string, outputDir: string) => {
    console.log(`입력 디렉토리: ${inputDir}`);
    console.log(`출력 디렉토리: ${outputDir}`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(
        "OpenAI API 키가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 설정해주세요."
      );
      process.exit(1);
    }

    try {
      const results = await processOCRResults(inputDir, outputDir, apiKey);
      console.log("변환 완료");
      console.log("처리된 파일:");
      results.forEach((result) => {
        console.log(`${result.inputFile} -> ${result.outputFile}`);
      });
    } catch (error) {
      console.error("변환 중 오류 발생:", error);
    }
  });

program
  .command("extract <inputDir> <outputDir>")
  .description("OCR 결과에서 텍스트 추출")
  .action(async (inputDir: string, outputDir: string) => {
    console.log(`입력 디렉토리: ${inputDir}`);
    console.log(`출력 디렉토리: ${outputDir}`);

    try {
      const results = await extractTextFromOCRResults(inputDir, outputDir);
      console.log("텍스트 추출 완료");
      console.log("처리된 파일:");
      results.forEach((result) => {
        console.log(`${result.inputFile} -> ${result.outputFile}`);
      });
    } catch (error) {
      console.error("텍스트 추출 중 오류 발생:", error);
    }
  });

program
  .command("binarize <input> <output>")
  .description("영수증 이미지 이진화")
  .action(async (input: string, output: string) => {
    const resultBuffer = await binarizeReceipt(input);
    await fs.writeFile(output, resultBuffer);
  });


program
  .command("split <input> <output>")
  .description("특정 y좌표를 기준으로 이미지를 두 개로 나누기")
  .option("-y <y>", "나눌 Y 좌표", parseInt)
  .action(async (input: string, output: string, options: { y: number }) => {
    try {
      const { y } = options;
      if (y === undefined) {
        console.error("Y 좌표를 입력해주세요.");
        return;
      }
      await splitImageAtY(input, y, output);
    } catch (error) {
      console.error("이미지 나누기 중 오류 발생:", error);
    }
  });

  program
    .command("run <input>")
    .description("영수증 처리")
    .action(async (input: string) => {
      await processReceipt(input);
    });


program.parse(process.argv);
