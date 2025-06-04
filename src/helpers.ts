// Вспомогательные функции для работы с файлами в кастомном ноде n8n

/**
 * Извлекает текст из буфера с помощью textract
 */
export function extractViaTextract(
  buffer: Buffer,
  mime: string,
  textract: any
): Promise<string> {
  return new Promise((res, rej) =>
    textract.fromBufferWithMime(mime, buffer, (err: Error | null, text: string) =>
      err ? rej(err) : res(text),
    ),
  );
}

/**
 * Ограничивает количество строк в Excel-таблице
 */
export function limitExcelSheet(
  sheet: any[],
  maxRows: number = 10_000
): any[] | { data: any[]; truncated: boolean; totalRows: number } {
  return sheet.length > maxRows
    ? {
        data: sheet.slice(0, maxRows),
        truncated: true,
        totalRows: sheet.length,
      }
    : sheet;
}
