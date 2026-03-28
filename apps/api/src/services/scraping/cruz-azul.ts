/**
 * Scraper Cruz Azul — cruzazul.com.ec
 */

import { withScraperContext, randomDelay, type PharmacyResult } from './base-scraper';

export async function scrapeCruzAzul(query: string): Promise<PharmacyResult[]> {
  return withScraperContext(async (context) => {
    const page = await context.newPage();
    const results: PharmacyResult[] = [];

    try {
      const searchUrl = `https://www.cruzazul.com.ec/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay();

      const items = await page.$$eval(
        '.product-grid-item, .product-card, [class*="product"]',
        (els) =>
          els.slice(0, 10).map((el) => {
            const name = el.querySelector('h2, h3, .product-title, [class*="title"]')?.textContent?.trim() ?? '';
            const priceText = el.querySelector('[class*="price"]')?.textContent?.trim() ?? '0';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            return { name, price };
          })
      );

      for (const item of items) {
        if (!item.name || item.price <= 0) continue;
        results.push({
          pharmacyName: 'Cruz Azul',
          productName: item.name,
          brandName: item.name,
          price: item.price,
          pvp: item.price,
          stockStatus: 'disponible',
          url: searchUrl,
        });
      }
    } catch {
      // ignore
    } finally {
      await page.close();
    }

    return results;
  });
}
