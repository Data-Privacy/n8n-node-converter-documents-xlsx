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
import textract from "textract";
import xlsx from "xlsx";
import pdfParse from "pdf-parse";
import cheerio from "cheerio";
import { fileTypeFromBuffer } from "file-type";
import chardet from "chardet";
import iconv from "iconv-lite";
import path from "path";
import { extractViaTextract, limitExcelSheet } from "./helpers";
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

// Типы n8n (заменить any на реальные типы при наличии)
// import { IExecuteFunctions } from 'n8n-workflow';

// Временные объявления для this (заменить на реальные типы n8n при интеграции)
interface N8nThis {
  getInputData: () => any[];
  getNodeParameter: (name: string, itemIndex: number, defaultValue?: any) => any;
  helpers: { getBinaryDataBuffer: (itemIndex: number, propertyName: string) => Promise<Buffer> };
  logger?: { info: (...args: any[]) => void };
}

interface JsonTextResult {
  text: string;
  warning?: string;
  metadata: Record<string, any>;
}
interface JsonSheetResult {
  sheets: Record<string, any>;
  warning?: string;
  metadata: Record<string, any>;
}

type JsonResult = JsonTextResult | JsonSheetResult;

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

// Стратегии обработки форматов
const strategies: Record<string, (buf: Buffer, ext: string) => Promise<Partial<JsonResult>>> = {
  docx: async (buf) => {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value };
  },
  doc: async (buf) => ({
    text: await extractViaTextract(buf, "application/msword", textract),
  }),
  xml: async (buf) =>
    (await parseStringPromise(buf.toString("utf8"), { explicitArray: false })) as JsonResult,
  xls: async (buf) => processExcel(buf, "xls"),
  xlsx: async (buf) => processExcel(buf, "xlsx"),
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
    text: await extractViaTextract(buf, "application/vnd.ms-powerpoint", textract),
  }),
  pptx: async (buf) => ({
    text: await extractViaTextract(buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation", textract),
  }),
  html: async (buf) => {
    const $ = cheerio.load(buf.toString("utf8"));
    const rawText = $("body").text().replace(/\s+/g, " ").trim();
    const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
    return { text: cleanText };
  },
  htm: async (buf) => {
    const $ = cheerio.load(buf.toString("utf8"));
    const rawText = $("body").text().replace(/\s+/g, " ").trim();
    const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
    return { text: cleanText };
  },
};

async function streamCsvStrategy(data: string): Promise<Partial<JsonResult>> {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    let truncated = false;
    let totalRows = 0;
    Papa.parse(data, {
      header: true,
      step: (result) => {
        if (rows.length < CSV_STREAM_ROW_LIMIT) {
          rows.push(result.data);
        } else {
          truncated = true;
        }
        totalRows++;
      },
      complete: () => {
        resolve({
          sheets: { Sheet1: truncated ? { data: rows, truncated, totalRows } : rows },
        });
      },
      error: (err: Error) => reject(err),
    });
  });
}

async function processExcel(data: Buffer | string, ext: string): Promise<Partial<JsonResult>> {
  const wb =
    ext === "csv"
      ? xlsx.read(data, { type: "string", cellDates: true })
      : xlsx.read(data, { type: "buffer", cellDates: true });
  const sheets: Record<string, any> = {};
  wb.SheetNames.forEach((s) => {
    const js = xlsx.utils.sheet_to_json(wb.Sheets[s], {
      defval: null,
      raw: false,
      dateNF: "yyyy-mm-dd",
    });
    sheets[s] = limitExcelSheet(js);
  });
  return { sheets };
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
    ],
  };

  /**
   * Основной метод выполнения нода n8n
   * @this {import('n8n-workflow').IExecuteFunctions}
   * @returns {Promise<Array>} - массив результатов для n8n
   */
  async execute(this: N8nThis): Promise<any[]> {
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
    const maxFileSize = 50 * 1024 * 1024; // 50 MB
    const maxConcurrency = 4; // Можно вынести в параметры нода

    const processItem = async (item: any, i: number) => {
      const prop = this.getNodeParameter("binaryPropertyName", i, "data");
      // --- Валидация входных данных ---
      if (!item || typeof item !== "object")
        throw new FileTypeError(`Item #${i} не является объектом`);
      if (!item.binary || typeof item.binary !== "object")
        throw new FileTypeError(`Item #${i} не содержит binary-данных`);
      if (!item.binary[prop])
        throw new FileTypeError(`Binary property "${prop}" отсутствует (item ${i})`);
      if (!item.binary[prop].fileName || typeof item.binary[prop].fileName !== "string")
        throw new FileTypeError(`Файл не содержит корректного имени (item ${i})`);
      const buf = await this.helpers.getBinaryDataBuffer(i, prop);
      if (!Buffer.isBuffer(buf) || buf.length === 0)
        throw new EmptyFileError("Файл пуст или не содержит данных");
      if (buf.length > maxFileSize)
        throw new FileTooLargeError("Файл слишком большой (максимум 50 MB)");
      // --- Конец валидации ---
      const name = item.binary[prop].fileName ?? "";
      let ext = path.extname(name).slice(1).toLowerCase();

      /* ── autodetect ── */
      if (!ext || !supported.includes(ext)) {
        const ft = await fileTypeFromBuffer(buf).catch(() => null);
        if (ft?.ext && supported.includes(ft.ext)) ext = ft.ext;
        else throw new UnsupportedFormatError(`Неподдерживаемый тип файла: ${ext || "unknown"}`);
      }

      this.logger?.info("ConvertFileToJSON →", {
        file: name || "[no-name]",
        ext,
        size: buf.length,
      });

      let json: Partial<JsonResult> = {};
      try {
        if (!strategies[ext]) {
          throw new UnsupportedFormatError(`Формат "${ext}" не поддерживается`);
        }
        json = await strategies[ext](buf, ext);
      } catch (e) {
        throw new ProcessingError(`Ошибка обработки ${ext.toUpperCase()}: ${(e as Error).message}`);
      }

      if (
        "text" in json &&
        (!(json as JsonTextResult).text || (json as JsonTextResult).text.trim().length === 0)
      )
        throw new EmptyFileError("Файл пуст или не содержит текста");

      json.metadata = {
        fileName: name || null,
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
