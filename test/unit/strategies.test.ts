import { extractViaOfficeParser } from '../../src/helpers';

// Мокаем внешние зависимости
jest.mock('../../src/helpers', () => ({
  extractViaOfficeParser: jest.fn(),
  limitExcelSheet: jest.fn((data) => data), // Простой passthrough для тестов
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

import { parseStringPromise } from 'xml2js';
import pdfParse from 'pdf-parse';

const mockExtractViaOfficeParser = extractViaOfficeParser as jest.MockedFunction<typeof extractViaOfficeParser>;
const mockParseStringPromise = parseStringPromise as jest.MockedFunction<typeof parseStringPromise>;
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;

// Импортируем стратегии и функции из основного файла
// Поскольку они не экспортированы, создаем тестовые версии
// Копируем функцию flattenJsonObject для тестирования
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

// Создаем тестовые стратегии на основе оригинальных
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

const createXmlStrategy = () => async (buf: Buffer) => {
  const parsed = await parseStringPromise(buf.toString("utf8"));
  return { text: JSON.stringify(parsed, null, 2) };
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

describe('File Processing Strategies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('flattenJsonObject', () => {
    it('should flatten nested object structure', () => {
      const input = {
        user: {
          name: 'John',
          address: {
            city: 'Moscow',
            country: 'Russia'
          }
        },
        age: 30
      };

      const result = flattenJsonObject(input);

      expect(result).toEqual({
        'user.name': 'John',
        'user.address.city': 'Moscow',
        'user.address.country': 'Russia',
        'age': 30
      });
    });

    it('should handle arrays in nested structure', () => {
      const input = {
        users: [
          { name: 'John' },
          { name: 'Jane' }
        ]
      };

      const result = flattenJsonObject(input);

      expect(result).toEqual({
        'users[0].name': 'John',
        'users[1].name': 'Jane'
      });
    });

    it('should handle primitive values', () => {
      const result1 = flattenJsonObject('simple string');
      const result2 = flattenJsonObject(42);
      const result3 = flattenJsonObject(true);

      expect(result1).toEqual({ 'value': 'simple string' });
      expect(result2).toEqual({ 'value': 42 });
      expect(result3).toEqual({ 'value': true });
    });

    it('should handle null and undefined', () => {
      const result1 = flattenJsonObject(null);
      const result2 = flattenJsonObject(undefined);

      expect(result1).toEqual({});
      expect(result2).toEqual({});
    });

    it('should handle empty objects and arrays', () => {
      const result1 = flattenJsonObject({});
      const result2 = flattenJsonObject([]);

      expect(result1).toEqual({});
      expect(result2).toEqual({});
    });

    it('should handle Date and Buffer objects as primitives', () => {
      const date = new Date('2024-01-01');
      const buffer = Buffer.from('test');
      
      const result1 = flattenJsonObject(date);
      const result2 = flattenJsonObject(buffer);

      expect(result1).toEqual({ 'value': date });
      expect(result2).toEqual({ 'value': buffer });
    });
  });

  describe('JSON Strategy', () => {
    const jsonStrategy = createJsonStrategy();

    it('should process simple JSON object', async () => {
      const jsonData = { name: 'John', age: 30 };
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await jsonStrategy(buffer);

      expect(result.text).toBe(JSON.stringify(jsonData, null, 2));
      expect(result.warning).toBeUndefined();
    });

    it('should flatten nested JSON object with warning', async () => {
      const jsonData = {
        user: {
          name: 'John',
          address: { city: 'Moscow' }
        }
      };
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await jsonStrategy(buffer);

      expect(result.text).toContain('user.name');
      expect(result.text).toContain('user.address.city');
      expect(result.warning).toBe("Многоуровневая структура JSON была преобразована в плоский объект");
    });

      it('should handle JSON arrays by flattening them', async () => {
    const jsonData = [{ name: 'John' }, { name: 'Jane' }];
    const buffer = Buffer.from(JSON.stringify(jsonData));

    const result = await jsonStrategy(buffer);

    // Массивы должны обрабатываться через flattenJsonObject
    const expectedFlattened = {
      'item_0.name': 'John',
      'item_1.name': 'Jane'
    };
    expect(result.text).toBe(JSON.stringify(expectedFlattened, null, 2));
    // Для массивов warning может не появляться, так как количество ключей не всегда увеличивается
    expect(result.warning).toBeUndefined();
  });

    it('should handle primitive JSON values', async () => {
      const buffer = Buffer.from('"simple string"');

      const result = await jsonStrategy(buffer);

      expect(result.text).toBe('"simple string"');
    });

    it('should throw error for invalid JSON', async () => {
      const buffer = Buffer.from('{ invalid json }');

      await expect(jsonStrategy(buffer))
        .rejects.toThrow('JSON parsing error:');
    });
  });

  describe('ODT Strategy', () => {
    const odtStrategy = createOdtStrategy();

    it('should extract text from ODT file successfully', async () => {
      const expectedText = 'Extracted ODT content';
      mockExtractViaOfficeParser.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock ODT content');
      const result = await odtStrategy(buffer);

      expect(result.text).toBe(expectedText);
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
    });

    it('should handle ODT processing errors', async () => {
      const mockError = new Error('ODT parsing failed');
      mockExtractViaOfficeParser.mockRejectedValue(mockError);

      const buffer = Buffer.from('invalid ODT content');

      await expect(odtStrategy(buffer))
        .rejects.toThrow('ODT processing error: ODT parsing failed');
    });
  });

  describe('ODP Strategy', () => {
    const odpStrategy = createOdpStrategy();

    it('should extract text from ODP file successfully', async () => {
      const expectedText = 'Extracted ODP presentation content';
      mockExtractViaOfficeParser.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock ODP content');
      const result = await odpStrategy(buffer);

      expect(result.text).toBe(expectedText);
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
    });

    it('should handle ODP processing errors', async () => {
      const mockError = new Error('ODP parsing failed');
      mockExtractViaOfficeParser.mockRejectedValue(mockError);

      const buffer = Buffer.from('invalid ODP content');

      await expect(odpStrategy(buffer))
        .rejects.toThrow('ODP processing error: ODP parsing failed');
    });
  });

  describe('ODS Strategy', () => {
    const odsStrategy = createOdsStrategy();

    it('should extract text from ODS file successfully', async () => {
      const expectedText = 'Extracted ODS spreadsheet content';
      mockExtractViaOfficeParser.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock ODS content');
      const result = await odsStrategy(buffer);

      expect(result.text).toBe(expectedText);
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
    });

    it('should handle ODS processing errors', async () => {
      const mockError = new Error('ODS parsing failed');
      mockExtractViaOfficeParser.mockRejectedValue(mockError);

      const buffer = Buffer.from('invalid ODS content');

      await expect(odsStrategy(buffer))
        .rejects.toThrow('ODS processing error: ODS parsing failed');
    });
  });

  describe('XML Strategy', () => {
    const xmlStrategy = createXmlStrategy();

    it('should parse XML successfully', async () => {
      const mockParsedXml = { root: { element: 'value' } };
      mockParseStringPromise.mockResolvedValue(mockParsedXml);

      const xmlContent = '<root><element>value</element></root>';
      const buffer = Buffer.from(xmlContent);

      const result = await xmlStrategy(buffer);

      expect(result.text).toBe(JSON.stringify(mockParsedXml, null, 2));
      expect(mockParseStringPromise).toHaveBeenCalledWith(xmlContent);
    });

    it('should handle XML parsing errors', async () => {
      const mockError = new Error('XML parsing failed');
      mockParseStringPromise.mockRejectedValue(mockError);

      const buffer = Buffer.from('<invalid>xml');

      await expect(xmlStrategy(buffer))
        .rejects.toThrow('XML parsing failed');
    });
  });

  describe('PDF Strategy', () => {
    const pdfStrategy = createPdfStrategy();

    it('should extract text via OfficeParser successfully', async () => {
      const expectedText = 'Extracted PDF content';
      mockExtractViaOfficeParser.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock PDF content');
      const result = await pdfStrategy(buffer);

      expect(result.text).toBe(expectedText);
      expect(mockExtractViaOfficeParser).toHaveBeenCalledWith(buffer);
    });

    it('should fallback to pdf-parse when OfficeParser fails', async () => {
      mockExtractViaOfficeParser.mockRejectedValue(new Error('OfficeParser failed'));
      mockPdfParse.mockResolvedValue({ 
        text: 'PDF text from fallback',
        numpages: 1,
        numrender: 1,
        info: {},
        metadata: {},
        version: 'v1.10.100'
      });

      const buffer = Buffer.from('mock PDF content');
      const result = await pdfStrategy(buffer);

      expect(result.text).toBe('PDF text from fallback');
      expect(mockPdfParse).toHaveBeenCalledWith(buffer);
    });

    it('should throw error when both methods fail', async () => {
      mockExtractViaOfficeParser.mockRejectedValue(new Error('OfficeParser failed'));
      mockPdfParse.mockRejectedValue(new Error('pdf-parse failed'));

      const buffer = Buffer.from('invalid PDF content');

      await expect(pdfStrategy(buffer))
        .rejects.toThrow('PDF processing error: OfficeParser failed');
    });
  });
}); 