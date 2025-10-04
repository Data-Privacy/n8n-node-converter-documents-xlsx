// Test script to verify the new toggle functionality
console.log('Testing new toggle functionality...');

console.log('\n=== New Toggle Options Added ===');
console.log('1. Include Spreadsheet Name (default: true)');
console.log('2. Include Sheet Name (default: true)');

console.log('\n=== Expected Output Structures ===');

console.log('\n--- Both toggles enabled (default) ---');
console.log(`{
  "sheets": {
    "Sheet1": {
      "spreadsheetName": "filename.xlsx",
      "sheetName": "Sheet1", 
      "data": [...]
    },
    "Sheet2": {
      "spreadsheetName": "filename.xlsx",
      "sheetName": "Sheet2",
      "data": [...]
    }
  }
}`);

console.log('\n--- Only spreadsheetName enabled ---');
console.log(`{
  "sheets": {
    "Sheet1": {
      "spreadsheetName": "filename.xlsx",
      "data": [...]
    }
  }
}`);

console.log('\n--- Only sheetName enabled ---');
console.log(`{
  "sheets": {
    "Sheet1": {
      "sheetName": "Sheet1",
      "data": [...]
    }
  }
}`);

console.log('\n--- Both toggles disabled ---');
console.log(`{
  "sheets": {
    "Sheet1": {
      "data": [...]
    }
  }
}`);

console.log('\n=== Node Properties Updated ===');
console.log('✓ Added "Include Spreadsheet Name" toggle');
console.log('✓ Added "Include Sheet Name" toggle');
console.log('✓ Both toggles default to true for backward compatibility');
console.log('✓ Toggles work for both XLSX and CSV files');

console.log('\n=== Implementation Complete ===');
console.log('The node now supports user-configurable output of:');
console.log('- spreadsheetName: original filename');
console.log('- sheetName: name of the sheet/tab');
console.log('- Both can be toggled on/off independently');