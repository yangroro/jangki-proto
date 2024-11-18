#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import { processReceipt } from "./jangki";
import { run } from "./jangki/matcher";
import fs from "fs";
import path from "path";
import { runWithConcurrency } from "./utils/concurrency";
// .env 파일 로드
dotenv.config();

const program = new Command();

program.version("1.0.0").description("엑셀 파일 처리 및 OCR 프로그램");

program
  .command("run <input>")
  .description("영수증 처리")
  .action(async (input: string) => {
    const targetDir = "./4o";
    if (!fs.existsSync(input)) {
      console.error(`${input} 경로가 존재하지 않습니다.`);
      return;
    }
    const receiptFiles: string[] = [];
    if (fs.lstatSync(input).isDirectory()) {
      for (const file of fs.readdirSync(input)) {
        if (file.endsWith(".jpg") || file.endsWith(".png")) {
          const fullPath = path.join(input, file);
          receiptFiles.push(fullPath);
        }
      }
    } else {
      receiptFiles.push(input);
    }
    // 이미 처리된 영수증은 제외
    const processedReceipts = receiptFiles.filter((file) => {
      const filename = file.split("/").pop()?.replace(".png", "");
      return fs.existsSync(`${targetDir}/${filename}.csv`);
    });
    console.log(
      "이미 처리된 영수증:",
      processedReceipts.map((file) => file.split("/").pop())
    );
    for (const file of processedReceipts) {
      receiptFiles.splice(receiptFiles.indexOf(file), 1);
    }
    console.log(
      "처리할 영수증:",
      receiptFiles.map((file) => file.split("/").pop())
    );
    const chunkSize = 2;

    await runWithConcurrency<void>(
      receiptFiles.map((file) => () => processReceipt(targetDir, file)),
      chunkSize
    );
  });

program
  .command("matcher <csvPath> <excelPath>")
  .description("CSV 파일을 Excel 파일에 추가")
  .action(async (csvPath: string, excelPath: string) => {
    await run(csvPath, excelPath);
  });

program.parse(process.argv);
