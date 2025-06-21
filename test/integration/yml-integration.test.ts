import { readFileSync } from 'fs';
import { join } from 'path';
import { parseStringPromise } from 'xml2js';

describe('YML Integration Tests', () => {
  test('should parse Yandex Market YML file structure', async () => {
    const filePath = join(__dirname, '../samples/sample_yandex_market.yml');
    const ymlContent = readFileSync(filePath, 'utf8');
    
    // Проверяем, что файл содержит правильную структуру
    expect(ymlContent).toContain('yml_catalog');
    expect(ymlContent).toContain('<shop>');
    expect(ymlContent).toContain('<offers>');
    expect(ymlContent).toContain('<categories>');
    expect(ymlContent).toContain('Смартфон Apple iPhone 15');
    expect(ymlContent).toContain('Электроника');
    
    // Проверяем атрибуты
    expect(ymlContent).toContain('id="12345"');
    expect(ymlContent).toContain('available="true"');
    expect(ymlContent).toContain('parentId="1"');
  });
  
  test('should handle YML file with XML parsing', async () => {
    const filePath = join(__dirname, '../samples/sample_yandex_market.yml');
    const ymlContent = readFileSync(filePath, 'utf8');
    
    const parsed = await parseStringPromise(ymlContent);
    
    // Проверяем основную структуру
    expect(parsed.yml_catalog).toBeDefined();
    expect(parsed.yml_catalog.shop).toBeDefined();
    
    const shop = parsed.yml_catalog.shop[0];
    expect(shop.name[0]).toBe('Интернет-магазин "Технотест"');
    expect(shop.company[0]).toBe('ООО "Технотест"');
    
    // Проверяем категории
    expect(shop.categories[0].category).toBeDefined();
    expect(Array.isArray(shop.categories[0].category)).toBe(true);
    expect(shop.categories[0].category.length).toBe(5);
    
    // Проверяем товары
    expect(shop.offers[0].offer).toBeDefined();
    expect(Array.isArray(shop.offers[0].offer)).toBe(true);
    expect(shop.offers[0].offer.length).toBe(3);
    
    const firstOffer = shop.offers[0].offer[0];
    expect(firstOffer.$.id).toBe('12345');
    expect(firstOffer.$.available).toBe('true');
    expect(firstOffer.name[0]).toBe('Смартфон Apple iPhone 15 128GB');
  });
}); 