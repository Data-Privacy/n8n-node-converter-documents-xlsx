"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractViaOfficeParser = extractViaOfficeParser;
exports.extractViaTextract = extractViaTextract;
exports.limitExcelSheet = limitExcelSheet;
// Вспомогательные функции для работы с файлами в кастомном ноде n8n
const officeparser_1 = require("officeparser");
/**
 * Извлекает текст из буфера с помощью officeparser
 */
function extractViaOfficeParser(buffer) {
    return (0, officeparser_1.parseOfficeAsync)(buffer);
}
/**
 * @deprecated Устаревшая функция для обратной совместимости
 * Используйте extractViaOfficeParser вместо этой функции
 */
function extractViaTextract(buffer, _mime, _textract) {
    return extractViaOfficeParser(buffer);
}
/**
 * Ограничивает количество строк в Excel-таблице
 */
function limitExcelSheet(sheet, maxRows = 10000) {
    return sheet.length > maxRows ? sheet.slice(0, maxRows) : sheet;
}
//# sourceMappingURL=helpers.js.map