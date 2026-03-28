/**
 * Scraper Sana Sana — sanasana.com.ec
 */

import { withScraperContext, randomDelay, type PharmacyResult } from './base-scraper';

export async function scrapeSanaSana(query: string): Promise<PharmacyResult[]> {
  return withScraperContext(async (context) => {
    const page = await context.newPage();
    const results: PharmacyResult[] = [];

    try {
      const searchUrl = `https://www.sanasana.com.ec/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay();

      const items = await page.$$eval(
        '[class*="product"]',
        (els) =>
          els.slice(0, 10).map((el) => {
            const name = el.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim() ?? '';
            const priceText = el.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim() ?? '0';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            const outOfStock =
              el.querySelector('[class*="out"], [class*="agotado"]') !== null ||
              el.textContent?.toLowerCase().includes('agotado') === true;
            return { name, price, outOfStock };
          })
      );

      for (const item of items) {
        if (!item.name || item.price <= 0) continue;
        results.push({
          pharmacyName: 'Sana Sana',
          productName: item.name,
          brandName: item.name,
          price: item.price,
          pvp: item.price,
          stockStatus: item.outOfStock ? 'agotado' : 'disponible',
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
