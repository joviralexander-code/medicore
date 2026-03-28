/**
 * Scraper Fybeca — farmacias.fybeca.com
 */

import { withScraperContext, randomDelay, type PharmacyResult } from './base-scraper';

export async function scrapeFybeca(query: string): Promise<PharmacyResult[]> {
  return withScraperContext(async (context) => {
    const page = await context.newPage();
    const results: PharmacyResult[] = [];

    try {
      const searchUrl = `https://www.fybeca.com/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay();

      const items = await page.$$eval(
        '[data-testid="product-item"], .product-item, .search-result-item',
        (els) =>
          els.slice(0, 10).map((el) => {
            const name = el.querySelector('.product-name, h3, [class*="name"]')?.textContent?.trim() ?? '';
            const priceText = el.querySelector('[class*="price"], .price')?.textContent?.trim() ?? '0';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            const stockText = el.querySelector('[class*="stock"], [class*="availability"]')?.textContent?.trim() ?? '';
            return { name, price, stockText };
          })
      );

      for (const item of items) {
        if (!item.name || item.price <= 0) continue;
        results.push({
          pharmacyName: 'Fybeca',
          productName: item.name,
          brandName: item.name,
          price: item.price,
          pvp: item.price,
          stockStatus: item.stockText.toLowerCase().includes('agot')
            ? 'agotado'
            : item.price > 0
            ? 'disponible'
            : 'desconocido',
          url: searchUrl,
        });
      }
    } catch {
      // Scraping fallback — return empty array on error, don't crash
    } finally {
      await page.close();
    }

    return results;
  });
}
