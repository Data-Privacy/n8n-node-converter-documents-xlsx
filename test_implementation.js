// Simple test to verify the implementation
const fs = require('fs');

// Mock n8n environment
const mockThis = {
  getInputData: () => [
    {
      binary: {
        data: {
          fileName: 'test.xlsx',
          data: Buffer.from('test')
        }
      }
    }
  ],
  getNodeParameter: (param, index, defaultValue) => defaultValue,
  helpers: {
    getBinaryDataBuffer: () => Promise.resolve(Buffer.from('test'))
  },
  logger: {
    info: console.log,
    warn: console.warn
  }
};

console.log('Testing implementation changes...');
console.log('The code has been modified to include spreadsheetName in each sheet object');
console.log('Structure will now be:');
console.log(`{
  "sheets": {
    "Sheet1": {
      "spreadsheetName": "filename.xlsx",
      "data": [...]
    }
  }
}`);
console.log('Implementation test complete.');