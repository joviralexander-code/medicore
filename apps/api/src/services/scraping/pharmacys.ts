/**
 * Scraper Pharmacys — pharmacys.com.ec
 */

import { withScraperContext, randomDelay, type PharmacyResult } from './base-scraper';

export async function scrapePharmacys(query: string): Promise<PharmacyResult[]> {
  return withScraperContext(async (context) => {
    const page = await context.newPage();
    const results: PharmacyResult[] = [];

    try {
      const searchUrl = `https://www.pharmacys.com.ec/search?type=product&q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay();

      const items = await page.$$eval(
        '.product-item, [class*="product-card"], .grid__item',
        (els) =>
          els.slice(0, 10).map((el) => {
            const name = el.querySelector('h2, h3, .product-item__title, [class*="title"]')?.textContent?.trim() ?? '';
            const priceText = el.querySelector('[class*="price"]')?.textContent?.trim() ?? '0';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            return { name, price };
          })
      );

      for (const item of items) {
        if (!item.name || item.price <= 0) continue;
        results.push({
          pharmacyName: 'Pharmacys',
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
