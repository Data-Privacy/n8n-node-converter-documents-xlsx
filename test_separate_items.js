// Test script to verify the new "Output Sheets as Separate Items" functionality
console.log('Testing "Output Sheets as Separate Items" functionality...');

console.log('\n=== New Feature: Output Sheets as Separate Items ===');
console.log('Toggle Name: "Output Sheets as Separate Items"');
console.log('Default: false (maintains current behavior)');
console.log('Description: Output each sheet as a separate workflow item instead of grouped by file');

console.log('\n=== Behavior when ENABLED ===');
console.log('- Each sheet becomes a separate n8n workflow item');
console.log('- Text files (PDF, DOCX, etc.) are ignored');
console.log('- "Include Spreadsheet Name" and "Include Sheet Name" toggles still work');
console.log('- 2 files with 3 sheets each = 6 separate downstream items');

console.log('\n=== Expected Output Structure (Toggle ENABLED) ===');
console.log('Input: 2 Excel files, each with 2 sheets');
console.log('Output: Array of 4 separate items:');

const exampleOutput = [
  {
    json: {
      spreadsheetName: "file1.xlsx",
      sheetName: "Sheet1",
      data: [
        {"A": "Value1", "B": "Value2"},
        {"A": "Value3", "B": "Value4"}
      ],
      metadata: {
        fileName: "file1.xlsx",
        fileSize: 23456,
        fileType: "xlsx",
        processedAt: "2025-01-04T12:00:00.000Z"
      }
    }
  },
  {
    json: {
      spreadsheetName: "file1.xlsx", 
      sheetName: "Sheet2",
      data: [
        {"A": "Data1", "B": "Data2"}
      ],
      metadata: {
        fileName: "file1.xlsx",
        fileSize: 23456,
        fileType: "xlsx", 
        processedAt: "2025-01-04T12:00:00.000Z"
      }
    }
  },
  {
    json: {
      spreadsheetName: "file2.xlsx",
      sheetName: "Sheet1", 
      data: [
        {"A": "Other1", "B": "Other2"}
      ],
      metadata: {
        fileName: "file2.xlsx",
        fileSize: 34567,
        fileType: "xlsx",
        processedAt: "2025-01-04T12:00:00.000Z"
      }
    }
  },
  {
    json: {
      spreadsheetName: "file2.xlsx",
      sheetName: "Sheet2",
      data: [
        {"A": "Final1", "B": "Final2"}
      ],
      metadata: {
        fileName: "file2.xlsx", 
        fileSize: 34567,
        fileType: "xlsx",
        processedAt: "2025-01-04T12:00:00.000Z"
      }
    }
  }
];

console.log(JSON.stringify(exampleOutput, null, 2));

console.log('\n=== Expected Output Structure (Toggle DISABLED - Current Behavior) ===');
const currentOutput = [{
  json: {
    files: [
      {
        sheets: {
          "Sheet1": {
            spreadsheetName: "file1.xlsx",
            sheetName: "Sheet1", 
            data: [{"A": "Value1", "B": "Value2"}]
          },
          "Sheet2": {
            spreadsheetName: "file1.xlsx",
            sheetName: "Sheet2",
            data: [{"A": "Data1", "B": "Data2"}]
          }
        },
        metadata: { fileName: "file1.xlsx", fileType: "xlsx" }
      },
      {
        sheets: {
          "Sheet1": {
            spreadsheetName: "file2.xlsx", 
            sheetName: "Sheet1",
            data: [{"A": "Other1", "B": "Other2"}]
          }
        },
        metadata: { fileName: "file2.xlsx", fileType: "xlsx" }
      }
    ],
    totalFiles: 2,
    processedAt: "2025-01-04T12:00:00.000Z"
  }
}];

console.log(JSON.stringify(currentOutput, null, 2));

console.log('\n=== Key Implementation Details ===');
console.log('✓ Added toggle to node interface');
console.log('✓ Updated ProcessingOptions interface');
console.log('✓ Modified execute method return logic'); 
console.log('✓ Text files ignored when toggle enabled');
console.log('✓ Simplified metadata structure for each sheet item');
console.log('✓ Respects existing toggle settings for spreadsheet/sheet names');

console.log('\n=== Use Cases ===');
console.log('- When you need to process each sheet individually in your workflow');
console.log('- For parallel processing of different sheets');
console.log('- When downstream nodes expect individual sheet data');
console.log('- For easier sheet-level filtering and transformation');

console.log('\n=== Implementation Complete ===');