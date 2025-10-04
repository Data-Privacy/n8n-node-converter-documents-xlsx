# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Task

The current method of handling xlsx files does not return the exact row numbers from the original file in the JSON output. For example, in the file `.claude\sample-output-current.json`, the array does not include row numbers from the original file. I need the n8n user to have the option to output the original row number from the Excel file in the `origRow` JSON property. This option should be available through a toggle in the n8n node.

I have created the JSON schema with this property and saved it in `.claude\desired-schema.json`. The new output should resemble `.claude\sample-output-desired.json`. It's important to note that the current XLSX conversion process skips some empty rows and columns at the start of the sheet. Therefore, the function must rely on the original file content, including any empty rows, instead of just considering the non-empty rows. Additionally, keep in mind that Excel rows are numbered starting from "1", and this numbering should be maintained. Consequently, the first item in the output JSON's array might begin with an `origRow` value of 2 and a column B (if there were empty rows or columns at the start of the Excel sheet). This functionality should ensure that the original row numbers are preserved, even if there are skipped empty rows or columns preceding the data or table.

## Development Commands

### Build and Development
- `npm run build` - Build TypeScript to dist/ and copy SVG icons
- `npm run dev` - Watch mode TypeScript compilation
- `npm run bundle` - Build and create webpack bundle
- `npm run standalone` - Create standalone version for n8n custom nodes

### Testing
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode  
- `npm run test:coverage` - Run tests with coverage report

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Auto-fix ESLint issues

### Utilities
- `npm run clean` - Remove dist/, coverage/, and bundle/ directories

## Architecture Overview

This is an n8n custom node that converts various document formats to JSON/text. The architecture follows a strategy pattern for handling different file types.

### Core Components

- **Main Node**: `src/FileToJsonNode.node.ts` - The primary n8n node implementation
- **Helpers**: `src/helpers.ts` - Utility functions for document processing
- **Error Handling**: `src/errors.ts` - Custom error classes for different failure scenarios

### Strategy Pattern Implementation

The codebase uses a strategy pattern in `FileToJsonNode.node.ts:356` where different file formats are handled by dedicated strategy functions:

```typescript
const strategies: Record<string, (buf: Buffer, ext?: string, options?: ProcessingOptions) => Promise<Partial<JsonResult>>> = {
  docx: async (buf) => { /* DOCX processing */ },
  pdf: async (buf) => { /* PDF processing */ },
  xlsx: async (buf, ext, options) => { /* Excel processing with optional row numbers */ },
  // ... other formats
}
```

The `ProcessingOptions` interface supports:
- `includeOriginalRowNumbers?: boolean` - For Excel files to include original row numbers from the spreadsheet

### Document Processing Pipeline

1. **Input Validation**: File size, type, and binary data validation
2. **Format Detection**: Auto-detection using file-type library
3. **Strategy Selection**: Route to appropriate format handler
4. **Processing**: Extract text/data using format-specific libraries
5. **Output Formatting**: Return standardized JSON with metadata

### Library Architecture

- **Primary**: `officeparser` for most document formats (DOCX, PDF, PPTX, ODT, ODP, ODS)
- **Fallbacks**: Format-specific libraries (mammoth for DOCX, pdf-parse for PDF)
- **Excel**: `ExcelJS` for structured spreadsheet data
- **Web**: `cheerio` for HTML/XML parsing
- **Security**: `sanitize-html` for safe HTML processing

### Special Format Handling

- **Yandex Market YML**: Custom parser for e-commerce catalog XML (lines 237-349)
- **JSON Normalization**: Flattens nested JSON structures for easier processing
- **Large File Streaming**: Stream processing for large CSV and TXT files
- **Legacy Format Detection**: Explicit rejection of old CFB-based formats (DOC, PPT)

### Error Handling

Custom error hierarchy with specific error types:
- `FileTypeError` - Invalid or missing file data
- `FileTooLargeError` - Exceeds size limits
- `UnsupportedFormatError` - Unsupported file format
- `EmptyFileError` - Empty or no content
- `ProcessingError` - General processing failures

### Testing Structure

- **Unit Tests**: `test/unit/` - Test individual functions and components
- **Integration Tests**: `test/integration/` - Test complete file processing workflows
- **Test Fixtures**: `test/samples/` - Sample files for different formats

### n8n Integration

The node follows n8n conventions:
- Implements `IExecuteFunctions` interface
- Uses binary property handling for file input
- Returns structured JSON output with metadata
- Supports concurrent processing with configurable limits

### Key Configuration

- Maximum file size: 50MB (configurable via node parameter)
- Concurrent processing limit: 4 files (configurable)
- Excel sheet row limit: 10,000 rows
- CSV streaming threshold: 10MB or 100,000 rows

### Development Notes

- All Russian comments indicate this was developed for Russian-speaking users
- Strong focus on Yandex Market integration for e-commerce use cases
- Comprehensive fallback strategies for robust document processing
- Security-first approach with input validation and sanitization

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

