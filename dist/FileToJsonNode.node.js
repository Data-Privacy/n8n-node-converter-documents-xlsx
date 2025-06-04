"use strict";
/*
 * Convert File to JSON v5
 * ─────────────────────────────────────────────────────────
 * Универсальный кастом-нод для n8n.
 * Поддерживает: DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT,
 *               PPT, PPTX, HTML / HTM.
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
const textract_1 = __importDefault(require("textract"));
const xlsx_1 = __importDefault(require("xlsx"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const cheerio_1 = __importDefault(require("cheerio"));
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
// Стратегии обработки форматов
const strategies = {
    docx: async (buf) => {
        const { value } = await mammoth_1.default.extractRawText({ buffer: buf });
        return { text: value };
    },
    doc: async (buf) => ({
        text: await (0, helpers_1.extractViaTextract)(buf, "application/msword", textract_1.default),
    }),
    xml: async (buf) => (await (0, xml2js_1.parseStringPromise)(buf.toString("utf8"), { explicitArray: false })),
    xls: async (buf) => processExcel(buf, "xls"),
    xlsx: async (buf) => processExcel(buf, "xlsx"),
    csv: async (buf) => {
        const encoding = chardet_1.default.detect(buf) || "utf-8";
        const decoded = iconv_lite_1.default.decode(buf, encoding);
        if (buf.length > CSV_STREAM_SIZE_LIMIT) {
            return streamCsvStrategy(decoded);
        }
        return processExcel(decoded, "csv");
    },
    pdf: async (buf) => {
        const data = await (0, pdf_parse_1.default)(buf);
        return { text: data.text };
    },
    txt: async (buf) => {
        if (buf.length > TXT_STREAM_SIZE_LIMIT) {
            return streamTxtStrategy(buf);
        }
        const encoding = chardet_1.default.detect(buf) || "utf-8";
        return { text: iconv_lite_1.default.decode(buf, encoding) };
    },
    ppt: async (buf) => ({
        text: await (0, helpers_1.extractViaTextract)(buf, "application/vnd.ms-powerpoint", textract_1.default),
    }),
    pptx: async (buf) => ({
        text: await (0, helpers_1.extractViaTextract)(buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation", textract_1.default),
    }),
    html: async (buf) => {
        const $ = cheerio_1.default.load(buf.toString("utf8"));
        const rawText = $("body").text().replace(/\s+/g, " ").trim();
        const cleanText = (0, sanitize_html_1.default)(rawText, { allowedTags: [], allowedAttributes: {} });
        return { text: cleanText };
    },
    htm: async (buf) => {
        const $ = cheerio_1.default.load(buf.toString("utf8"));
        const rawText = $("body").text().replace(/\s+/g, " ").trim();
        const cleanText = (0, sanitize_html_1.default)(rawText, { allowedTags: [], allowedAttributes: {} });
        return { text: cleanText };
    },
};
async function streamCsvStrategy(data) {
    return new Promise((resolve, reject) => {
        const rows = [];
        let truncated = false;
        let totalRows = 0;
        papaparse_1.default.parse(data, {
            header: true,
            step: (result) => {
                if (rows.length < CSV_STREAM_ROW_LIMIT) {
                    rows.push(result.data);
                }
                else {
                    truncated = true;
                }
                totalRows++;
            },
            complete: () => {
                resolve({
                    sheets: { Sheet1: truncated ? { data: rows, truncated, totalRows } : rows },
                });
            },
            error: (err) => reject(err),
        });
    });
}
async function processExcel(data, ext) {
    const wb = ext === "csv"
        ? xlsx_1.default.read(data, { type: "string", cellDates: true })
        : xlsx_1.default.read(data, { type: "buffer", cellDates: true });
    const sheets = {};
    wb.SheetNames.forEach((s) => {
        const js = xlsx_1.default.utils.sheet_to_json(wb.Sheets[s], {
            defval: null,
            raw: false,
            dateNF: "yyyy-mm-dd",
        });
        sheets[s] = (0, helpers_1.limitExcelSheet)(js);
    });
    return { sheets };
}
/**
 * Кастомный нод для n8n: конвертация файлов в JSON/текст
 * Поддержка DOC, DOCX, XML, XLS, XLSX, CSV, PDF, TXT, PPT, PPTX, HTML/HTM
 */
class FileToJsonNode {
    constructor() {
        this.description = {
            displayName: "Convert File to JSON",
            name: "convertFileToJson",
            icon: "fa:file-code-o",
            group: ["transform"],
            version: 5,
            description: "DOC / DOCX / XML / XLS / XLSX / CSV / PDF / TXT / PPT / PPTX / HTML → JSON|text",
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
    }
    /**
     * Основной метод выполнения нода n8n
     * @this {import('n8n-workflow').IExecuteFunctions}
     * @returns {Promise<Array>} - массив результатов для n8n
     */
    async execute() {
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
        const processItem = async (item, i) => {
            const prop = this.getNodeParameter("binaryPropertyName", i, "data");
            // --- Валидация входных данных ---
            if (!item || typeof item !== "object")
                throw new errors_1.FileTypeError(`Item #${i} не является объектом`);
            if (!item.binary || typeof item.binary !== "object")
                throw new errors_1.FileTypeError(`Item #${i} не содержит binary-данных`);
            if (!item.binary[prop])
                throw new errors_1.FileTypeError(`Binary property "${prop}" отсутствует (item ${i})`);
            if (!item.binary[prop].fileName || typeof item.binary[prop].fileName !== "string")
                throw new errors_1.FileTypeError(`Файл не содержит корректного имени (item ${i})`);
            const buf = await this.helpers.getBinaryDataBuffer(i, prop);
            if (!Buffer.isBuffer(buf) || buf.length === 0)
                throw new errors_1.EmptyFileError("Файл пуст или не содержит данных");
            if (buf.length > maxFileSize)
                throw new errors_1.FileTooLargeError("Файл слишком большой (максимум 50 MB)");
            // --- Конец валидации ---
            const name = item.binary[prop].fileName ?? "";
            let ext = path_1.default.extname(name).slice(1).toLowerCase();
            /* ── autodetect ── */
            if (!ext || !supported.includes(ext)) {
                const ft = await (0, file_type_1.fileTypeFromBuffer)(buf).catch(() => null);
                if (ft?.ext && supported.includes(ft.ext))
                    ext = ft.ext;
                else
                    throw new errors_1.UnsupportedFormatError(`Неподдерживаемый тип файла: ${ext || "unknown"}`);
            }
            this.logger?.info("ConvertFileToJSON →", {
                file: name || "[no-name]",
                ext,
                size: buf.length,
            });
            let json = {};
            try {
                if (!strategies[ext]) {
                    throw new errors_1.UnsupportedFormatError(`Формат "${ext}" не поддерживается`);
                }
                json = await strategies[ext](buf, ext);
            }
            catch (e) {
                throw new errors_1.ProcessingError(`Ошибка обработки ${ext.toUpperCase()}: ${e.message}`);
            }
            if ("text" in json &&
                (!json.text || json.text.trim().length === 0))
                throw new errors_1.EmptyFileError("Файл пуст или не содержит текста");
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
exports.FileToJsonNode = FileToJsonNode;
//# sourceMappingURL=FileToJsonNode.node.js.map