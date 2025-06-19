import {
  FileTypeError,
  FileTooLargeError,
  UnsupportedFormatError,
  EmptyFileError,
  ProcessingError,
} from '../../src/errors';

describe('Custom Errors', () => {
  describe('FileTypeError', () => {
    it('should create error with correct message and name', () => {
      const error = new FileTypeError('Invalid file type');
      
      expect(error.message).toBe('Invalid file type');
      expect(error.name).toBe('FileTypeError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('FileTooLargeError', () => {
    it('should create error with correct message and name', () => {
      const error = new FileTooLargeError('File too large');
      
      expect(error.message).toBe('File too large');
      expect(error.name).toBe('FileTooLargeError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('UnsupportedFormatError', () => {
    it('should create error with correct message and name', () => {
      const error = new UnsupportedFormatError('Unsupported format');
      
      expect(error.message).toBe('Unsupported format');
      expect(error.name).toBe('UnsupportedFormatError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('EmptyFileError', () => {
    it('should create error with correct message and name', () => {
      const error = new EmptyFileError('Empty file');
      
      expect(error.message).toBe('Empty file');
      expect(error.name).toBe('EmptyFileError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ProcessingError', () => {
    it('should create error with correct message and name', () => {
      const error = new ProcessingError('Processing failed');
      
      expect(error.message).toBe('Processing failed');
      expect(error.name).toBe('ProcessingError');
      expect(error).toBeInstanceOf(Error);
    });
  });
}); 