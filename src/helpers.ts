// Вспомогательные функции для работы с файлами в кастомном ноде n8n

/**
 * Извлекает текст из буфера с помощью textract
 */
export function extractViaTextract(
  buffer: Buffer,
  mime: string,
  textract: {
    fromBufferWithMime: (mime: string, buffer: Buffer, callback: (err: Error | null, text: string) => void) => void;
  }
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
  sheet: unknown[],
  maxRows: number = 10_000
): unknown[] {
  return sheet.length > maxRows ? sheet.slice(0, maxRows) : sheet;
}
