# n8n-node-converter-documents

## Description

This project is a custom node for n8n designed to convert various file formats to JSON or text format. Supported formats: DOC, DOCX, XML, XLSX, CSV, PDF, TXT, PPT, PPTX, HTML/HTM.

## Important: Large File Limitations

- **PDF, XLSX:** The libraries used (`pdf-parse`, `ExcelJS`) load the entire file into memory. When processing very large files (tens of megabytes, hundreds of thousands of rows), crashes, freezes, and memory limit exceeded errors are possible. For such cases, it's recommended to split files beforehand or use specialized tools.
- **CSV, TXT:** Stream processing is implemented for large files (via papaparse and readline).

## Security and Validation

- Input data undergoes strict validation (type, structure, size, presence of binary data).
- For HTML/HTM, sanitize-html is used to protect against XSS and malicious scripts.
- **Security updates:** Replaced vulnerable libraries with secure alternatives (textract → officeparser).
- Regular dependency checks using npm audit and audit-ci.

## Features

- Automatic file type detection by extension or content
- Text or table extraction from popular office and text formats
- Output data: `{ text: "..." }` or `{ sheets: {...} }` + metadata (name, size, file type, processing time)
- Large file processing (up to 50 MB for most formats)
- Messages for empty or unsupported files
- Protection against malicious data and XSS

## Libraries Used

- **xml2js** — for XML parsing
- **mammoth** — for extracting text from DOCX
- **officeparser** — for DOC, PPT, PPTX (secure modern library)
- **ExcelJS** — for XLSX (modern and secure library)
- **papaparse** — for CSV with streaming support
- **pdf-parse** — for PDF
- **cheerio** — for HTML/HTM
- **sanitize-html** — for cleaning HTML/HTM from XSS
- **file-type** — for file type detection by content
- **chardet** + **iconv-lite** — for encoding detection and decoding of TXT

## CI/CD and Code Quality

- **GitHub Actions:** automatic testing on Node.js 18.x and 20.x
- **Linting:** ESLint with TypeScript support
- **Testing:** Jest with code coverage
- **Security:** automatic vulnerability checks
- **Build:** TypeScript compilation with type checking

## Input and Output Data Examples

**Input:**

- Binary file (e.g., DOCX, PDF, XLSX, etc.) in the `data` field.

**Output:**

- For text formats:

```json
{
  "text": "Extracted text...",
  "metadata": {
    "fileName": "example.docx",
    "fileSize": 12345,
    "fileType": "docx",
    "processedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

- For tabular formats:

```json
{
  "sheets": {
    "Sheet1": [ { "A": "Value1", "B": "Value2" }, ... ]
  },
  "metadata": {
    "fileName": "example.xlsx",
    "fileSize": 23456,
    "fileType": "xlsx",
    "processedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

## Project Structure

- `src/` — source code folder (main logic)
- `helpers.ts` — helper functions
- `errors.ts` — custom error classes
- `test/` — test files and unit tests folder
- `package.json` — dependencies and scripts file
- `.github/workflows/` — CI/CD configuration
- `.gitignore` — excludes node_modules, dist and temporary files from git

## Installing Dependencies

All necessary dependencies are installed via npm:

```bash
npm install
```

## Development

```bash
# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm test

# Tests with coverage
npm run test:coverage

# Linting
npm run lint

# Fix linting
npm run lint:fix

# Development with automatic rebuild
npm run dev
```

## Recommendations

- To add new formats, you'll need to add the corresponding library and handler to the main file.
- For n8n integration, make sure the node is correctly connected to your system.
- For working with very large PDF, XLSX files, use preprocessing or third-party tools.
- For security, always update dependencies and keep sanitize-html up to date.
- Regularly check for vulnerabilities using `npm audit`.

## Build and Use with TypeScript

1. To build the project, run:
   ```bash
   npm run build
   ```
   The resulting files will appear in the `dist/` folder.
2. To use the custom node in n8n, specify the path to `dist/FileToJsonNode.node.js`.
3. Main file for n8n is now: `dist/FileToJsonNode.node.js` (see `main` field in package.json).

## 🚀 For use in n8n:

### Option 1: Install as npm package (recommended)

**Update v1.0.7**: Fixed XLS processing issues and improved error messages ✅

```bash
npm install @mazix/n8n-nodes-converter-documents
```

Or via n8n web interface:
1. Open Settings → Community nodes
2. Enter: `@mazix/n8n-nodes-converter-documents`
3. Click Install

### Option 2: Standalone version (easiest way)

1. **Create standalone version:**
   ```bash
   git clone https://github.com/mazix/n8n-node-converter-documents.git
   cd n8n-node-converter-documents
   npm install
   npm run standalone
   ```

2. **Copy to n8n:**
   ```bash
   cp -r ./standalone ~/.n8n/custom-nodes/n8n-node-converter-documents
   cd ~/.n8n/custom-nodes/n8n-node-converter-documents
   npm install
   ```

3. **Restart n8n**

### Option 3: Manual installation

1. **Copy files to custom nodes folder:**
   ```bash
   mkdir -p ~/.n8n/custom-nodes/n8n-node-converter-documents
   cp dist/* ~/.n8n/custom-nodes/n8n-node-converter-documents/
   cp package.json ~/.n8n/custom-nodes/n8n-node-converter-documents/
   ```

2. **Install dependencies in custom node folder:**
   ```bash
   cd ~/.n8n/custom-nodes/n8n-node-converter-documents
   npm install --production
   ```

3. **Restart n8n**

### Option 4: Global dependency installation

If you have administrator rights, you can install dependencies globally:

```bash
npm install -g chardet cheerio exceljs file-type iconv-lite mammoth officeparser papaparse pdf-parse sanitize-html xml2js
```

Then copy only the main node file:
```bash
cp dist/FileToJsonNode.node.js ~/.n8n/custom-nodes/
```

## ⚠️ Troubleshooting

If you see an error `Cannot find module 'exceljs'` (or other modules):

1. **Use standalone version** - this is the most reliable method
2. Make sure dependencies are installed in the correct folder
3. Check access permissions to ~/.n8n/custom-nodes/ folder
4. Use npm package option instead of custom nodes

### Installation Check

After installation, you can verify the node is working:
```bash
# Check that files are copied
ls -la ~/.n8n/custom-nodes/n8n-node-converter-documents/

# Check that dependencies are installed
cd ~/.n8n/custom-nodes/n8n-node-converter-documents/
npm list
```

## Supported File Formats

- **Text formats:** DOC, DOCX, TXT, PDF
- **Spreadsheet formats:** XLSX, CSV *(XLS is not supported - please convert to XLSX)*
- **Presentation formats:** PPT, PPTX
- **Web formats:** HTML, HTM
- **Data formats:** XML

---

If you need documentation for any module or help with integration — feel free to ask!
