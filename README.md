# n8n-nodes-converter-documents

## 📄 Description

This is a custom node for n8n designed to convert various file formats to JSON or text format. Supported formats: **DOCX**, **XML**, **YML**, **XLSX**, **CSV**, **PDF**, **TXT**, **PPTX**, **HTML/HTM**, **ODT**, **ODP**, **ODS**, **JSON**.

### ⚠️ Important Note about Legacy Microsoft Office Files

- **DOCX** (Word 2007+) - ✅ Fully supported
- **DOC** (Word 97-2003) - ❌ Not supported due to legacy CFB format limitations
- **PPTX** (PowerPoint 2007+) - ✅ Fully supported
- **PPT** (PowerPoint 97-2003) - ❌ Not supported due to legacy CFB format limitations
- **XLSX** (Excel 2007+) - ✅ Fully supported

### ✨ OpenDocument Format Support

- **ODT** (OpenDocument Text) - ✅ LibreOffice Writer documents
- **ODP** (OpenDocument Presentation) - ✅ LibreOffice Impress presentations
- **ODS** (OpenDocument Spreadsheet) - ✅ LibreOffice Calc spreadsheets

### 🛒 Yandex Market YML Support

- **YML** (Yandex Market Catalog) - ✅ Specialized parsing for Yandex Market product feeds
  - Automatic detection of YML catalog structure (`yml_catalog` root element)
  - Structured extraction of shop information, categories, and product offers
  - Statistical analysis (total products, available/unavailable items)
  - Parameter and attribute processing
  - Fallback to regular XML parsing for non-Yandex YML files

### 🔄 JSON Processing

- **JSON** files with automatic structure normalization - complex nested objects are flattened for easier processing

> **Note**: If you have old DOC/PPT files, please save them as DOCX/PPTX in Microsoft Office and try again.

## 🏗️ Architecture & Performance Optimizations

The node uses a hybrid approach with **officeparser** as the primary library for most document formats, with intelligent fallbacks:

- **Primary**: `officeparser` (supports DOCX, PPTX, XLSX, PDF, ODT, ODP, ODS)
- **Fallback for DOCX**: `mammoth` (if officeparser fails)  
- **Fallback for PDF**: `pdf-parse` (if officeparser fails)
- **Excel structure**: `ExcelJS` (for structured data extraction)
- **HTML/XML**: `cheerio` + `xml2js`
- **CSV**: `papaparse`
- **JSON**: Built-in normalization with structure flattening

This approach provides:
- ✅ Better format compatibility
- ✅ Improved error handling
- ✅ Performance optimization
- ✅ Reduced dependency complexity

## ⚠️ Important: Large File Limitations

- **PDF, XLSX:** The libraries used load the entire file into memory. When processing very large files (tens of megabytes, hundreds of thousands of rows), crashes, freezes, and memory limit exceeded errors are possible. For such cases, it's recommended to split files into smaller parts.

## 🔒 Security and Validation

- Input data undergoes strict validation (type, structure, size, presence of binary data)
- For HTML/HTM, sanitize-html is used to protect against XSS and malicious scripts
- **Security updates:** Replaced vulnerable libraries with secure alternatives (textract → officeparser)
- Regular dependency checks using npm audit and audit-ci

## 🚀 Features

- Automatic file type detection by extension or content
- Text or table extraction from popular office and text formats
- **OpenDocument support**: ODT, ODP, ODS files from LibreOffice/OpenOffice
- **JSON normalization**: Automatic flattening of nested JSON structures
- **Excel row/column preservation**: Toggleable original Excel row numbers with proper column letter mapping
- **Flexible sheet metadata**: User-configurable inclusion of filename and sheet name in output
- **Flexible output modes**: Choose between grouped file output or individual sheet items
- **Sheet-level workflow processing**: Output each sheet as separate n8n workflow items for parallel processing
- Output data: `{ text: "..." }` or `{ sheets: {...} }` + metadata (name, size, file type, processing time)
- Large file processing (up to 50 MB for most formats)
- Messages for empty or unsupported files
- Protection against malicious data and XSS
- Clear error messages for unsupported formats (e.g., old PPT files)

## 📚 Libraries Used

This project uses modern, actively maintained libraries:

- **officeparser** (v5.1.1) - Primary document parser with built-in PDF.js support
- **ExcelJS** (v4.4.0) - Excel file processing with full feature support  
- **mammoth** (v1.9.1) - DOCX fallback processor
- **pdf-parse** (v1.1.1) - PDF fallback processor
- **cheerio** (v1.1.0) - HTML/XML processing
- **papaparse** (v5.5.3) - CSV processing
- **xml2js** (v0.6.2) - XML parsing

## 🔧 CI/CD and Code Quality

- **GitHub Actions:** automatic testing on Node.js 18.x and 20.x
- **Linting:** ESLint with TypeScript support
- **Testing:** Jest with code coverage
- **Security:** automatic vulnerability checks
- **Build:** TypeScript compilation with type checking

## 📊 Input and Output Data Examples

**Input:**
- Binary file (e.g., DOCX, PDF, XLSX, etc.) in the `data` field

**Output:**

### For text formats:
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

### For tabular formats (with enhanced metadata):
```json
{
  "sheets": {
    "Sheet1": {
      "spreadsheetName": "example.xlsx",
      "sheetName": "Sheet1",
      "data": [ 
        { "A": "Value1", "B": "Value2" },
        { "A": "Value3", "B": "Value4" }
      ]
    },
    "Sheet2": {
      "spreadsheetName": "example.xlsx", 
      "sheetName": "Sheet2",
      "data": [
        { "A": "Data1", "B": "Data2" }
      ]
    }
  },
  "metadata": {
    "fileName": "example.xlsx",
    "fileSize": 23456,
    "fileType": "xlsx",
    "processedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

### Toggle Options for Sheet Processing:
- **Include File Name** (default: `true`): Adds `fileName` field to each sheet
- **Include Sheet Name** (default: `true`): Adds `sheetName` field to each sheet  
- **Include Original Row Numbers** (default: `false`): Adds `origRow` field to each data row
- **Output Sheets as Separate Items** (default: `false`): Each sheet becomes a separate n8n workflow item

### Standard Grouped Output (default):
```json
{
  "sheets": {
    "Sheet1": {
      "fileName": "example.xlsx",
      "sheetName": "Sheet1",
      "data": [ { "A": "Value1", "B": "Value2" } ]
    }
  }
}
```

### Individual Sheet Items Output (when "Output Sheets as Separate Items" enabled):
```json
[
  {
    "fileName": "example.xlsx",
    "sheetName": "Sheet1",
    "fileType": "xlsx",
    "fileSize": 23456,
    "processedAt": "2025-01-04T12:00:00.000Z",
    "rows": [
      { "A": "Value1", "B": "Value2" },
      { "A": "Value3", "B": "Value4" }
    ]
  },
  {
    "fileName": "example.xlsx", 
    "sheetName": "Sheet2",
    "fileType": "xlsx",
    "fileSize": 23456,
    "processedAt": "2025-01-04T12:00:00.000Z",
    "rows": [
      { "A": "Data1", "B": "Data2" }
    ]
  }
]
```

**Example with metadata toggles disabled:**
```json
[
  {
    "fileType": "xlsx",
    "fileSize": 23456, 
    "processedAt": "2025-01-04T12:00:00.000Z",
    "rows": [ { "A": "Value1", "B": "Value2" } ]
  }
]
```

### For JSON normalization:

**Input JSON:**
```json
{
  "user": {
    "name": "John",
    "address": {
      "city": "Moscow",
      "country": "Russia"
    }
  }
}
```

**Output:**
```json
{
  "text": "{\n  \"user.name\": \"John\",\n  \"user.address.city\": \"Moscow\",\n  \"user.address.country\": \"Russia\"\n}",
  "warning": "Multi-level JSON structure was converted to flat object",
  "metadata": {
    "fileName": "data.json",
    "fileSize": 156,
    "fileType": "json",
    "processedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

### For Yandex Market YML files:

**Input YML:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="2024-01-15 12:00">
  <shop>
    <name>Test Shop</name>
    <categories>
      <category id="1">Electronics</category>
    </categories>
    <offers>
      <offer id="12345" available="true">
        <name>Smartphone</name>
        <price>50000</price>
        <vendor>Apple</vendor>
      </offer>
    </offers>
  </shop>
</yml_catalog>
```

**Output:**
```json
{
  "text": "{\n  \"yandex_market_catalog\": {\n    \"shop_info\": {\n      \"name\": \"Test Shop\",\n      \"date\": \"2024-01-15 12:00\"\n    },\n    \"categories\": [\n      {\"id\": \"1\", \"name\": \"Electronics\"}\n    ],\n    \"offers\": [\n      {\n        \"id\": \"12345\",\n        \"name\": \"Smartphone\",\n        \"price\": \"50000\",\n        \"vendor\": \"Apple\",\n        \"available\": \"true\"\n      }\n    ],\n    \"statistics\": {\n      \"total_categories\": 1,\n      \"total_offers\": 1,\n      \"available_offers\": 1,\n      \"unavailable_offers\": 0\n    }\n  }\n}",
  "metadata": {
    "fileName": "catalog.yml",
    "fileSize": 512,
    "fileType": "yml",
    "processedAt": "2024-06-01T12:00:00.000Z"
  }
}
```

## 📁 Project Structure

- `src/` — source code folder (main logic)
- `helpers.ts` — helper functions
- `errors.ts` — custom error classes
- `test/` — test files and unit tests folder
- `package.json` — dependencies and scripts file
- `.github/workflows/` — CI/CD configuration
- `.gitignore` — excludes node_modules, dist and temporary files from git

## 📦 Installing Dependencies

All necessary dependencies are installed via npm:

```bash
npm install
```

## 💻 Development

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

## 💡 Recommendations

- To add new formats, you'll need to add the corresponding library and handler to the main file
- For n8n integration, make sure the node is correctly connected to your system
- For working with very large PDF, XLSX files, use preprocessing or third-party tools
- For security, always update dependencies and keep sanitize-html up to date
- Regularly check for vulnerabilities using `npm audit`

## 🔨 Build and Use with TypeScript

1. To build the project, run:
   ```bash
   npm run build
   ```
   The resulting files will appear in the `dist/` folder.

2. To use the custom node in n8n, specify the path to `dist/FileToJsonNode.node.js`.

3. Main file for n8n: `dist/FileToJsonNode.node.js` (see `main` field in package.json).

## 🚀 Usage in n8n

**Update v1.0.10**: Fixed support for ODT, ODP, ODS, JSON formats + improved architecture ✅

### Option 1: Install as npm package (recommended)

Or via n8n web interface:
1. Open Settings → Community nodes
2. Enter: `@mazix/n8n-nodes-converter-documents`
3. Click Install

### Option 2: Standalone version (easiest way)

1. **Create standalone version:**
   ```bash
   git clone https://github.com/mazixs/n8n-node-converter-documents.git
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

## 🔧 Troubleshooting

If you see an error `Cannot find module 'exceljs'` (or other modules):

1. **Use standalone version** - this is the most reliable method
2. Make sure dependencies are installed in the correct folder
3. Check access permissions to `~/.n8n/custom-nodes/` folder
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

## 📋 Supported File Formats

- **Text formats:** DOCX, ODT, TXT, PDF
- **Spreadsheet formats:** XLSX, ODS, CSV *(XLS is not supported - please convert to XLSX)*
- **Presentation formats:** PPTX, ODP *(PPT is not supported - please convert to PPTX)*
- **Web formats:** HTML, HTM
- **Data formats:** XML, JSON (with structure normalization)

## 📈 Latest Updates

### v1.1.8 (2025-01-04)
- **🐛 Critical Fix (Final)**: Resolved persistent "outputData.entries is not a function" error
- **Array Format Fix**: Changed return format to `[separateItems]` instead of `separateItems`
- **Root Cause**: n8n requires array of arrays format, matching grouped output structure
- **Impact**: "Output Sheets as Separate Items" feature now works correctly in all n8n workflows

### v1.1.7 (2025-01-04)
- **🐛 Critical Fix**: Resolved "outputData.entries is not a function" error when using "Output Sheets as Separate Items"
- **n8n Compatibility**: Fixed return format to properly wrap each sheet item for n8n workflow processing
- **Root Cause**: n8n requires each workflow item to be wrapped in `{ json: ... }` structure
- **Impact**: "Output Sheets as Separate Items" feature now works correctly in all n8n workflows

### v1.1.6 (2025-01-04)
- **🚀 Major Feature**: Added "Output Sheets as Separate Items" functionality
- **Individual Sheet Processing**: Each sheet becomes a separate n8n workflow item for parallel processing
- **Renamed Toggle**: "Include Spreadsheet Name" → "Include File Name" (parameter: `includeFileName`)
- **Unified Naming**: `spreadsheetName` → `fileName` (fileName and spreadsheetName were identical)
- **Flat Output Structure**: Removed nested wrappers, metadata at same level as data
- **Clean Array Format**: Sheet data now in `rows` array instead of `data` object
- **Text File Filtering**: PDF, DOCX, etc. automatically ignored in separate items mode
- **Flexible Metadata**: Always includes fileType, fileSize, processedAt; conditionally includes fileName, sheetName
- **Perfect for n8n Workflows**: Enables sheet-level processing, filtering, and transformations

### v1.1.5 (2025-01-04)
- **✨ New Features**: Added user-configurable sheet metadata toggles
- **Include Spreadsheet Name** toggle: Control whether to include the original filename in each sheet object (default: enabled)
- **Include Sheet Name** toggle: Control whether to include the sheet name in each sheet object (default: enabled)
- **Enhanced Output Structure**: Sheet objects now support flexible metadata inclusion
- **Backward Compatibility**: All new features default to enabled to maintain compatibility with existing workflows
- **Applies to**: Both XLSX and CSV file processing

### v1.1.4 (2025-01-04)
- **🔧 Internal**: Added spreadsheet name and sheet name to output structure
- **📊 Enhanced Metadata**: Each sheet now includes source file information
- **🏗️ Architecture**: Improved processing pipeline for better metadata handling

### v1.0.10 (2025-06-20)
- **🐛 Critical Fix**: Restored support for ODT, ODP, ODS and JSON formats
- Fixed "Unsupported file type" error for these formats
- Format handlers were implemented but not accessible due to configuration oversight

### v1.0.9 (2025-06-20)
- **🔧 CI/CD**: Fixed Jest compatibility issues
- Updated Jest command parameters for Jest 30+ compatibility
- All CI tests now pass successfully

---

If you need documentation for any module or help with integration — feel free to ask!
