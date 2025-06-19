/**
 * Извлекает текст из буфера с помощью officeparser
 */
export declare function extractViaOfficeParser(buffer: Buffer): Promise<string>;
/**
 * @deprecated Устаревшая функция для обратной совместимости
 * Используйте extractViaOfficeParser вместо этой функции
 */
export declare function extractViaTextract(buffer: Buffer, _mime: string, _textract: unknown): Promise<string>;
/**
 * Ограничивает количество строк в Excel-таблице
 */
export declare function limitExcelSheet(sheet: unknown[], maxRows?: number): unknown[];
