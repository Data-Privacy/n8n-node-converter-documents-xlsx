// Кастомные классы ошибок для нода n8n

export class FileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileTypeError';
  }
}

export class FileTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileTooLargeError';
  }
}

export class UnsupportedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}

export class EmptyFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyFileError';
  }
}

export class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessingError';
  }
} 