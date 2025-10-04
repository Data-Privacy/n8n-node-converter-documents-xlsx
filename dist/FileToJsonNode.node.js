"use strict";
/*
 * Convert File to JSON v5
 * ─────────────────────────────────────────────────────────
 * Универсальный кастом-нод для n8n.
 * Поддерживает: DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT,
 *               PPT, PPTX, HTML / HTM, ODT, ODP, ODS, JSON.
 * Выход: { text: "..."} либо { sheets: {...} } + metadata.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileToJsonNode = void 0;
const xml2js_1 = require("xml2js");
const mammoth_1 = __importDefault(require("mammoth"));
const ExcelJS = __importStar(require("exceljs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const cheerio = __importStar(require("cheerio"));
const file_type_1 = require("file-type");
const chardet_1 = __importDefault(require("chardet"));
const iconv_lite_1 = __importDefault(require("iconv-lite"));
const path_1 = __importDefault(require("path"));
const helpers_1 = require("./helpers");
const errors_1 = require("./errors");
const papaparse_1 = __importDefault(require("papaparse"));
const readline = __importStar(require("readline"));
const stream_1 = require("stream");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
/**
 * Безопасная валидация и очистка имени файла
 */
function sanitizeFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
        return 'unknown_file';
    }
    // Проверка на path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        throw new errors_1.FileTypeError('Invalid file name: contains path traversal characters');
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
async function promisePool(items, worker, concurrency) {
    const results = [];
    let i = 0;
    const executing = [];
    async function enqueue() {
        if (i >= items.length)
            return;
        const currentIndex = i++;
        const p = worker(items[currentIndex], currentIndex).then((res) => {
            results[currentIndex] = res;
        });
        executing.push(p.then(() => {
            executing.splice(executing.indexOf(p), 1);
        }));
        if (executing.length < concurrency) {
            await enqueue();
        }
        else {
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
const TXT_STREAM_CHAR_LIMIT = 1000000; // 1 млн символов
async function streamTxtStrategy(buf) {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: stream_1.Readable.from(buf.toString("utf8")),
            crlfDelay: Infinity,
        });
        let text = "";
        let truncated = false;
        rl.on("line", (line) => {
            if (text.length < TXT_STREAM_CHAR_LIMIT) {
                text += line + "\n";
            }
            else {
                truncated = true;
            }
        });
        rl.on("close", () => {
            resolve({
                text: truncated ? text.slice(0, TXT_STREAM_CHAR_LIMIT) : text,
                warning: truncated ? `Текст обрезан до ${TXT_STREAM_CHAR_LIMIT} символов` : undefined,
            });
        });
        rl.on("error", (err) => reject(err));
    });
}
/**
 * Конвертация номера колонки в букву (A, B, C...)
 */
function numberToColumn(num) {
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
function flattenJsonObject(obj, prefix = '', result = {}) {
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
        flattenJsonObject(obj[key], newKey, result);
    });
    return result;
}
/**
 * Обработка YML файлов Яндекс Маркета
 * Преобразует XML структуру в удобный для анализа JSON формат
 */
function processYandexMarketYml(parsed) {
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
            currencies.push(...currencyList.map((curr) => ({
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
            categories.push(...categoryList.map((cat) => ({
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
            offers.push(...offerList.map((offer) => {
                const offerData = {
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
                if (offer.oldprice)
                    offerData.oldprice = offer.oldprice[0] || offer.oldprice;
                if (offer.vendorCode)
                    offerData.vendorCode = offer.vendorCode[0] || offer.vendorCode;
                if (offer.barcode)
                    offerData.barcode = offer.barcode[0] || offer.barcode;
                if (offer.sales_notes)
                    offerData.sales_notes = offer.sales_notes[0] || offer.sales_notes;
                if (offer.delivery)
                    offerData.delivery = offer.delivery[0] || offer.delivery;
                if (offer.pickup)
                    offerData.pickup = offer.pickup[0] || offer.pickup;
                // Обрабатываем картинки
                if (offer.picture) {
                    const pictures = Array.isArray(offer.picture) ? offer.picture : [offer.picture];
                    offerData.pictures = pictures.map((pic) => pic || '');
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
    }
    catch (error) {
        throw new errors_1.ProcessingError(`YML catalog processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Стратегии обработки форматов
const strategies = {
    doc: async (buf) => {
        try {
            // Проверяем, является ли это старым DOC файлом (CFB формат)
            const signature = buf.slice(0, 8);
            const cfbSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
            if (signature.equals(cfbSignature)) {
                throw new errors_1.UnsupportedFormatError("Старые DOC файлы (Word 97-2003) не поддерживаются. " +
                    "Пожалуйста, сохраните файл в формате DOCX (Word 2007+) и попробуйте снова.");
            }
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            if (error instanceof errors_1.UnsupportedFormatError) {
                throw error;
            }
            // Если это ошибка officeparser о CFB файлах, выдаем понятное сообщение
            if (error instanceof Error && error.message.includes('cfb files')) {
                throw new errors_1.UnsupportedFormatError("Старые DOC файлы (Word 97-2003) не поддерживаются. " +
                    "Пожалуйста, сохраните файл в формате DOCX (Word 2007+) и попробуйте снова.");
            }
            throw new errors_1.ProcessingError(`DOC processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    docx: async (buf) => {
        // Используем officeparser вместо mammoth для единообразия
        try {
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            // Fallback на mammoth если officeparser не справился
            try {
                const result = await mammoth_1.default.extractRawText({ buffer: buf });
                return { text: result.value };
            }
            catch {
                throw new errors_1.ProcessingError(`DOCX processing error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    },
    xml: async (buf) => {
        const parsed = await (0, xml2js_1.parseStringPromise)(buf.toString("utf8"));
        return { text: JSON.stringify(parsed, null, 2) };
    },
    yml: async (buf) => {
        try {
            const xmlContent = buf.toString("utf8");
            const parsed = await (0, xml2js_1.parseStringPromise)(xmlContent);
            // Проверяем, является ли это YML файлом Яндекс Маркета
            if (parsed.yml_catalog && parsed.yml_catalog.shop) {
                return processYandexMarketYml(parsed);
            }
            // Если это обычный YML/XML, обрабатываем как XML
            return { text: JSON.stringify(parsed, null, 2) };
        }
        catch (error) {
            throw new errors_1.ProcessingError(`YML processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    json: async (buf) => {
        try {
            const encoding = chardet_1.default.detect(buf) || "utf-8";
            const jsonString = iconv_lite_1.default.decode(buf, encoding);
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
        }
        catch (error) {
            throw new errors_1.ProcessingError(`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    odt: async (buf) => {
        try {
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            throw new errors_1.ProcessingError(`ODT processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    odp: async (buf) => {
        try {
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            throw new errors_1.ProcessingError(`ODP processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    ods: async (buf) => {
        try {
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            throw new errors_1.ProcessingError(`ODS processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    xlsx: async (buf, ext, options, fileName) => {
        // Пробуем сначала officeparser, затем ExcelJS как fallback
        try {
            const _text = await (0, helpers_1.extractViaOfficeParser)(buf);
            // officeparser возвращает текст, но для Excel нам нужна структура
            // Поэтому используем ExcelJS для полной функциональности
            throw new Error("Use ExcelJS for structured data");
        }
        catch {
            // Используем ExcelJS для полной поддержки структуры Excel
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buf);
            const sheets = {};
            workbook.eachSheet((worksheet, _sheetId) => {
                const sheetName = worksheet.name;
                const jsonData = [];
                worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                    const rowData = {};
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
                const sheetData = {
                    ...((options?.includeFileName !== false) && { fileName: fileName || 'unknown' }),
                    ...((options?.includeSheetName !== false) && { sheetName: sheetName }),
                    data: (0, helpers_1.limitExcelSheet)(jsonData)
                };
                sheets[sheetName] = sheetData;
            });
            return { sheets };
        }
    },
    csv: async (buf, ext, options, fileName) => {
        const encoding = chardet_1.default.detect(buf) || "utf-8";
        const decoded = iconv_lite_1.default.decode(buf, encoding);
        if (buf.length > CSV_STREAM_SIZE_LIMIT) {
            return streamCsvStrategy(decoded, fileName, options);
        }
        return processExcel(decoded, "csv", options, fileName);
    },
    pdf: async (buf) => {
        // Используем officeparser вместо pdf-parse (officeparser использует pdf.js с 2024/05/06)
        try {
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            // Fallback на pdf-parse если officeparser не справился
            try {
                const data = await (0, pdf_parse_1.default)(buf);
                return { text: data.text };
            }
            catch {
                throw new errors_1.ProcessingError(`PDF processing error: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    },
    txt: async (buf) => {
        if (buf.length > TXT_STREAM_SIZE_LIMIT) {
            return streamTxtStrategy(buf);
        }
        const encoding = chardet_1.default.detect(buf) || "utf-8";
        return { text: iconv_lite_1.default.decode(buf, encoding) };
    },
    ppt: async (buf) => {
        try {
            // Проверяем, является ли это старым PPT файлом (CFB формат)
            const signature = buf.slice(0, 8);
            const cfbSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
            if (signature.equals(cfbSignature)) {
                throw new errors_1.UnsupportedFormatError("Старые PPT файлы (PowerPoint 97-2003) не поддерживаются. " +
                    "Пожалуйста, сохраните файл в формате PPTX (PowerPoint 2007+) и попробуйте снова.");
            }
            return { text: await (0, helpers_1.extractViaOfficeParser)(buf) };
        }
        catch (error) {
            if (error instanceof errors_1.UnsupportedFormatError) {
                throw error;
            }
            // Если это ошибка officeparser о CFB файлах, выдаем понятное сообщение
            if (error instanceof Error && error.message.includes('cfb files')) {
                throw new errors_1.UnsupportedFormatError("Старые PPT файлы (PowerPoint 97-2003) не поддерживаются. " +
                    "Пожалуйста, сохраните файл в формате PPTX (PowerPoint 2007+) и попробуйте снова.");
            }
            throw new errors_1.ProcessingError(`PPT processing error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
    pptx: async (buf) => ({
        text: await (0, helpers_1.extractViaOfficeParser)(buf),
    }),
    html: async (buf) => processHtml(buf),
    htm: async (buf) => processHtml(buf),
};
async function streamCsvStrategy(data, fileName, options) {
    return new Promise((resolve, reject) => {
        const rows = [];
        let rowCount = 0;
        papaparse_1.default.parse(data, {
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
                const sheetData = {
                    ...((options?.includeFileName !== false) && { fileName: fileName || 'unknown' }),
                    ...((options?.includeSheetName !== false) && { sheetName: 'Sheet1' }),
                    data: rows
                };
                resolve({
                    sheets: {
                        Sheet1: sheetData
                    },
                    warning,
                });
            },
            error: (err) => reject(err),
        });
    });
}
async function processExcel(data, ext, options, fileName) {
    const workbook = new ExcelJS.Workbook();
    if (ext === "csv") {
        // Для CSV используем Papa Parse (уже реализовано в streamCsvStrategy)
        return streamCsvStrategy(data, fileName, options);
    }
    else {
        // Для Excel файлов загружаем через ExcelJS
        await workbook.xlsx.load(data);
    }
    const sheets = {};
    workbook.eachSheet((worksheet, _sheetId) => {
        const sheetName = worksheet.name;
        const jsonData = [];
        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            const rowData = {};
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
        const sheetData = {
            ...((options?.includeFileName !== false) && { fileName: fileName || 'unknown' }),
            ...((options?.includeSheetName !== false) && { sheetName: sheetName }),
            data: (0, helpers_1.limitExcelSheet)(jsonData)
        };
        sheets[sheetName] = sheetData;
    });
    return { sheets };
}
/**
 * Обработка HTML/HTM файлов
 */
async function processHtml(buf) {
    try {
        const $ = cheerio.load(buf.toString("utf8"));
        const rawText = $("body").text().replace(/\s+/g, " ").trim();
        const cleanText = (0, sanitize_html_1.default)(rawText, { allowedTags: [], allowedAttributes: {} });
        return { text: cleanText };
    }
    catch (error) {
        throw new errors_1.ProcessingError(`HTML processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Custom n8n node: convert files to JSON/text
 * Supports DOCX, XML, YML, XLSX, CSV, PDF, TXT, PPTX, HTML
 */
class FileToJsonNode {
    constructor() {
        this.description = {
            displayName: "Convert File to JSON (Enhanced)",
            name: "convertFileToJsonEnhanced",
            icon: "file:icon.svg",
            group: ["transform"],
            version: 5,
            description: "DOCX / XML / YML / XLSX / CSV / PDF / TXT / PPTX / HTML → JSON|text (with Excel row/column preservation)",
            defaults: { name: "Convert File to JSON (Enhanced)" },
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
                {
                    displayName: "Include File Name",
                    name: "includeFileName",
                    type: "boolean",
                    default: true,
                    description: "Include the filename in each sheet object",
                    displayOptions: {
                        show: {
                        // Only show this option when processing files that could be Excel or CSV
                        }
                    }
                },
                {
                    displayName: "Include Sheet Name",
                    name: "includeSheetName",
                    type: "boolean",
                    default: true,
                    description: "Include the sheet name in each sheet object",
                    displayOptions: {
                        show: {
                        // Only show this option when processing files that could be Excel or CSV
                        }
                    }
                },
                {
                    displayName: "Output Sheets as Separate Items",
                    name: "outputSheetsAsSeparateItems",
                    type: "boolean",
                    default: false,
                    description: "Output each sheet as a separate workflow item instead of grouped by file. Text files (PDF, DOCX, etc.) will be ignored when enabled.",
                    displayOptions: {
                        show: {
                        // Only show this option when processing files that could have multiple sheets
                        }
                    }
                },
            ],
        };
    }
    /**
     * Main execution method for n8n node
     */
    async execute() {
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
        const maxFileSize = this.getNodeParameter('maxFileSize', 0, 50) * 1024 * 1024; // MB в байты
        const maxConcurrency = this.getNodeParameter('maxConcurrency', 0, 4);
        const includeOriginalRowNumbers = this.getNodeParameter('includeOriginalRowNumbers', 0, false);
        const includeFileName = this.getNodeParameter('includeFileName', 0, true);
        const includeSheetName = this.getNodeParameter('includeSheetName', 0, true);
        const outputSheetsAsSeparateItems = this.getNodeParameter('outputSheetsAsSeparateItems', 0, false);
        const processItem = async (item, i) => {
            const prop = this.getNodeParameter("binaryPropertyName", i, "data");
            // --- Input data validation ---
            if (!item || typeof item !== "object")
                throw new errors_1.FileTypeError(`Item #${i} is not an object`);
            const itemObj = item;
            if (!itemObj.binary || typeof itemObj.binary !== "object")
                throw new errors_1.FileTypeError(`Item #${i} does not contain binary data`);
            const binary = itemObj.binary;
            if (!binary[prop])
                throw new errors_1.FileTypeError(`Binary property "${prop}" is missing (item ${i})`);
            const binaryProp = binary[prop];
            if (!binaryProp.fileName || typeof binaryProp.fileName !== "string")
                throw new errors_1.FileTypeError(`File does not contain a valid name (item ${i})`);
            const buf = await this.helpers.getBinaryDataBuffer(i, prop);
            if (!Buffer.isBuffer(buf) || buf.length === 0)
                throw new errors_1.EmptyFileError("File is empty or contains no data");
            if (buf.length > maxFileSize)
                throw new errors_1.FileTooLargeError("File is too large (maximum 50 MB)");
            // --- End of validation ---
            const name = sanitizeFileName(binaryProp.fileName ?? "");
            let ext = path_1.default.extname(name).slice(1).toLowerCase();
            /* ── autodetect ── */
            if (!ext || !supported.includes(ext)) {
                try {
                    const ft = await (0, file_type_1.fileTypeFromBuffer)(buf);
                    if (ft?.ext && supported.includes(ft.ext)) {
                        ext = ft.ext;
                    }
                    else {
                        throw new errors_1.UnsupportedFormatError(`Unsupported file type: ${ext || "unknown"}`);
                    }
                }
                catch (error) {
                    this.logger?.warn('File type detection failed', {
                        fileName: name,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    throw new errors_1.UnsupportedFormatError(`Unsupported file type: ${ext || "unknown"}`);
                }
            }
            this.logger?.info("ConvertFileToJSON →", {
                file: name || "[no-name]",
                ext,
                size: buf.length,
            });
            let json = {};
            const startTime = performance.now();
            try {
                if (!strategies[ext]) {
                    throw new errors_1.UnsupportedFormatError(`Format "${ext}" is not supported`);
                }
                const options = {
                    includeOriginalRowNumbers,
                    includeFileName,
                    includeSheetName,
                    outputSheetsAsSeparateItems
                };
                json = await strategies[ext](buf, ext, options, name);
            }
            catch (e) {
                throw new errors_1.ProcessingError(`${ext.toUpperCase()} processing error: ${e.message}`);
            }
            const processingTime = performance.now() - startTime;
            this.logger?.info('Processing completed', {
                file: name,
                size: buf.length,
                time: `${processingTime.toFixed(2)}ms`,
                type: ext
            });
            if ("text" in json &&
                (!json.text || json.text.trim().length === 0))
                throw new errors_1.EmptyFileError("File is empty or contains no text");
            json.metadata = {
                fileName: sanitizeFileName(name) || null,
                fileSize: buf.length,
                fileType: ext,
                processedAt: new Date().toISOString(),
            };
            return { json };
        };
        const results = await promisePool(items, processItem, maxConcurrency);
        if (outputSheetsAsSeparateItems) {
            // Flatten sheets from all files into separate items
            const separateItems = [];
            for (const result of results) {
                const json = result.json;
                // Skip text files (only process files with sheets)
                if ('sheets' in json && json.sheets && typeof json.sheets === 'object') {
                    const sheets = json.sheets;
                    for (const [sheetKey, sheetData] of Object.entries(sheets)) {
                        if (sheetData && typeof sheetData === 'object' && 'data' in sheetData) {
                            const separateItem = {
                                rows: sheetData.data
                            };
                            // Add optional metadata based on toggles
                            if (includeFileName && sheetData.fileName) {
                                separateItem.fileName = sheetData.fileName;
                            }
                            if (includeSheetName && sheetData.sheetName) {
                                separateItem.sheetName = sheetData.sheetName;
                            }
                            // Add required metadata fields
                            separateItem.fileType = json.metadata?.fileType || null;
                            separateItem.fileSize = json.metadata?.fileSize || null;
                            separateItem.processedAt = json.metadata?.processedAt || new Date().toISOString();
                            separateItems.push(separateItem);
                        }
                    }
                }
            }
            return separateItems;
        }
        else {
            // Объединяем все результаты в один item (current behavior)
            return [[{
                        json: {
                            files: results.map(result => result.json),
                            totalFiles: results.length,
                            processedAt: new Date().toISOString()
                        }
                    }]];
        }
    }
}
// Export for n8n
const nodeClass = FileToJsonNode;
exports.FileToJsonNode = nodeClass;
//# sourceMappingURL=FileToJsonNode.node.js.map