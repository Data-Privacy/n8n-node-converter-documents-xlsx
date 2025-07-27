/*
 * Convert File to JSON v5
 * ─────────────────────────────────────────────────────────
 * Универсальный кастом-нод для n8n.
 * Поддерживает: DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT,
 *               PPT, PPTX, HTML / HTM, ODT, ODP, ODS, JSON.
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

interface ProcessingOptions {
  includeOriginalRowNumbers?: boolean;
}

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

/**
 * Функция для нормализации JSON объектов
 * Преобразует многоуровневые структуры в плоский объект
 */
function flattenJsonObject(obj: unknown, prefix: string = '', result: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return result;
  }

  if (typeof obj !== 'object' || obj instanceof Date || obj instanceof Buffer) {
    result[prefix || 'value'] = obj;
    return result;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const key = prefix ? `${prefix}[${index}]` : `item_${index}`;
      flattenJsonObject(item, key, result);
    });
    return result;
  }

  Object.keys(obj).forEach(key => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    flattenJsonObject((obj as Record<string, unknown>)[key], newKey, result);
  });

  return result;
}

// Интерфейсы для типизации YML структур
interface YmlCurrency {
  $: { id: string; rate?: string };
  id?: string;
  rate?: string;
}

interface YmlCategory {
  $: { id: string; parentId?: string };
  _?: string;
  id?: string;
  name?: string;
  parentId?: string;
}

interface YmlOffer {
  $: { id: string; available?: string };
  id?: string;
  available?: string;
  name?: string | string[];
  url?: string | string[];
  price?: string | string[];
  currencyId?: string | string[];
  categoryId?: string | string[];
  vendor?: string | string[];
  description?: string | string[];
  oldprice?: string | string[];
  vendorCode?: string | string[];
  barcode?: string | string[];
  sales_notes?: string | string[];
  delivery?: string | string[];
  pickup?: string | string[];
  picture?: string | string[];
  param?: Array<{ $: { name: string; unit?: string }; _?: string; name?: string; value?: string; unit?: string }>;
}

interface YmlShop {
  name?: string | string[];
  company?: string | string[];
  url?: string | string[];
  currencies?: Array<{ currency: YmlCurrency | YmlCurrency[] }>;
  categories?: Array<{ category: YmlCategory | YmlCategory[] }>;
  offers?: Array<{ offer: YmlOffer | YmlOffer[] }>;
}

interface YmlCatalog {
  yml_catalog: {
    $?: { date?: string };
    date?: string;
    shop: YmlShop | YmlShop[];
  };
}

/**
 * Обработка YML файлов Яндекс Маркета
 * Преобразует XML структуру в удобный для анализа JSON формат
 */
function processYandexMarketYml(parsed: YmlCatalog): Partial<JsonResult> {
  try {
    const catalog = parsed.yml_catalog;
    const shop = Array.isArray(catalog.shop) ? catalog.shop[0] : catalog.shop;
    
    // Извлекаем основную информацию о магазине
    const shopInfo = {
      name: shop.name?.[0] || shop.name || 'Unknown Shop',
      company: shop.company?.[0] || shop.company || '',
      url: shop.url?.[0] || shop.url || '',
      date: catalog.$?.date || catalog.date || ''
    };
    
    // Обрабатываем валюты
    const currencies = [];
    if (shop.currencies && shop.currencies[0] && shop.currencies[0].currency) {
      const currencyList = Array.isArray(shop.currencies[0].currency) 
        ? shop.currencies[0].currency 
        : [shop.currencies[0].currency];
      
      currencies.push(...currencyList.map((curr: YmlCurrency) => ({
        id: curr.$.id || curr.id,
        rate: curr.$.rate || curr.rate || '1'
      })));
    }
    
    // Обрабатываем категории
    const categories = [];
    if (shop.categories && shop.categories[0] && shop.categories[0].category) {
      const categoryList = Array.isArray(shop.categories[0].category) 
        ? shop.categories[0].category 
        : [shop.categories[0].category];
      
      categories.push(...categoryList.map((cat: YmlCategory) => ({
        id: cat.$.id || cat.id,
        name: cat._ || cat.name || String(cat),
        parentId: cat.$.parentId || cat.parentId || null
      })));
    }
    
    // Обрабатываем товары (offers)
    const offers = [];
    if (shop.offers && shop.offers[0] && shop.offers[0].offer) {
      const offerList = Array.isArray(shop.offers[0].offer) 
        ? shop.offers[0].offer 
        : [shop.offers[0].offer];
      
      offers.push(...offerList.map((offer: YmlOffer) => {
        const offerData: Record<string, unknown> = {
          id: offer.$.id || offer.id,
          available: offer.$.available || offer.available || 'true',
          name: offer.name?.[0] || offer.name || '',
          url: offer.url?.[0] || offer.url || '',
          price: offer.price?.[0] || offer.price || '',
          currencyId: offer.currencyId?.[0] || offer.currencyId || '',
          categoryId: offer.categoryId?.[0] || offer.categoryId || '',
          vendor: offer.vendor?.[0] || offer.vendor || '',
          description: offer.description?.[0] || offer.description || ''
        };
        
        // Добавляем опциональные поля
        if (offer.oldprice) offerData.oldprice = offer.oldprice[0] || offer.oldprice;
        if (offer.vendorCode) offerData.vendorCode = offer.vendorCode[0] || offer.vendorCode;
        if (offer.barcode) offerData.barcode = offer.barcode[0] || offer.barcode;
        if (offer.sales_notes) offerData.sales_notes = offer.sales_notes[0] || offer.sales_notes;
        if (offer.delivery) offerData.delivery = offer.delivery[0] || offer.delivery;
        if (offer.pickup) offerData.pickup = offer.pickup[0] || offer.pickup;
        
        // Обрабатываем картинки
        if (offer.picture) {
          const pictures = Array.isArray(offer.picture) ? offer.picture : [offer.picture];
          offerData.pictures = pictures.map((pic: string) => pic || '');
        }
        
        // Обрабатываем параметры
        if (offer.param) {
          const params = Array.isArray(offer.param) ? offer.param : [offer.param];
          offerData.parameters = params.map((param) => ({
            name: param.$.name || param.name,
            value: param._ || param.value || String(param),
            unit: param.$.unit || param.unit || null
          }));
        }
        
        return offerData;
      }));
    }
    
    // Формируем итоговую структуру
    const result = {
      yandex_market_catalog: {
        shop_info: shopInfo,
        currencies: currencies,
        categories: categories,
        offers: offers,
        statistics: {
          total_categories: categories.length,
          total_offers: offers.length,
          available_offers: offers.filter(o => o.available === 'true' || o.available === true).length,
          unavailable_offers: offers.filter(o => o.available === 'false' || o.available === false).length
        }
      }
    };
    
    return { 
      text: JSON.stringify(result, null, 2),
      warning: offers.length > 1000 ? `Большой каталог: ${offers.length} товаров` : undefined
    };
  } catch (error) {
    throw new ProcessingError(`YML catalog processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Стратегии обработки форматов
const strategies: Record<string, (buf: Buffer, ext?: string, options?: ProcessingOptions) => Promise<Partial<JsonResult>>> = {
  doc: async (buf) => {
    try {
      // Проверяем, является ли это старым DOC файлом (CFB формат)
      const signature = buf.slice(0, 8);
      const cfbSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
      
      if (signature.equals(cfbSignature)) {
        throw new UnsupportedFormatError(
          "Старые DOC файлы (Word 97-2003) не поддерживаются. " +
          "Пожалуйста, сохраните файл в формате DOCX (Word 2007+) и попробуйте снова."
        );
      }
      
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      if (error instanceof UnsupportedFormatError) {
        throw error;
      }
      
      // Если это ошибка officeparser о CFB файлах, выдаем понятное сообщение
      if (error instanceof Error && error.message.includes('cfb files')) {
        throw new UnsupportedFormatError(
          "Старые DOC файлы (Word 97-2003) не поддерживаются. " +
          "Пожалуйста, сохраните файл в формате DOCX (Word 2007+) и попробуйте снова."
        );
      }
      
      throw new ProcessingError(`DOC processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  docx: async (buf) => {
    // Используем officeparser вместо mammoth для единообразия
    try {
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      // Fallback на mammoth если officeparser не справился
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        return { text: result.value };
      } catch {
        throw new ProcessingError(`DOCX processing error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  },
  xml: async (buf) => {
    const parsed = await parseStringPromise(buf.toString("utf8"));
    return { text: JSON.stringify(parsed, null, 2) };
  },
  yml: async (buf) => {
    try {
      const xmlContent = buf.toString("utf8");
      const parsed = await parseStringPromise(xmlContent);
      
      // Проверяем, является ли это YML файлом Яндекс Маркета
      if (parsed.yml_catalog && parsed.yml_catalog.shop) {
        return processYandexMarketYml(parsed);
      }
      
      // Если это обычный YML/XML, обрабатываем как XML
      return { text: JSON.stringify(parsed, null, 2) };
    } catch (error) {
      throw new ProcessingError(`YML processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  json: async (buf) => {
    try {
      const encoding = chardet.detect(buf) || "utf-8";
      const jsonString = iconv.decode(buf, encoding);
      const parsed = JSON.parse(jsonString);
      
      // Если это простой объект, нормализуем его
      if (typeof parsed === 'object' && parsed !== null) {
        const flattened = flattenJsonObject(parsed);
        return { 
          text: JSON.stringify(flattened, null, 2),
          warning: Object.keys(flattened).length > Object.keys(parsed).length ? 
            "Многоуровневая структура JSON была преобразована в плоский объект" : undefined
        };
      }
      
      // Если это массив или примитив, возвращаем как есть
      return { text: JSON.stringify(parsed, null, 2) };
    } catch (error) {
      throw new ProcessingError(`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  odt: async (buf) => {
    try {
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      throw new ProcessingError(`ODT processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  odp: async (buf) => {
    try {
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      throw new ProcessingError(`ODP processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  ods: async (buf) => {
    try {
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      throw new ProcessingError(`ODS processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  xlsx: async (buf, ext, options) => {
    // Пробуем сначала officeparser, затем ExcelJS как fallback
    try {
      const _text = await extractViaOfficeParser(buf);
      // officeparser возвращает текст, но для Excel нам нужна структура
      // Поэтому используем ExcelJS для полной функциональности
      throw new Error("Use ExcelJS for structured data");
    } catch {
      // Используем ExcelJS для полной поддержки структуры Excel
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buf);
      const sheets: Record<string, unknown[]> = {};
      workbook.eachSheet((worksheet, _sheetId) => {
        const sheetName = worksheet.name;
        const jsonData: unknown[] = [];
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          const rowData: Record<string, unknown> = {};
          let hasData = false;
          
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const columnLetter = numberToColumn(colNumber);
            if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
              rowData[columnLetter] = cell.value;
              hasData = true;
            }
          });
          
          // Only include rows that have actual data
          if (hasData) {
            if (options?.includeOriginalRowNumbers) {
              rowData.origRow = rowNumber;
            }
            jsonData.push(rowData);
          }
        });
        sheets[sheetName] = limitExcelSheet(jsonData);
      });
      return { sheets };
    }
  },
  csv: async (buf, ext, options) => {
    const encoding = chardet.detect(buf) || "utf-8";
    const decoded = iconv.decode(buf, encoding);
    if (buf.length > CSV_STREAM_SIZE_LIMIT) {
      return streamCsvStrategy(decoded);
    }
    return processExcel(decoded, "csv", options);
  },
  pdf: async (buf) => {
    // Используем officeparser вместо pdf-parse (officeparser использует pdf.js с 2024/05/06)
    try {
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      // Fallback на pdf-parse если officeparser не справился
      try {
        const data = await pdfParse(buf);
        return { text: data.text };
      } catch {
        throw new ProcessingError(`PDF processing error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  },
  txt: async (buf) => {
    if (buf.length > TXT_STREAM_SIZE_LIMIT) {
      return streamTxtStrategy(buf);
    }
    const encoding = chardet.detect(buf) || "utf-8";
    return { text: iconv.decode(buf, encoding) };
  },
  ppt: async (buf) => {
    try {
      // Проверяем, является ли это старым PPT файлом (CFB формат)
      const signature = buf.slice(0, 8);
      const cfbSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
      
      if (signature.equals(cfbSignature)) {
        throw new UnsupportedFormatError(
          "Старые PPT файлы (PowerPoint 97-2003) не поддерживаются. " +
          "Пожалуйста, сохраните файл в формате PPTX (PowerPoint 2007+) и попробуйте снова."
        );
      }
      
      return { text: await extractViaOfficeParser(buf) };
    } catch (error) {
      if (error instanceof UnsupportedFormatError) {
        throw error;
      }
      
      // Если это ошибка officeparser о CFB файлах, выдаем понятное сообщение
      if (error instanceof Error && error.message.includes('cfb files')) {
        throw new UnsupportedFormatError(
          "Старые PPT файлы (PowerPoint 97-2003) не поддерживаются. " +
          "Пожалуйста, сохраните файл в формате PPTX (PowerPoint 2007+) и попробуйте снова."
        );
      }
      
      throw new ProcessingError(`PPT processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
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
          ? `CSV truncated to ${CSV_STREAM_ROW_LIMIT} rows`
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

async function processExcel(data: Buffer | string, ext: string, options?: ProcessingOptions): Promise<Partial<JsonResult>> {
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
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowData: Record<string, unknown> = {};
      let hasData = false;
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const columnLetter = numberToColumn(colNumber);
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          rowData[columnLetter] = cell.value;
          hasData = true;
        }
      });
      
      // Only include rows that have actual data
      if (hasData) {
        if (options?.includeOriginalRowNumbers) {
          rowData.origRow = rowNumber;
        }
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
    throw new ProcessingError(`HTML processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Custom n8n node: convert files to JSON/text
 * Supports DOCX, XML, YML, XLSX, CSV, PDF, TXT, PPTX, HTML
 */
class FileToJsonNode {
  description = {
    displayName: "Convert File to JSON",
    name: "convertFileToJson",
    icon: "file:icon.svg",
    group: ["transform"],
    version: 5,
    description:
      "DOCX / XML / YML / XLSX / CSV / PDF / TXT / PPTX / HTML → JSON|text",
    defaults: { name: "Convert File to JSON" },
    inputs: ["main"],
    outputs: ["main"],
    properties: [
      {
        displayName: "Binary Property",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        description: "Name of the binary property that contains the file",
      },
      {
        displayName: "Max File Size (MB)",
        name: "maxFileSize",
        type: "number",
        default: 50,
        description: "Maximum file size in megabytes",
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
        description: "Maximum number of files processed concurrently",
        typeOptions: {
          minValue: 1,
          maxValue: 10
        }
      },
      {
        displayName: "Include Original Row Numbers",
        name: "includeOriginalRowNumbers",
        type: "boolean",
        default: false,
        description: "For Excel files, include the original row number from the source file in the 'origRow' property",
        displayOptions: {
          show: {
            // Only show this option when processing files that could be Excel
          }
        }
      },
    ],
  };

  /**
   * Main execution method for n8n node
   */
  async execute(this: IExecuteFunctions): Promise<unknown[]> {
    const items = this.getInputData();
    const supported = [
      "doc",
      "docx",
      "xml",
      "yml",
      "xlsx",
      "csv",
      "pdf",
      "txt",
      "pptx",
      "html",
      "htm",
      "odt",
      "odp",
      "ods",
      "json",
    ];
    const maxFileSize = (this.getNodeParameter('maxFileSize', 0, 50) as number) * 1024 * 1024; // MB в байты
    const maxConcurrency = this.getNodeParameter('maxConcurrency', 0, 4) as number;
    const includeOriginalRowNumbers = this.getNodeParameter('includeOriginalRowNumbers', 0, false) as boolean;

    const processItem = async (item: unknown, i: number) => {
      const prop = this.getNodeParameter("binaryPropertyName", i, "data");
              // --- Input data validation ---
      if (!item || typeof item !== "object")
        throw new FileTypeError(`Item #${i} is not an object`);
      
      const itemObj = item as Record<string, unknown>;
      if (!itemObj.binary || typeof itemObj.binary !== "object")
        throw new FileTypeError(`Item #${i} does not contain binary data`);
      
      const binary = itemObj.binary as Record<string, unknown>;
      if (!binary[prop as string])
        throw new FileTypeError(`Binary property "${prop}" is missing (item ${i})`);
      
      const binaryProp = binary[prop as string] as Record<string, unknown>;
      if (!binaryProp.fileName || typeof binaryProp.fileName !== "string")
        throw new FileTypeError(`File does not contain a valid name (item ${i})`);
      
      const buf = await this.helpers.getBinaryDataBuffer(i, prop as string);
      if (!Buffer.isBuffer(buf) || buf.length === 0)
        throw new EmptyFileError("File is empty or contains no data");
      if (buf.length > maxFileSize)
        throw new FileTooLargeError("File is too large (maximum 50 MB)");
              // --- End of validation ---
      const name = sanitizeFileName(binaryProp.fileName ?? "");
      let ext = path.extname(name).slice(1).toLowerCase();

      /* ── autodetect ── */
      if (!ext || !supported.includes(ext)) {
        try {
          const ft = await fileTypeFromBuffer(buf);
          if (ft?.ext && supported.includes(ft.ext)) {
            ext = ft.ext;
          } else {
            throw new UnsupportedFormatError(`Unsupported file type: ${ext || "unknown"}`);
          }
        } catch (error) {
          this.logger?.warn('File type detection failed', { 
            fileName: name, 
            error: error instanceof Error ? error.message : String(error) 
          });
          throw new UnsupportedFormatError(`Unsupported file type: ${ext || "unknown"}`);
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
          throw new UnsupportedFormatError(`Format "${ext}" is not supported`);
        }
        const options: ProcessingOptions = {
          includeOriginalRowNumbers
        };
        json = await strategies[ext](buf, ext, options);
      } catch (e) {
        throw new ProcessingError(`${ext.toUpperCase()} processing error: ${(e as Error).message}`);
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
        throw new EmptyFileError("File is empty or contains no text");

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
