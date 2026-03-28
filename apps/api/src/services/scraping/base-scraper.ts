/**
 * Scraper base con Playwright
 * Incluye delays aleatorios, user-agent rotation y manejo de errores
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

export interface PharmacyResult {
  pharmacyName: string;
  productName: string;
  brandName: string;
  concentration?: string;
  pharmaceuticalForm?: string;
  price: number;
  pvp: number;
  stockStatus: 'disponible' | 'agotado' | 'desconocido';
  url?: string;
}

export function randomDelay(minMs = 800, maxMs = 2500): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browser;
}

export async function withScraperContext<T>(
  fn: (context: BrowserContext) => Promise<T>
): Promise<T> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1280, height: 720 },
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
  });
  try {
    return await fn(context);
  } finally {
    await context.close();
  }
}

export async function closeScraper(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
