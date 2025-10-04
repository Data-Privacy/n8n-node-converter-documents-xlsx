# Changelog

## [1.1.5] - 2025-01-04

### ✨ New Features
- **Include Spreadsheet Name Toggle**: Added user-configurable option to control whether to include the original filename in each sheet object (default: enabled)
- **Include Sheet Name Toggle**: Added user-configurable option to control whether to include the sheet name in each sheet object (default: enabled)
- **Enhanced n8n Interface**: Added new toggle controls in the node configuration panel
- **Flexible Output Structure**: Sheet objects now support dynamic metadata inclusion based on user preferences

### 🔧 Technical Implementation
- Extended `ProcessingOptions` interface with `includeSpreadsheetName` and `includeSheetName` parameters
- Updated all sheet processing strategies (xlsx, csv, processExcel, streamCsvStrategy) to respect toggle settings
- Implemented conditional object spreading for dynamic metadata inclusion
- Added proper TypeScript type support for flexible sheet structures

### 📊 Output Structure Examples

**Full metadata (default behavior):**
```json
{
  "sheets": {
    "Sheet1": {
      "spreadsheetName": "example.xlsx",
      "sheetName": "Sheet1", 
      "data": [{"A": "Value1", "B": "Value2"}]
    }
  }
}
```

**Minimal output (both toggles disabled):**
```json
{
  "sheets": {
    "Sheet1": {
      "data": [{"A": "Value1", "B": "Value2"}]
    }
  }
}
```

### 🎯 Impact
- **Backward Compatibility**: All new toggles default to enabled, maintaining existing workflow behavior
- **User Control**: Users can now customize output structure based on their needs
- **Data Efficiency**: Option to reduce output size by excluding unnecessary metadata
- **Applies to**: Both XLSX and CSV file processing

### 📁 Files Modified
- `src/FileToJsonNode.node.ts`: Added toggle options and processing logic
- `README.md`: Updated documentation with new features and examples
- `package.json`: Version bump to 1.1.5

---

## [1.1.4] - 2025-01-04

### ✨ New Features  
- **Automatic Spreadsheet Name Inclusion**: Each sheet object now automatically includes the source spreadsheet filename
- **Automatic Sheet Name Inclusion**: Each sheet object now includes the sheet name for better data lineage
- **Enhanced Metadata Structure**: Improved data tracking capabilities

### 🔧 Technical Changes
- Modified xlsx and csv processing strategies to include filename metadata
- Updated TypeScript interfaces to support new sheet structure
- Enhanced processExcel function with metadata handling

### 📊 Breaking Change
- **Sheet Structure**: Changed from `sheets.SheetName: [...]` to `sheets.SheetName: {spreadsheetName, sheetName, data: [...]}`
- **Migration**: Update downstream processes expecting the old array format

---

## [1.0.11.1] - 2025-01-27

### 🔧 Bug Fixes
- **GitHub Actions**: Fixed permissions error in release workflow
  - Added `checks: write` permission to release.yml
  - Resolves workflow error when calling ci.yml from release.yml
- **Code Quality**: Fixed all TypeScript linter errors (18 issues)
  - Replaced `any` types with proper interfaces for YML processing
  - Added type-safe interfaces: YmlCurrency, YmlCategory, YmlOffer, YmlShop, YmlCatalog
  - Fixed `require()` import in integration tests
  - Added eslint-disable comments for test files where needed
- **Build**: All tests passing (60/60) and linter clean

### 📝 Technical Details
- Enhanced type safety for YML processing functions
- Improved code maintainability and IDE support
- No functional changes - purely technical improvements

---

## [1.0.11] - 2025-01-27

### ✨ New Features
- **YML Support**: Added comprehensive support for YML file format
  - Specialized processing for Yandex Market catalog files (yml_catalog format)
  - Structured JSON output with sections: shop_info, currencies, categories, offers, statistics
  - Automatic detection of Yandex Market YML structure
  - Fallback to standard XML processing for regular YML files
  - Support for product parameters, images, delivery options
  - Performance optimized for typical catalog sizes with warnings for large datasets

### 📄 Technical Implementation
- Added `processYandexMarketYml` function for specialized YML processing
- Enhanced file type detection and processing strategies
- Comprehensive test coverage with integration and unit tests
- Updated documentation with YML examples and usage guidelines

### 📁 Files Added/Modified
- `src/FileToJsonNode.node.ts`: Added YML processing strategy
- `test/samples/sample_yandex_market.yml`: Sample YML test file
- `test/integration/yml-integration.test.ts`: Integration tests
- `test/unit/yml-processor.test.ts`: Unit tests
- `docs/yml_support.md`: Comprehensive YML documentation
- `README.md`: Updated with YML support information

### 🎯 Impact
- Users can now process Yandex Market catalog files with structured output
- Enhanced data extraction capabilities for e-commerce integrations
- Backward compatible - no breaking changes

---

## [1.0.10] - 2025-06-20

### 🐛 Bug Fixes
- **Critical**: Fixed support for ODT, ODP, ODS, and JSON file formats
  - Added missing format extensions to supported formats list
  - Resolves "Unsupported file type" error for these formats
  - Format processing strategies were already implemented but not accessible

### 📋 Technical Details
- Added `odt`, `odp`, `ods`, `json` to the `supported` array in FileToJsonNode
- All format handlers were previously implemented in the `strategies` object
- This was a configuration oversight that prevented format recognition

### 🔧 Files Changed
- `src/FileToJsonNode.node.ts`: Updated supported formats array

### 🎯 Impact
- Users can now successfully process OpenDocument formats (ODT, ODP, ODS)
- JSON files are now properly recognized and processed
- No breaking changes - purely additive fix

---

## [1.0.9] - 2025-06-20

### 🐛 Bug Fixes
- **CI/CD**: Fixed Jest parameter compatibility issues
  - Updated `--testPathPattern` to `--testPathPatterns` in all CI commands
  - Resolves Jest 30+ compatibility problems
  - All CI tests now pass successfully

### 🔧 Files Changed
- `.github/workflows/ci.yml`: Updated Jest command parameters

---

## Previous Versions

For changes in versions 1.0.8 and earlier, please see the [GitHub releases page](https://github.com/mazixs/n8n-node-converter-documents/releases). 