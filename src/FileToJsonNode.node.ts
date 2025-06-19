/*
 * Convert File to JSON v5
 * ─────────────────────────────────────────────────────────
 * Универсальный кастом-нод для n8n.
 * Поддерживает: DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT,
 *               PPT, PPTX, HTML / HTM.
 * Выход: { text: "..."} либо { sheets: {...} } + metadata.
 */

import { parseStringPromise } from "xml2js";
import mammoth from "mammoth";
import * as ExcelJS from "exceljs";
import pdfParse from "pdf-parse";
import * as cheerio from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import chardet from "chardet";
import iconv from "iconv-lite";
import path from "path";
import { extractViaOfficeParser, limitExcelSheet } from "./helpers";
import {
  FileTypeError,
  FileTooLargeError,
  UnsupportedFormatError,
  EmptyFileError,
  ProcessingError,
} from "./errors";
import Papa from "papaparse";
import * as readline from "readline";
import { Readable } from "stream";
import sanitizeHtml from "sanitize-html";

// Официальные типы n8n
import { 
  IExecuteFunctions,
} from 'n8n-workflow';

// Типы n8n (заменить any на реальные типы при наличии)
// import { IExecuteFunctions } from 'n8n-workflow';

interface JsonTextResult {
  text: string;
  warning?: string;
  metadata: Record<string, unknown>;
}
interface JsonSheetResult {
  sheets: Record<string, unknown>;
  warning?: string;
  metadata: Record<string, unknown>;
}

type JsonResult = JsonTextResult | JsonSheetResult;

/**
 * Безопасная валидация и очистка имени файла
 */
function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'unknown_file';
  }
  
  // Проверка на path traversal
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new FileTypeError('Invalid file name: contains path traversal characters');
  }
  
  // Удаляем опасные символы - создаем control characters regex программно
  const dangerousChars = /[<>:"|?*]/g;
  const controlChars = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + '-' + String.fromCharCode(159) + ']', 'g');
  const sanitized = fileName.replace(dangerousChars, '_').replace(controlChars, '_');
  
  // Ограничиваем длину
  return sanitized.length > 255 ? sanitized.substring(0, 255) : sanitized;
}

/**
 * Promise pool для ограничения количества одновременных задач
 */
async function promisePool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const executing: Promise<void>[] = [];

  async function enqueue() {
    if (i >= items.length) return;
    const currentIndex = i++;
    const p = worker(items[currentIndex], currentIndex).then((res) => {
      results[currentIndex] = res;
    });
    executing.push(p.then(() => {
      executing.splice(executing.indexOf(p), 1);
    }));
    if (executing.length < concurrency) {
      await enqueue();
    } else {
      await Promise.race(executing);
      await enqueue();
    }
  }
  await enqueue();
  await Promise.all(executing);
  return results;
}

const CSV_STREAM_ROW_LIMIT = 100000; // лимит строк для перехода на потоковую обработку
const CSV_STREAM_SIZE_LIMIT = 10 * 1024 * 1024; // 10 МБ
const TXT_STREAM_SIZE_LIMIT = 10 * 1024 * 1024; // 10 МБ
const TXT_STREAM_CHAR_LIMIT = 1_000_000; // 1 млн символов

async function streamTxtStrategy(buf: Buffer): Promise<Partial<JsonResult>> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: Readable.from(buf.toString("utf8")),
      crlfDelay: Infinity,
    });
    let text = "";
    let truncated = false;
    rl.on("line", (line) => {
      if (text.length < TXT_STREAM_CHAR_LIMIT) {
        text += line + "\n";
      } else {
        truncated = true;
      }
    });
    rl.on("close", () => {
      resolve({
        text: truncated ? text.slice(0, TXT_STREAM_CHAR_LIMIT) : text,
        warning: truncated ? `Текст обрезан до ${TXT_STREAM_CHAR_LIMIT} символов` : undefined,
      });
    });
    rl.on("error", (err: Error) => reject(err));
  });
}

/**
 * Конвертация номера колонки в букву (A, B, C...)
 */
function numberToColumn(num: number): string {
  let result = '';
  while (num > 0) {
    num--; // Делаем 0-based
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

// Стратегии обработки форматов
const strategies: Record<string, (buf: Buffer, ext?: string) => Promise<Partial<JsonResult>>> = {
  doc: async (buf) => ({
    text: await extractViaOfficeParser(buf),
  }),
  docx: async (buf) => {
    const result = await mammoth.extractRawText({ buffer: buf });
    return { text: result.value };
  },
  xml: async (buf) => {
    const parsed = await parseStringPromise(buf.toString("utf8"));
    return { text: JSON.stringify(parsed, null, 2) };
  },
  xls: async (buf) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const sheets: Record<string, unknown[]> = {};
    workbook.eachSheet((worksheet, _sheetId) => {
      const sheetName = worksheet.name;
      const jsonData: unknown[] = [];
      worksheet.eachRow((row, _rowNumber) => {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const columnLetter = numberToColumn(colNumber - 1);
          rowData[columnLetter] = cell.value;
        });
        if (Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      });
      sheets[sheetName] = limitExcelSheet(jsonData);
    });
    return { sheets };
  },
  xlsx: async (buf) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const sheets: Record<string, unknown[]> = {};
    workbook.eachSheet((worksheet, _sheetId) => {
      const sheetName = worksheet.name;
      const jsonData: unknown[] = [];
      worksheet.eachRow((row, _rowNumber) => {
        const rowData: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const columnLetter = numberToColumn(colNumber - 1);
          rowData[columnLetter] = cell.value;
        });
        if (Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      });
      sheets[sheetName] = limitExcelSheet(jsonData);
    });
    return { sheets };
  },
  csv: async (buf) => {
    const encoding = chardet.detect(buf) || "utf-8";
    const decoded = iconv.decode(buf, encoding);
    if (buf.length > CSV_STREAM_SIZE_LIMIT) {
      return streamCsvStrategy(decoded);
    }
    return processExcel(decoded, "csv");
  },
  pdf: async (buf) => {
    const data = await pdfParse(buf);
    return { text: data.text };
  },
  txt: async (buf) => {
    if (buf.length > TXT_STREAM_SIZE_LIMIT) {
      return streamTxtStrategy(buf);
    }
    const encoding = chardet.detect(buf) || "utf-8";
    return { text: iconv.decode(buf, encoding) };
  },
  ppt: async (buf) => ({
    text: await extractViaOfficeParser(buf),
  }),
  pptx: async (buf) => ({
    text: await extractViaOfficeParser(buf),
  }),
  html: async (buf) => processHtml(buf),
  htm: async (buf) => processHtml(buf),
};

async function streamCsvStrategy(data: string): Promise<Partial<JsonResult>> {
  return new Promise((resolve, reject) => {
    const rows: unknown[] = [];
    let rowCount = 0;
    Papa.parse(data, {
      header: true,
      skipEmptyLines: true,
      step: (result) => {
        if (rowCount < CSV_STREAM_ROW_LIMIT) {
          rows.push(result.data);
          rowCount++;
        }
      },
      complete: () => {
        const warning = rowCount >= CSV_STREAM_ROW_LIMIT
          ? `CSV обрезан до ${CSV_STREAM_ROW_LIMIT} строк`
          : undefined;
        resolve({
          sheets: { Sheet1: rows },
          warning,
        });
      },
      error: (err: Error) => reject(err),
    });
  });
}

async function processExcel(data: Buffer | string, ext: string): Promise<Partial<JsonResult>> {
  const workbook = new ExcelJS.Workbook();
  
  if (ext === "csv") {
    // Для CSV используем Papa Parse (уже реализовано в streamCsvStrategy)
    return streamCsvStrategy(data as string);
  } else {
    // Для Excel файлов загружаем через ExcelJS
    await workbook.xlsx.load(data as Buffer);
  }
  
  const sheets: Record<string, unknown[]> = {};
  workbook.eachSheet((worksheet, _sheetId) => {
    const sheetName = worksheet.name;
    const jsonData: unknown[] = [];
    worksheet.eachRow((row, _rowNumber) => {
      const rowData: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        const columnLetter = numberToColumn(colNumber);
        rowData[columnLetter] = cell.value;
      });
      if (Object.keys(rowData).length > 0) {
        jsonData.push(rowData);
      }
    });
    sheets[sheetName] = limitExcelSheet(jsonData);
  });
  return { sheets };
}

/**
 * Обработка HTML/HTM файлов
 */
async function processHtml(buf: Buffer): Promise<Partial<JsonResult>> {
  try {
    const $ = cheerio.load(buf.toString("utf8"));
    const rawText = $("body").text().replace(/\s+/g, " ").trim();
    const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
    return { text: cleanText };
  } catch (error) {
    throw new ProcessingError(`Ошибка обработки HTML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Кастомный нод для n8n: конвертация файлов в JSON/текст
 * Поддержка DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT, PPT, PPTX, HTML/HTM
 */
class FileToJsonNode {
  description = {
    displayName: "Convert File to JSON",
    name: "convertFileToJson",
    icon: "fa:file-code-o",
    group: ["transform"],
    version: 5,
    description:
      "DOC / DOCX / XML / XLS / XLSX / CSV / PDF / TXT / PPT / PPTX / HTML → JSON|text",
    defaults: { name: "Convert File to JSON" },
    inputs: ["main"],
    outputs: ["main"],
    properties: [
      {
        displayName: "Binary Property",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        description: "Имя поля, в котором лежит бинарный файл",
      },
      {
        displayName: "Max File Size (MB)",
        name: "maxFileSize",
        type: "number",
        default: 50,
        description: "Максимальный размер файла в мегабайтах",
        typeOptions: {
          minValue: 1,
          maxValue: 100
        }
      },
      {
        displayName: "Max Concurrency",
        name: "maxConcurrency",
        type: "number",
        default: 4,
        description: "Максимальное количество одновременно обрабатываемых файлов",
        typeOptions: {
          minValue: 1,
          maxValue: 10
        }
      },
    ],
  };

  /**
   * Основной метод выполнения нода n8n
   */
  async execute(this: IExecuteFunctions): Promise<unknown[]> {
    const items = this.getInputData();
    const supported = [
      "doc",
      "docx",
      "xml",
      "xls",
      "xlsx",
      "csv",
      "pdf",
      "txt",
      "ppt",
      "pptx",
      "html",
      "htm",
    ];
    const maxFileSize = (this.getNodeParameter('maxFileSize', 0, 50) as number) * 1024 * 1024; // MB в байты
    const maxConcurrency = this.getNodeParameter('maxConcurrency', 0, 4) as number;

    const processItem = async (item: unknown, i: number) => {
      const prop = this.getNodeParameter("binaryPropertyName", i, "data");
      // --- Валидация входных данных ---
      if (!item || typeof item !== "object")
        throw new FileTypeError(`Item #${i} не является объектом`);
      
      const itemObj = item as Record<string, unknown>;
      if (!itemObj.binary || typeof itemObj.binary !== "object")
        throw new FileTypeError(`Item #${i} не содержит binary-данных`);
      
      const binary = itemObj.binary as Record<string, unknown>;
      if (!binary[prop as string])
        throw new FileTypeError(`Binary property "${prop}" отсутствует (item ${i})`);
      
      const binaryProp = binary[prop as string] as Record<string, unknown>;
      if (!binaryProp.fileName || typeof binaryProp.fileName !== "string")
        throw new FileTypeError(`Файл не содержит корректного имени (item ${i})`);
      
      const buf = await this.helpers.getBinaryDataBuffer(i, prop as string);
      if (!Buffer.isBuffer(buf) || buf.length === 0)
        throw new EmptyFileError("Файл пуст или не содержит данных");
      if (buf.length > maxFileSize)
        throw new FileTooLargeError("Файл слишком большой (максимум 50 MB)");
      // --- Конец валидации ---
      const name = sanitizeFileName(binaryProp.fileName ?? "");
      let ext = path.extname(name).slice(1).toLowerCase();

      /* ── autodetect ── */
      if (!ext || !supported.includes(ext)) {
        try {
          const ft = await fileTypeFromBuffer(buf);
          if (ft?.ext && supported.includes(ft.ext)) {
            ext = ft.ext;
          } else {
            throw new UnsupportedFormatError(`Неподдерживаемый тип файла: ${ext || "unknown"}`);
          }
        } catch (error) {
          this.logger?.warn('File type detection failed', { 
            fileName: name, 
            error: error instanceof Error ? error.message : String(error) 
          });
          throw new UnsupportedFormatError(`Неподдерживаемый тип файла: ${ext || "unknown"}`);
        }
      }

      this.logger?.info("ConvertFileToJSON →", {
        file: name || "[no-name]",
        ext,
        size: buf.length,
      });

      let json: Partial<JsonResult> = {};
      const startTime = performance.now();
      
      try {
        if (!strategies[ext]) {
          throw new UnsupportedFormatError(`Формат "${ext}" не поддерживается`);
        }
        json = await strategies[ext](buf, ext);
      } catch (e) {
        throw new ProcessingError(`Ошибка обработки ${ext.toUpperCase()}: ${(e as Error).message}`);
      }
      
      const processingTime = performance.now() - startTime;
      this.logger?.info('Processing completed', { 
        file: name, 
        size: buf.length, 
        time: `${processingTime.toFixed(2)}ms`,
        type: ext
      });

      if (
        "text" in json &&
        (!(json as JsonTextResult).text || (json as JsonTextResult).text.trim().length === 0)
      )
        throw new EmptyFileError("Файл пуст или не содержит текста");

      json.metadata = {
        fileName: sanitizeFileName(name) || null,
        fileSize: buf.length,
        fileType: ext,
        processedAt: new Date().toISOString(),
      };

      return { json };
    };

    const results = await promisePool(items, processItem, maxConcurrency);
    
    // Объединяем все результаты в один item
    return [[{
      json: {
        files: results.map(result => result.json),
        totalFiles: results.length,
        processedAt: new Date().toISOString()
      }
    }]];
  }
}

export { FileToJsonNode };
