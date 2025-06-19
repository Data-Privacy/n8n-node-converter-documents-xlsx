const fs = require('fs');
const path = require('path');

// Создаем папку для standalone версии
const standaloneDir = path.join(__dirname, 'standalone');
if (!fs.existsSync(standaloneDir)) {
  fs.mkdirSync(standaloneDir);
}

// Копируем основной файл ноды
const mainFile = path.join(__dirname, 'dist', 'FileToJsonNode.node.js');
const targetFile = path.join(standaloneDir, 'FileToJsonNode.node.js');
fs.copyFileSync(mainFile, targetFile);

// Копируем вспомогательные файлы
const helperFiles = ['helpers.js', 'errors.js'];
helperFiles.forEach(file => {
  const srcFile = path.join(__dirname, 'dist', file);
  const dstFile = path.join(standaloneDir, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, dstFile);
  }
});

// Создаем минимальный package.json только с необходимыми зависимостями
const originalPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const standalonePackage = {
  name: 'n8n-node-converter-documents-standalone',
  version: originalPackage.version,
  description: 'Standalone version of n8n document converter node',
  main: 'FileToJsonNode.node.js',
  dependencies: {
    'chardet': originalPackage.dependencies.chardet,
    'cheerio': originalPackage.dependencies.cheerio,
    'exceljs': originalPackage.dependencies.exceljs,
    'file-type': originalPackage.dependencies['file-type'],
    'iconv-lite': originalPackage.dependencies['iconv-lite'],
    'mammoth': originalPackage.dependencies.mammoth,
    'officeparser': originalPackage.dependencies.officeparser,
    'papaparse': originalPackage.dependencies.papaparse,
    'pdf-parse': originalPackage.dependencies['pdf-parse'],
    'sanitize-html': originalPackage.dependencies['sanitize-html'],
    'xml2js': originalPackage.dependencies.xml2js
  }
};

fs.writeFileSync(
  path.join(standaloneDir, 'package.json'),
  JSON.stringify(standalonePackage, null, 2)
);

// Создаем README для standalone версии
const standaloneReadme = `# n8n Document Converter Node - Standalone Version

Это standalone версия ноды для конвертации документов.

## Установка

1. Скопируйте эту папку в ~/.n8n/custom-nodes/
2. Установите зависимости:
   \`\`\`bash
   cd ~/.n8n/custom-nodes/n8n-node-converter-documents-standalone
   npm install
   \`\`\`
3. Перезапустите n8n

## Содержимое

- FileToJsonNode.node.js - основной файл ноды
- helpers.js - вспомогательные функции
- errors.js - кастомные ошибки
- package.json - зависимости
`;

fs.writeFileSync(path.join(standaloneDir, 'README.md'), standaloneReadme);

console.log('✅ Standalone версия создана в папке ./standalone/');
console.log('📁 Содержимое:');
console.log('   - FileToJsonNode.node.js');
console.log('   - helpers.js');
console.log('   - errors.js');
console.log('   - package.json (только runtime зависимости)');
console.log('   - README.md');
console.log('');
console.log('🚀 Для использования в n8n:');
console.log('   1. cp -r ./standalone ~/.n8n/custom-nodes/n8n-node-converter-documents');
console.log('   2. cd ~/.n8n/custom-nodes/n8n-node-converter-documents');
console.log('   3. npm install');
console.log('   4. Перезапустите n8n'); 