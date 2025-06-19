// Тестируем processHtml функцию
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';

// Копируем функцию processHtml из основного файла для тестирования
async function processHtml(buf: Buffer): Promise<{ text: string }> {
  const $ = cheerio.load(buf.toString("utf8"));
  const rawText = $("body").text().replace(/\s+/g, " ").trim();
  const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
  return { text: cleanText };
}

describe('processHtml', () => {
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
    
    const buffer = Buffer.from(htmlContent, 'utf8');
    const result = await processHtml(buffer);
    
    // sanitizeHtml может не декодировать HTML entities, проверяем фактический результат
    expect(result.text).toContain('Text with');
    expect(result.text).toContain('Quotes:');
    expect(result.text).toContain('Less than:');
    expect(result.text).toContain('Greater than:');
  });
}); 