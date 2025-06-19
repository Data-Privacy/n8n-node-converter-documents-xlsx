"use strict";
// Вспомогательные функции для работы с файлами в кастомном ноде n8n
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractViaTextract = extractViaTextract;
exports.limitExcelSheet = limitExcelSheet;
/**
 * Извлекает текст из буфера с помощью textract
 */
function extractViaTextract(buffer, mime, textract) {
    return new Promise((res, rej) => textract.fromBufferWithMime(mime, buffer, (err, text) => err ? rej(err) : res(text)));
}
/**
 * Ограничивает количество строк в Excel-таблице
 */
function limitExcelSheet(sheet, maxRows = 10000) {
    return sheet.length > maxRows ? sheet.slice(0, maxRows) : sheet;
}
//# sourceMappingURL=helpers.js.map