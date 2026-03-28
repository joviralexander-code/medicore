/**
 * Scraper Medicity — medicity.com.ec
 */

import { withScraperContext, randomDelay, type PharmacyResult } from './base-scraper';

export async function scrapeMedicity(query: string): Promise<PharmacyResult[]> {
  return withScraperContext(async (context) => {
    const page = await context.newPage();
    const results: PharmacyResult[] = [];

    try {
      const searchUrl = `https://www.medicity.com.ec/index.php?route=product/search&search=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay();

      const items = await page.$$eval(
        '.product-layout, .product-thumb',
        (els) =>
          els.slice(0, 10).map((el) => {
            const name = el.querySelector('.caption h4 a, .product-name')?.textContent?.trim() ?? '';
            const priceText = el.querySelector('.price, [class*="price"]')?.textContent?.trim() ?? '0';
            const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;
            return { name, price };
          })
      );

      for (const item of items) {
        if (!item.name || item.price <= 0) continue;
        results.push({
          pharmacyName: 'Medicity',
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
