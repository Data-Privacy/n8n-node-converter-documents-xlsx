/**
 * Извлекает текст из буфера с помощью textract
 */
export declare function extractViaTextract(buffer: Buffer, mime: string, textract: {
    fromBufferWithMime: (mime: string, buffer: Buffer, callback: (err: Error | null, text: string) => void) => void;
}): Promise<string>;
/**
 * Ограничивает количество строк в Excel-таблице
 */
export declare function limitExcelSheet(sheet: unknown[], maxRows?: number): unknown[];
