# n8n Document Converter Node - Standalone Version

Это standalone версия ноды для конвертации документов.

## Установка

1. Скопируйте эту папку в ~/.n8n/custom-nodes/
2. Установите зависимости:
   ```bash
   cd ~/.n8n/custom-nodes/n8n-node-converter-documents-standalone
   npm install
   ```
3. Перезапустите n8n

## Содержимое

- FileToJsonNode.node.js - основной файл ноды
- helpers.js - вспомогательные функции
- errors.js - кастомные ошибки
- package.json - зависимости
