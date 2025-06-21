import { parseStringPromise } from 'xml2js';

// Копируем функцию processYandexMarketYml для тестирования
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function processYandexMarketYml(parsed: any): { text: string; warning?: string } {
  try {
    const catalog = parsed.yml_catalog;
    const shop = catalog.shop[0] || catalog.shop;
    
    // Извлекаем основную информацию о магазине
    const shopInfo = {
      name: shop.name?.[0] || shop.name || 'Unknown Shop',
      company: shop.company?.[0] || shop.company || '',
      url: shop.url?.[0] || shop.url || '',
      date: catalog.$?.date || catalog.date || ''
    };
    
    // Обрабатываем валюты
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currencies: any[] = [];
    if (shop.currencies && shop.currencies[0] && shop.currencies[0].currency) {
      const currencyList = Array.isArray(shop.currencies[0].currency) 
        ? shop.currencies[0].currency 
        : [shop.currencies[0].currency];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      currencies.push(...currencyList.map((curr: any) => ({
        id: curr.$.id || curr.id,
        rate: curr.$.rate || curr.rate || '1'
      })));
    }
    
    // Обрабатываем категории
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories: any[] = [];
    if (shop.categories && shop.categories[0] && shop.categories[0].category) {
      const categoryList = Array.isArray(shop.categories[0].category) 
        ? shop.categories[0].category 
        : [shop.categories[0].category];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      categories.push(...categoryList.map((cat: any) => ({
        id: cat.$.id || cat.id,
        name: cat._ || cat.name || cat,
        parentId: cat.$.parentId || cat.parentId || null
      })));
    }
    
    // Обрабатываем товары (offers)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offers: any[] = [];
    if (shop.offers && shop.offers[0] && shop.offers[0].offer) {
      const offerList = Array.isArray(shop.offers[0].offer) 
        ? shop.offers[0].offer 
        : [shop.offers[0].offer];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      offers.push(...offerList.map((offer: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const offerData: any = {
          id: offer.$.id || offer.id,
          available: offer.$.available || offer.available || 'true',
          name: offer.name?.[0] || offer.name || '',
          url: offer.url?.[0] || offer.url || '',
          price: offer.price?.[0] || offer.price || '',
          currencyId: offer.currencyId?.[0] || offer.currencyId || '',
          categoryId: offer.categoryId?.[0] || offer.categoryId || '',
          vendor: offer.vendor?.[0] || offer.vendor || '',
          description: offer.description?.[0] || offer.description || ''
        };
        
        // Добавляем опциональные поля
        if (offer.oldprice) offerData.oldprice = offer.oldprice[0] || offer.oldprice;
        if (offer.vendorCode) offerData.vendorCode = offer.vendorCode[0] || offer.vendorCode;
        if (offer.barcode) offerData.barcode = offer.barcode[0] || offer.barcode;
        if (offer.sales_notes) offerData.sales_notes = offer.sales_notes[0] || offer.sales_notes;
        if (offer.delivery) offerData.delivery = offer.delivery[0] || offer.delivery;
        if (offer.pickup) offerData.pickup = offer.pickup[0] || offer.pickup;
        
        // Обрабатываем картинки
        if (offer.picture) {
          const pictures = Array.isArray(offer.picture) ? offer.picture : [offer.picture];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          offerData.pictures = pictures.map((pic: any) => pic._ || pic || '');
        }
        
        // Обрабатываем параметры
        if (offer.param) {
          const params = Array.isArray(offer.param) ? offer.param : [offer.param];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          offerData.parameters = params.map((param: any) => ({
            name: param.$.name || param.name,
            value: param._ || param.value || param,
            unit: param.$.unit || param.unit || null
          }));
        }
        
        return offerData;
      }));
    }
    
    // Формируем итоговую структуру
    const result = {
      yandex_market_catalog: {
        shop_info: shopInfo,
        currencies: currencies,
        categories: categories,
        offers: offers,
        statistics: {
          total_categories: categories.length,
          total_offers: offers.length,
          available_offers: offers.filter(o => o.available === 'true' || o.available === true).length,
          unavailable_offers: offers.filter(o => o.available === 'false' || o.available === false).length
        }
      }
    };
    
    return { 
      text: JSON.stringify(result, null, 2),
      warning: offers.length > 1000 ? `Большой каталог: ${offers.length} товаров` : undefined
    };
  } catch (error) {
    throw new Error(`YML catalog processing error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

describe('YML Processor Unit Tests', () => {
  const sampleYmlXml = `<?xml version="1.0" encoding="UTF-8"?>
  <yml_catalog date="2024-01-15 12:00">
    <shop>
      <name>Интернет-магазин "Технотест"</name>
      <company>ООО "Технотест"</company>
      <url>https://example.com</url>
      
      <currencies>
        <currency id="RUR" rate="1"/>
      </currencies>
      
      <categories>
        <category id="1">Электроника</category>
        <category id="2" parentId="1">Смартфоны</category>
      </categories>
      
      <offers>
        <offer id="12345" available="true">
          <name>Смартфон Apple iPhone 15 128GB</name>
          <url>https://example.com/iphone15</url>
          <price>89990</price>
          <oldprice>99990</oldprice>
          <currencyId>RUR</currencyId>
          <categoryId>2</categoryId>
          <vendor>Apple</vendor>
          <vendorCode>IPHONE15-128</vendorCode>
          <picture>https://example.com/images/iphone15_1.jpg</picture>
          <description>Новый iPhone 15</description>
          <param name="Цвет">Черный</param>
          <param name="Память">128 ГБ</param>
          <delivery>true</delivery>
          <pickup>true</pickup>
        </offer>
      </offers>
    </shop>
  </yml_catalog>`;

  test('should process YML structure correctly', async () => {
    const parsed = await parseStringPromise(sampleYmlXml);
    const result = processYandexMarketYml(parsed);
    
    expect(result.text).toBeDefined();
    const catalog = JSON.parse(result.text).yandex_market_catalog;
    
    // Проверяем информацию о магазине
    expect(catalog.shop_info.name).toBe('Интернет-магазин "Технотест"');
    expect(catalog.shop_info.company).toBe('ООО "Технотест"');
    expect(catalog.shop_info.url).toBe('https://example.com');
    expect(catalog.shop_info.date).toBe('2024-01-15 12:00');
    
    // Проверяем валюты
    expect(catalog.currencies).toHaveLength(1);
    expect(catalog.currencies[0].id).toBe('RUR');
    expect(catalog.currencies[0].rate).toBe('1');
    
    // Проверяем категории
    expect(catalog.categories).toHaveLength(2);
    expect(catalog.categories[0].name).toBe('Электроника');
    expect(catalog.categories[1].name).toBe('Смартфоны');
    expect(catalog.categories[1].parentId).toBe('1');
    
    // Проверяем товары
    expect(catalog.offers).toHaveLength(1);
    const offer = catalog.offers[0];
    expect(offer.id).toBe('12345');
    expect(offer.name).toBe('Смартфон Apple iPhone 15 128GB');
    expect(offer.vendor).toBe('Apple');
    expect(offer.price).toBe('89990');
    expect(offer.oldprice).toBe('99990');
    expect(offer.parameters).toHaveLength(2);
    
    // Проверяем статистику
    expect(catalog.statistics.total_categories).toBe(2);
    expect(catalog.statistics.total_offers).toBe(1);
    expect(catalog.statistics.available_offers).toBe(1);
    expect(catalog.statistics.unavailable_offers).toBe(0);
  });

  test('should handle empty sections gracefully', async () => {
    const minimalYml = `<?xml version="1.0"?>
    <yml_catalog>
      <shop>
        <name>Test Shop</name>
      </shop>
    </yml_catalog>`;
    
    const parsed = await parseStringPromise(minimalYml);
    const result = processYandexMarketYml(parsed);
    
    const catalog = JSON.parse(result.text).yandex_market_catalog;
    expect(catalog.shop_info.name).toBe('Test Shop');
    expect(catalog.currencies).toHaveLength(0);
    expect(catalog.categories).toHaveLength(0);
    expect(catalog.offers).toHaveLength(0);
  });
}); 