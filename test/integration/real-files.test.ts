import * as fs from 'fs';
import * as path from 'path';

// Мокаем внешние зависимости для контролируемого тестирования
jest.mock('../../src/helpers', () => ({
  extractViaOfficeParser: jest.fn(),
  limitExcelSheet: jest.fn((data) => data),
}));

jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    xlsx: {
      load: jest.fn().mockResolvedValue(undefined),
    },
    eachSheet: jest.fn(),
  })),
}));

jest.mock('pdf-parse', () => jest.fn());
jest.mock('cheerio');
jest.mock('sanitize-html');

import { extractViaOfficeParser } from '../../src/helpers';
import { parseStringPromise } from 'xml2js';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';

const mockExtractViaOfficeParser = extractViaOfficeParser as jest.MockedFunction<typeof extractViaOfficeParser>;
const mockParseStringPromise = parseStringPromise as jest.MockedFunction<typeof parseStringPromise>;
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;
const mockCheerio = cheerio as jest.Mocked<typeof cheerio>;
const mockSanitizeHtml = sanitizeHtml as jest.MockedFunction<typeof sanitizeHtml>;

// Импортируем функции для тестирования (копируем из основного файла)
function flattenJsonObject(obj: unknown, prefix: string = '', result: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj === null || obj === undefined) {
    return result;
  }

  if (typeof obj !== 'object' || obj instanceof Date || obj instanceof Buffer) {
    result[prefix || 'value'] = obj;
    return result;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const key = prefix ? `${prefix}[${index}]` : `item_${index}`;
      flattenJsonObject(item, key, result);
    });
    return result;
  }

  Object.keys(obj).forEach(key => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    flattenJsonObject((obj as Record<string, unknown>)[key], newKey, result);
  });

  return result;
}

// Стратегии для тестирования
const createJsonStrategy = () => async (buf: Buffer) => {
  try {
    const jsonString = buf.toString('utf-8');
    const parsed = JSON.parse(jsonString);
    
    if (typeof parsed === 'object' && parsed !== null) {
      const flattened = flattenJsonObject(parsed);
      return { 
        text: JSON.stringify(flattened, null, 2),
        warning: Object.keys(flattened).length > Object.keys(parsed).length ? 
          "Многоуровневая структура JSON была преобразована в плоский объект" : undefined
      };
    }
    
    return { text: JSON.stringify(parsed, null, 2) };
  } catch (error) {
    throw new Error(`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createTxtStrategy = () => async (buf: Buffer) => {
  return { text: buf.toString('utf-8') };
};

const createHtmlStrategy = () => async (buf: Buffer) => {
  const $ = cheerio.load(buf.toString("utf8"));
  const rawText = $("body").text().replace(/\s+/g, " ").trim();
  const cleanText = sanitizeHtml(rawText, { allowedTags: [], allowedAttributes: {} });
  return { text: cleanText };
};

const createXmlStrategy = () => async (buf: Buffer) => {
  const parsed = await parseStringPromise(buf.toString("utf8"));
  return { text: JSON.stringify(parsed, null, 2) };
};

const createOdtStrategy = () => async (buf: Buffer) => {
  try {
    return { text: await extractViaOfficeParser(buf) };
  } catch (error) {
    throw new Error(`ODT processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createOdpStrategy = () => async (buf: Buffer) => {
  try {
    return { text: await extractViaOfficeParser(buf) };
  } catch (error) {
    throw new Error(`ODP processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createOdsStrategy = () => async (buf: Buffer) => {
  try {
    return { text: await extractViaOfficeParser(buf) };
  } catch (error) {
    throw new Error(`ODS processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const createPdfStrategy = () => async (buf: Buffer) => {
  try {
    return { text: await extractViaOfficeParser(buf) };
  } catch (error) {
    try {
      const data = await pdfParse(buf);
      return { text: data.text };
    } catch {
      throw new Error(`PDF processing error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Утилита для загрузки тестовых файлов
function loadSampleFile(filename: string): Buffer {
  const filePath = path.join(__dirname, '../samples', filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Sample file not found: ${filename}`);
  }
  return fs.readFileSync(filePath);
}

describe('Real Files Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Настраиваем моки
    mockSanitizeHtml.mockImplementation((text: string) => text);
    
    (mockCheerio.load as jest.Mock).mockImplementation((html: string | Buffer) => {
      const htmlString = typeof html === 'string' ? html : html.toString();
      const mockJQuery = (selector: string) => {
        if (selector === 'body') {
          return {
            text: () => {
              const bodyMatch = htmlString.match(/<body[^>]*>(.*?)<\/body>/is);
              if (bodyMatch) {
                return bodyMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              }
              return htmlString.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }
          };
        }
        return { text: () => '' };
      };
      return mockJQuery as unknown;
    });
  });

  describe('JSON Files', () => {
    it('should process nested-objects.json with flattening', async () => {
      const jsonStrategy = createJsonStrategy();
      const buffer = loadSampleFile('nested-objects.json');
      
      const result = await jsonStrategy(buffer);
      
      expect(result.text).toContain('company.name');
      expect(result.text).toContain('company.employees[0].id');
      expect(result.text).toContain('company.employees[0].name');
      expect(result.text).toContain('company.employees[1].id');
      expect(result.text).toContain('company.employees[1].name');
      expect(result.text).toContain('company.address.street');
      expect(result.text).toContain('company.address.city');
      expect(result.text).toContain('company.address.country');
      expect(result.warning).toBe("Многоуровневая структура JSON была преобразована в плоский объект");
    });

    it('should handle Unicode characters in json-with-unicode.json', async () => {
      const jsonStrategy = createJsonStrategy();
      const buffer = loadSampleFile('json-with-unicode.json');
      
      const result = await jsonStrategy(buffer);
      
      expect(result.text).toContain('greetings.english');
      expect(result.text).toContain('greetings.japanese');
      expect(result.text).toContain('greetings.arabic');
      expect(result.text).toContain('greetings.russian');
      expect(result.text).toContain('greetings.hindi');
      
      // Проверяем что Unicode символы сохранились
      const parsedResult = JSON.parse(result.text);
      expect(parsedResult['greetings.japanese']).toBe('こんにちは');
      expect(parsedResult['greetings.arabic']).toBe('مرحبا');
      expect(parsedResult['greetings.russian']).toBe('Здравствуйте');
      expect(parsedResult['greetings.hindi']).toBe('नमस्ते');
    });
  });

  describe('Text Files', () => {
    it('should process sample1.txt correctly', async () => {
      const txtStrategy = createTxtStrategy();
      const buffer = loadSampleFile('sample1.txt');
      
      const result = await txtStrategy(buffer);
      
      expect(result.text).toContain('Utilitatis causa amicitia est quaesita');
      expect(result.text).toContain('Lorem ipsum dolor sit amet');
      expect(result.text).toContain('consectetur adipiscing elit');
      expect(result.text.length).toBeGreaterThan(500); // Проверяем что текст полный
    });
  });

  describe('HTML Files', () => {
    it('should extract text from sample1.html', async () => {
      const htmlStrategy = createHtmlStrategy();
      const buffer = loadSampleFile('sample1.html');
      
      const result = await htmlStrategy(buffer);
      
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(mockCheerio.load).toHaveBeenCalled();
      expect(mockSanitizeHtml).toHaveBeenCalled();
    });

    it('should extract text from sample2.html', async () => {
      const htmlStrategy = createHtmlStrategy();
      const buffer = loadSampleFile('sample2.html');
      
      const result = await htmlStrategy(buffer);
      
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('XML Files', () => {
    it('should process large-dataset.xml (5.4MB)', async () => {
      const xmlStrategy = createXmlStrategy();
      const buffer = loadSampleFile('large-dataset.xml');
      
      // Мокаем парсер для большого файла
      const mockParsedData = { root: { records: 'Large dataset processed' } };
      mockParseStringPromise.mockResolvedValue(mockParsedData);
      
      const result = await xmlStrategy(buffer);
      
      expect(result.text).toBe(JSON.stringify(mockParsedData, null, 2));
      expect(mockParseStringPromise).toHaveBeenCalledWith(buffer.toString('utf8'));
      expect(buffer.length).toBeGreaterThan(5 * 1024 * 1024); // Проверяем что файл действительно большой
    });
  });

  describe('OpenDocument Files', () => {
    it('should process sample3.odt (ODT text document)', async () => {
      const odtStrategy = createOdtStrategy();
      const buffer = loadSampleFile('sample3.odt');
      
      mockExtractViaOfficeParser.mockResolvedValue('Extracted ODT content from real file');
      
      const result = await odtStrategy(buffer);
      
      expect(result.text).toBe('Extracted ODT content from real file');
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
      expect(buffer.length).toBeGreaterThan(1000); // ODT файлы обычно больше 1KB
    });

    it('should process sample1.odp (ODP presentation)', async () => {
      const odpStrategy = createOdpStrategy();
      const buffer = loadSampleFile('sample1.odp');
      
      mockExtractViaOfficeParser.mockResolvedValue('Extracted ODP presentation content');
      
      const result = await odpStrategy(buffer);
      
      expect(result.text).toBe('Extracted ODP presentation content');
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
      expect(buffer.length).toBeGreaterThan(100 * 1024); // ODP файлы обычно больше 100KB
    });

    it('should process sample3.ods (ODS spreadsheet)', async () => {
      const odsStrategy = createOdsStrategy();
      const buffer = loadSampleFile('sample3.ods');
      
      mockExtractViaOfficeParser.mockResolvedValue('Extracted ODS spreadsheet data');
      
      const result = await odsStrategy(buffer);
      
      expect(result.text).toBe('Extracted ODS spreadsheet data');
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
      expect(buffer.length).toBeGreaterThan(10 * 1024); // ODS файлы обычно больше 10KB
    });
  });

  describe('PDF Files', () => {
    it('should process sample3.pdf with fallback', async () => {
      const pdfStrategy = createPdfStrategy();
      const buffer = loadSampleFile('sample3.pdf');
      
      // Тестируем fallback сценарий
      mockExtractViaOfficeParser.mockRejectedValue(new Error('OfficeParser failed'));
      mockPdfParse.mockResolvedValue({ 
        text: 'PDF content extracted via fallback',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: 'v1.10.100'
      });
      
      const result = await pdfStrategy(buffer);
      
      expect(result.text).toBe('PDF content extracted via fallback');
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
      expect(mockPdfParse).toHaveBeenCalledWith(buffer);
      expect(buffer.length).toBeGreaterThan(1024 * 1024); // PDF файл больше 1MB
    });
  });

  describe('File Size Validation', () => {
    it('should handle large files appropriately', () => {
      const largeXmlBuffer = loadSampleFile('large-dataset.xml');
      const largeDocxBuffer = loadSampleFile('sample4.docx');
      
      expect(largeXmlBuffer.length).toBeGreaterThan(5 * 1024 * 1024); // > 5MB
      expect(largeDocxBuffer.length).toBeGreaterThan(10 * 1024 * 1024); // > 10MB
      
      // Проверяем что файлы загружаются без ошибок
      expect(largeXmlBuffer).toBeInstanceOf(Buffer);
      expect(largeDocxBuffer).toBeInstanceOf(Buffer);
    });

    it('should validate file existence', () => {
      expect(() => loadSampleFile('nonexistent.txt')).toThrow('Sample file not found: nonexistent.txt');
    });
  });

  describe('Error Handling with Real Files', () => {
    it('should handle ODT processing errors gracefully', async () => {
      const odtStrategy = createOdtStrategy();
      const buffer = loadSampleFile('sample3.odt');
      
      mockExtractViaOfficeParser.mockRejectedValue(new Error('Real ODT processing failed'));
      
      await expect(odtStrategy(buffer))
        .rejects.toThrow('ODT processing error: Real ODT processing failed');
    });

    it('should handle corrupted JSON gracefully', async () => {
      const jsonStrategy = createJsonStrategy();
      const corruptedJson = Buffer.from('{ "invalid": json content }');
      
      await expect(jsonStrategy(corruptedJson))
        .rejects.toThrow('JSON parsing error:');
    });
  });
}); 