# Решение проблемы зависимостей в n8n custom nodes

## Проблема
При использовании кастомных нод в n8n возникает ошибка:
```
Error: Cannot find module 'exceljs'
```

Это происходит потому, что когда нода копируется в папку `/.n8n/custom-nodes/`, зависимости не устанавливаются автоматически.

## Решения

### 1. Standalone версия (рекомендуется)

Создайте standalone версию с собственным package.json:

```bash
# Клонируйте репозиторий
git clone https://github.com/mazix/n8n-node-converter-documents.git
cd n8n-node-converter-documents

# Установите зависимости и создайте standalone версию
npm install
npm run standalone

# Скопируйте в n8n
cp -r ./standalone ~/.n8n/custom-nodes/n8n-node-converter-documents
cd ~/.n8n/custom-nodes/n8n-node-converter-documents
npm install

# Перезапустите n8n
```

### 2. Использование npm пакета

```bash
# В папке с n8n проектом
npm install @mazix/n8n-nodes-converter-documents
```

### 3. Ручная установка зависимостей

```bash
# Скопируйте файлы
mkdir -p ~/.n8n/custom-nodes/n8n-node-converter-documents
cp dist/* ~/.n8n/custom-nodes/n8n-node-converter-documents/
cp package.json ~/.n8n/custom-nodes/n8n-node-converter-documents/

# Установите зависимости
cd ~/.n8n/custom-nodes/n8n-node-converter-documents
npm install --production
```

### 4. Глобальная установка

```bash
# Установите зависимости глобально
npm install -g chardet cheerio exceljs file-type iconv-lite mammoth officeparser papaparse pdf-parse sanitize-html xml2js

# Скопируйте только основной файл
cp dist/FileToJsonNode.node.js ~/.n8n/custom-nodes/
```

## Что делает standalone версия

Скрипт `create-standalone.js`:
1. Создает папку `./standalone/`
2. Копирует скомпилированные файлы из `dist/`
3. Создает минимальный `package.json` только с runtime зависимостями
4. Добавляет README с инструкциями

## Структура standalone версии

```
standalone/
├── FileToJsonNode.node.js  # Основной файл ноды
├── helpers.js              # Вспомогательные функции
├── errors.js               # Кастомные ошибки
├── package.json            # Только runtime зависимости
└── README.md               # Инструкции по установке
```

## Проверка установки

```bash
# Проверьте файлы
ls -la ~/.n8n/custom-nodes/n8n-node-converter-documents/

# Проверьте зависимости
cd ~/.n8n/custom-nodes/n8n-node-converter-documents/
npm list
```

## Опубликованный пакет

Пакет доступен на npmjs.org:
- **Название**: `@mazix/n8n-nodes-converter-documents`
- **Версия**: 1.0.3
- **Размер**: 11.0 kB (9 файлов)

## Полезные команды

```bash
# Создать standalone версию
npm run standalone

# Собрать проект
npm run build

# Запустить тесты
npm test

# Проверить пакет
npm pack --dry-run
```

Standalone версия - это самый надежный способ решения проблемы с зависимостями в n8n custom nodes. 