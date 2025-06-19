import { extractViaTextract, limitExcelSheet } from '../../src/helpers';

describe('helpers', () => {
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

  describe('extractViaTextract', () => {
    it('should extract text successfully', async () => {
      const mockTextract = {
        fromBufferWithMime: jest.fn((mime, buffer, callback) => {
          callback(null, 'extracted text');
        })
      };

      const buffer = Buffer.from('test content');
      const result = await extractViaTextract(buffer, 'text/plain', mockTextract);

      expect(result).toBe('extracted text');
      expect(mockTextract.fromBufferWithMime).toHaveBeenCalledWith(
        'text/plain', 
        buffer, 
        expect.any(Function)
      );
    });

    it('should reject on textract error', async () => {
      const mockError = new Error('Extraction failed');
      const mockTextract = {
        fromBufferWithMime: jest.fn((mime, buffer, callback) => {
          callback(mockError, null);
        })
      };

      const buffer = Buffer.from('test content');
      
      await expect(extractViaTextract(buffer, 'text/plain', mockTextract))
        .rejects.toThrow('Extraction failed');
    });
  });
}); 