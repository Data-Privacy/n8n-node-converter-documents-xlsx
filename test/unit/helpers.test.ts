import { extractViaTextract, extractViaOfficeParser, limitExcelSheet } from '../../src/helpers';

// Mock officeparser module
jest.mock('officeparser', () => ({
  parseOfficeAsync: jest.fn()
}));

import { parseOfficeAsync } from 'officeparser';
const mockParseOfficeAsync = parseOfficeAsync as jest.MockedFunction<typeof parseOfficeAsync>;

describe('helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('limitExcelSheet', () => {
    it('should return sheet as is if under limit', () => {
      const testData = [{ name: 'test1' }, { name: 'test2' }];
      const result = limitExcelSheet(testData, 10);
      
      expect(result).toEqual(testData);
      expect(result).toHaveLength(2);
    });

    it('should limit sheet when over maxRows', () => {
      const testData = Array.from({ length: 15 }, (_, i) => ({ name: `test${i}` }));
      const result = limitExcelSheet(testData, 10);
      
      expect(result).toHaveLength(10);
      expect(result[0]).toEqual({ name: 'test0' });
      expect(result[9]).toEqual({ name: 'test9' });
    });

    it('should handle empty array', () => {
      const result = limitExcelSheet([], 10);
      expect(result).toEqual([]);
    });

    it('should use default maxRows of 10000', () => {
      const testData = Array.from({ length: 5 }, (_, i) => ({ name: `test${i}` }));
      const result = limitExcelSheet(testData);
      
      expect(result).toEqual(testData);
    });
  });

  describe('extractViaOfficeParser', () => {
    it('should extract text successfully', async () => {
      const expectedText = 'extracted text from office file';
      mockParseOfficeAsync.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock office file content');
      const result = await extractViaOfficeParser(buffer);

      expect(result).toBe(expectedText);
      expect(mockParseOfficeAsync).toHaveBeenCalledWith(buffer);
    });

    it('should reject on officeparser error', async () => {
      const mockError = new Error('OfficeParser extraction failed');
      mockParseOfficeAsync.mockRejectedValue(mockError);

      const buffer = Buffer.from('invalid office file content');
      
      await expect(extractViaOfficeParser(buffer))
        .rejects.toThrow('OfficeParser extraction failed');
    });
  });

  describe('extractViaTextract (deprecated)', () => {
    it('should use extractViaOfficeParser under the hood', async () => {
      const expectedText = 'text from deprecated function';
      mockParseOfficeAsync.mockResolvedValue(expectedText);

      const buffer = Buffer.from('mock file content');
      const result = await extractViaTextract(buffer, 'text/plain', {});

      expect(result).toBe(expectedText);
      expect(mockParseOfficeAsync).toHaveBeenCalledWith(buffer);
    });

    it('should reject on officeparser error', async () => {
      const mockError = new Error('OfficeParser error');
      mockParseOfficeAsync.mockRejectedValue(mockError);

      const buffer = Buffer.from('invalid content');
      
      await expect(extractViaTextract(buffer, 'text/plain', {}))
        .rejects.toThrow('OfficeParser error');
    });
  });
}); 