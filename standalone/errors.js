"use strict";
// Кастомные классы ошибок для нода n8n
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingError = exports.EmptyFileError = exports.UnsupportedFormatError = exports.FileTooLargeError = exports.FileTypeError = void 0;
class FileTypeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FileTypeError';
    }
}
exports.FileTypeError = FileTypeError;
class FileTooLargeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'FileTooLargeError';
    }
}
exports.FileTooLargeError = FileTooLargeError;
class UnsupportedFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedFormatError';
    }
}
exports.UnsupportedFormatError = UnsupportedFormatError;
class EmptyFileError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EmptyFileError';
    }
}
exports.EmptyFileError = EmptyFileError;
class ProcessingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProcessingError';
    }
}
exports.ProcessingError = ProcessingError;
//# sourceMappingURL=errors.js.map