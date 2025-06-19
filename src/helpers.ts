// Вспомогательные функции для работы с файлами в кастомном ноде n8n
import { parseOfficeAsync } from 'officeparser';

/**
 * Извлекает текст из буфера с помощью officeparser
 */
export function extractViaOfficeParser(
  buffer: Buffer
): Promise<string> {
  return parseOfficeAsync(buffer);
}

/**
 * @deprecated Устаревшая функция для обратной совместимости
 * Используйте extractViaOfficeParser вместо этой функции
 */
export function extractViaTextract(
  buffer: Buffer,
  _mime: string,
  _textract: unknown
): Promise<string> {
  return extractViaOfficeParser(buffer);
}

/**
 * Ограничивает количество строк в Excel-таблице
 */
export function limitExcelSheet(
  sheet: unknown[],
  maxRows: number = 10_000
): unknown[] {
  return sheet.length > maxRows ? sheet.slice(0, maxRows) : sheet;
}
