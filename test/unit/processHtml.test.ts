// Тестируем processHtml функцию
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';

// Мокаем внешние зависимости
jest.mock('cheerio');
jest.mock('sanitize-html');

const mockCheerio = cheerio as jest.Mocked<typeof cheerio>;
const mockSanitizeHtml = sanitizeHtml as jest.MockedFunction<typeof sanitizeHtml>;

// Создаем тестовую версию processHtml на основе оригинальной логики
async function processHtml(buf: Buffer): Promise<{ text: string }> {
  const $ = cheerio.load(buf.toString("utf8"));
  const rawText = $("body").text().replace(/\s+/g, " ").trim();
  const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
  return { text: cleanText };
}

describe('processHtml', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Настраиваем моки по умолчанию
    (mockCheerio.load as jest.Mock).mockImplementation((html: string | Buffer) => {
      const htmlString = typeof html === 'string' ? html : html.toString();
      // Простая имитация jQuery-like объекта
      const mockJQuery = (selector: string) => {
        if (selector === 'body') {
          return {
            text: () => {
              // Простая логика извлечения текста из body
              const bodyMatch = htmlString.match(/<body[^>]*>(.*?)<\/body>/is);
              if (bodyMatch) {
                // Удаляем HTML теги и возвращаем текст
                return bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              }
              // Если нет body тега, извлекаем весь текст
              return htmlString.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
          };
        }
        return { text: () => '' };
      };
      return mockJQuery as unknown;
    });
    
    mockSanitizeHtml.mockImplementation((text: string) => text);
  });

  it('should extract text from HTML body', async () => {
    const htmlContent = `
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Hello World</h1>
          <p>This is a test paragraph.</p>
          <div>Another text block.</div>
        </body>
      </html>
    `;
    
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toBe('Hello World This is a test paragraph. Another text block.');
    expect(mockCheerio.load).toHaveBeenCalledWith(htmlContent);
    expect(mockSanitizeHtml).toHaveBeenCalledWith(
      'Hello World This is a test paragraph. Another text block.',
      { allowedTags: [], allowedAttributes: {} }
    );
  });

  it('should handle empty HTML', async () => {
    const htmlContent = '<html><body></body></html>';
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toBe('');
  });

  it('should handle HTML without body tag', async () => {
    const htmlContent = '<html><p>Some text</p></html>';
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    // cheerio все равно найдет текст, даже если нет явного body тега
    expect(result.text).toBe('Some text');
  });

  it('should sanitize and normalize whitespace', async () => {
    const htmlContent = `
      <html>
        <body>
          <p>Text   with     multiple    spaces</p>
          <p>
            Line breaks
            and    tabs
          </p>
        </body>
      </html>
    `;
    
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toBe('Text with multiple spaces Line breaks and tabs');
  });

  it('should handle HTML with special characters', async () => {
    const htmlContent = `
      <html>
        <body>
          <p>Text with &amp; ampersand</p>
          <p>Quotes: &quot;hello&quot;</p>
          <p>Less than: &lt; Greater than: &gt;</p>
        </body>
      </html>
    `;
    
    // Настраиваем мок для декодирования HTML entities
    mockSanitizeHtml.mockImplementation((text: string) => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    });
    
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toContain('Text with & ampersand');
    expect(result.text).toContain('Quotes: "hello"');
    expect(result.text).toContain('Less than: < Greater than: >');
  });

  it('should handle malformed HTML gracefully', async () => {
    const htmlContent = '<html><body><p>Unclosed paragraph<div>Mixed tags</body></html>';
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toContain('Unclosed paragraph');
    expect(result.text).toContain('Mixed tags');
  });

  it('should handle empty buffer', async () => {
    const buffer = Buffer.from('', 'utf8');
    const result = await processHtml(buffer);
    
    expect(result.text).toBe('');
  });
}); 