# Пример интеграции OCR для PDF

Этот документ демонстрирует, как интегрировать OCR возможности для обработки сканированных PDF документов.

## Установка зависимостей

```bash
npm install pdf-to-png-converter tesseract.js
```

## Базовая реализация

```typescript
import { pdfToPng } from 'pdf-to-png-converter';
import { createWorker } from 'tesseract.js';
import * as fs from 'fs';

interface OCRResult {
  text: string;
  confidence: number;
  pages: number;
  processingTime: number;
}

interface PDFOCROptions {
  language?: string;
  maxPages?: number;
  minTextThreshold?: number;
  viewportScale?: number;
  verbosity?: boolean;
}

export class PDFOCRProcessor {
  private tesseractWorker: any = null;
  
  constructor(private options: PDFOCROptions = {}) {
    this.options = {
      language: 'rus+eng', // Русский + английский
      maxPages: 5,         // Ограничение для производительности
      minTextThreshold: 50, // Минимум символов для определения сканированного PDF
      viewportScale: 2.0,   // Высокое качество для лучшего OCR
      verbosity: false,
      ...options
    };
  }

  /**
   * Трехуровневая обработка PDF
   */
  async processPDF(pdfBuffer: Buffer): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      // Уровень 1: Попытка извлечь текст обычными методами
      const regularText = await this.extractRegularText(pdfBuffer);
      
      if (this.isTextualPDF(regularText)) {
        return {
          text: regularText,
          confidence: 1.0,
          pages: 1,
          processingTime: Date.now() - startTime
        };
      }

      // Уровень 2: OCR обработка
      console.log('🔍 Обнаружен сканированный PDF, запускаем OCR...');
      const ocrResult = await this.performOCR(pdfBuffer);
      
      return {
        ...ocrResult,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      throw new Error(`Ошибка обработки PDF: ${error.message}`);
    }
  }

  /**
   * Извлечение текста обычными методами (officeparser, pdf-parse)
   */
  private async extractRegularText(pdfBuffer: Buffer): Promise<string> {
    // Здесь будет логика из существующих парсеров
    // Для примера возвращаем пустую строку (имитация сканированного PDF)
    return '';
  }

  /**
   * Проверка, является ли PDF текстовым
   */
  private isTextualPDF(text: string): boolean {
    const cleanText = text.trim().replace(/\s+/g, ' ');
    return cleanText.length >= this.options.minTextThreshold!;
  }

  /**
   * OCR обработка PDF
   */
  private async performOCR(pdfBuffer: Buffer): Promise<Omit<OCRResult, 'processingTime'>> {
    // Конвертация PDF в изображения
    const pngPages = await pdfToPng(pdfBuffer, {
      viewportScale: this.options.viewportScale,
      pagesToProcess: Array.from({length: this.options.maxPages!}, (_, i) => i + 1),
      verbosityLevel: this.options.verbosity ? 1 : 0,
      // Не сохраняем файлы, работаем только с Buffer
      outputFolder: undefined
    });

    if (pngPages.length === 0) {
      throw new Error('Не удалось конвертировать PDF в изображения');
    }

    // Инициализация Tesseract worker
    await this.initTesseractWorker();

    let allText = '';
    let totalConfidence = 0;
    let processedPages = 0;

    // Обработка каждой страницы
    for (const page of pngPages) {
      try {
        if (this.options.verbosity) {
          console.log(`📄 Обрабатываем страницу ${page.pageNumber}...`);
        }

        const result = await this.tesseractWorker.recognize(page.content);
        const pageText = result.data.text.trim();
        const confidence = result.data.confidence / 100;

        if (pageText.length > 10) { // Игнорируем страницы с минимальным текстом
          allText += `\n--- Страница ${page.pageNumber} ---\n${pageText}\n`;
          totalConfidence += confidence;
          processedPages++;
        }

        if (this.options.verbosity) {
          console.log(`✅ Страница ${page.pageNumber}: ${pageText.length} символов, точность: ${(confidence * 100).toFixed(1)}%`);
        }

      } catch (error) {
        console.warn(`⚠️ Ошибка обработки страницы ${page.pageNumber}:`, error.message);
      }
    }

    const avgConfidence = processedPages > 0 ? totalConfidence / processedPages : 0;

    return {
      text: allText.trim(),
      confidence: avgConfidence,
      pages: processedPages
    };
  }

  /**
   * Инициализация Tesseract worker
   */
  private async initTesseractWorker(): Promise<void> {
    if (this.tesseractWorker) {
      return;
    }

    if (this.options.verbosity) {
      console.log('🚀 Инициализация Tesseract OCR...');
    }

    this.tesseractWorker = await createWorker(this.options.language!, 1, {
      logger: this.options.verbosity ? (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`📊 Прогресс OCR: ${(m.progress * 100).toFixed(1)}%`);
        }
      } : undefined
    });
  }

  /**
   * Очистка ресурсов
   */
  async cleanup(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
      this.tesseractWorker = null;
    }
  }
}
```

## Интеграция в FileToJsonNode

```typescript
// В src/FileToJsonNode.node.ts

import { PDFOCRProcessor } from './pdf-ocr-processor';

export class FileToJsonNode implements INodeType {
  // ... существующий код ...

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
        const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
        
        let fileBuffer: Buffer;
        if (binaryData.id) {
          fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
        } else {
          fileBuffer = Buffer.from(binaryData.data, 'base64');
        }

        const mimeType = binaryData.mimeType || '';
        const fileName = binaryData.fileName || 'unknown';

        let result: any;

        // Обработка PDF с OCR поддержкой
        if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
          result = await this.processPDFWithOCR(fileBuffer, fileName);
        } else {
          // Обработка других форматов
          result = await this.processOtherFormats(fileBuffer, fileName, mimeType);
        }

        returnData.push({
          json: result,
          binary: {
            [binaryPropertyName]: binaryData,
          },
        });

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: error.message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }

  /**
   * Обработка PDF с OCR поддержкой
   */
  private async processPDFWithOCR(fileBuffer: Buffer, fileName: string): Promise<any> {
    const ocrProcessor = new PDFOCRProcessor({
      language: 'rus+eng',
      maxPages: 3, // Ограничиваем для n8n окружения
      verbosity: false // Отключаем подробные логи в production
    });

    try {
      // Сначала пытаемся обычные методы
      const regularResult = await this.processWithExistingParsers(fileBuffer, fileName);
      
      // Проверяем, достаточно ли текста
      const textLength = this.extractTextLength(regularResult);
      
      if (textLength >= 50) {
        // Достаточно текста, возвращаем результат обычных парсеров
        return regularResult;
      }

      // Недостаточно текста, используем OCR
      console.log(`🔍 PDF "${fileName}" содержит мало текста (${textLength} символов), используем OCR`);
      
      const ocrResult = await ocrProcessor.processPDF(fileBuffer);
      
      return {
        ...regularResult,
        ocr: {
          text: ocrResult.text,
          confidence: ocrResult.confidence,
          pages: ocrResult.pages,
          processingTime: ocrResult.processingTime,
          method: 'tesseract.js'
        },
        // Заменяем основной текст на OCR результат если он лучше
        content: ocrResult.text.length > textLength ? ocrResult.text : regularResult.content
      };

    } finally {
      await ocrProcessor.cleanup();
    }
  }

  /**
   * Обработка существующими парсерами
   */
  private async processWithExistingParsers(fileBuffer: Buffer, fileName: string): Promise<any> {
    // Здесь используется существующая логика из FileToJsonNode
    // officeparser -> pdf-parse fallback
    return { content: '', metadata: { fileName, size: fileBuffer.length } };
  }

  /**
   * Извлечение длины текста из результата
   */
  private extractTextLength(result: any): number {
    if (typeof result.content === 'string') {
      return result.content.trim().length;
    }
    return 0;
  }
}
```

## Пример использования

```typescript
// Тестирование OCR процессора
async function testOCR() {
  const pdfBuffer = fs.readFileSync('./test-scanned.pdf');
  
  const processor = new PDFOCRProcessor({
    language: 'rus+eng',
    maxPages: 3,
    verbosity: true
  });

  try {
    const result = await processor.processPDF(pdfBuffer);
    
    console.log('📊 Результаты OCR:');
    console.log(`📄 Обработано страниц: ${result.pages}`);
    console.log(`🎯 Точность: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`⏱️ Время обработки: ${result.processingTime}мс`);
    console.log(`📝 Длина текста: ${result.text.length} символов`);
    console.log('📋 Извлеченный текст:');
    console.log(result.text.substring(0, 500) + '...');
    
  } finally {
    await processor.cleanup();
  }
}
```

## Настройки производительности

```typescript
// Конфигурация для разных сценариев
const configs = {
  // Быстрая обработка (для preview)
  fast: {
    language: 'eng',
    maxPages: 1,
    viewportScale: 1.0,
    verbosity: false
  },
  
  // Сбалансированная обработка
  balanced: {
    language: 'rus+eng', 
    maxPages: 3,
    viewportScale: 1.5,
    verbosity: false
  },
  
  // Максимальное качество
  quality: {
    language: 'rus+eng',
    maxPages: 10,
    viewportScale: 2.0,
    verbosity: true
  }
};
```

## Обработка ошибок

```typescript
// Робастная обработка ошибок
try {
  const result = await processor.processPDF(pdfBuffer);
} catch (error) {
  if (error.message.includes('pdf-to-png-converter')) {
    console.error('❌ Ошибка конвертации PDF в изображения:', error.message);
    // Fallback на обычные PDF парсеры
  } else if (error.message.includes('tesseract')) {
    console.error('❌ Ошибка OCR обработки:', error.message);
    // Возможно, проблема с языковыми данными
  } else {
    console.error('❌ Общая ошибка OCR:', error.message);
  }
  
  // Возврат к обычной обработке PDF
  return await processWithRegularParsers(pdfBuffer);
}
```

## Мониторинг и метрики

```typescript
// Сбор метрик для анализа эффективности
interface OCRMetrics {
  totalPDFs: number;
  ocrUsed: number;
  avgConfidence: number;
  avgProcessingTime: number;
  errorRate: number;
}

class OCRMetricsCollector {
  private metrics: OCRMetrics = {
    totalPDFs: 0,
    ocrUsed: 0,
    avgConfidence: 0,
    avgProcessingTime: 0,
    errorRate: 0
  };

  recordOCRUsage(result: OCRResult): void {
    this.metrics.totalPDFs++;
    this.metrics.ocrUsed++;
    this.metrics.avgConfidence = 
      (this.metrics.avgConfidence * (this.metrics.ocrUsed - 1) + result.confidence) / this.metrics.ocrUsed;
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (this.metrics.ocrUsed - 1) + result.processingTime) / this.metrics.ocrUsed;
  }

  recordRegularProcessing(): void {
    this.metrics.totalPDFs++;
  }

  recordError(): void {
    this.metrics.errorRate = (this.metrics.errorRate * this.metrics.totalPDFs + 1) / (this.metrics.totalPDFs + 1);
  }

  getMetrics(): OCRMetrics {
    return { ...this.metrics };
  }
}
```

## Заключение

Данная реализация предоставляет:

1. **Трехуровневую систему обработки PDF:**
   - Обычные парсеры (быстро)
   - OCR (для сканированных документов)
   - Умное определение типа документа

2. **Оптимизированную производительность:**
   - Ограничение количества страниц
   - Настраиваемое качество
   - Прогресс-трекинг

3. **Робастную обработку ошибок:**
   - Fallback на обычные парсеры
   - Детальная диагностика ошибок
   - Graceful degradation

4. **Мониторинг и аналитику:**
   - Метрики использования OCR
   - Анализ эффективности
   - Оптимизация на основе данных

Эта архитектура значительно расширяет возможности обработки PDF документов, сохраняя при этом производительность для обычных текстовых PDF. 