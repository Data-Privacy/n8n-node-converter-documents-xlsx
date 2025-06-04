/**
 * Извлекает текст из буфера с помощью textract
 */
export declare function extractViaTextract(buffer: Buffer, mime: string, textract: any): Promise<string>;
/**
 * Ограничивает количество строк в Excel-таблице
 */
export declare function limitExcelSheet(sheet: any[], maxRows?: number): any[] | {
    data: any[];
    truncated: boolean;
    totalRows: number;
};
