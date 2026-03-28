/**
 * Pool de instancias Puppeteer
 * Reutiliza browsers para evitar overhead de arranque en cada PDF
 */

import puppeteer, { type Browser } from 'puppeteer';

let browser: Browser | null = null;
let activePages = 0;
const MAX_CONCURRENT = 5;
// Callback queue — avoids setInterval polling and memory leaks
const waitQueue: Array<() => void> = [];

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

function waitForSlot(): Promise<void> {
  if (activePages < MAX_CONCURRENT) return Promise.resolve();
  return new Promise<void>((resolve) => waitQueue.push(resolve));
}

export async function withPage<T>(
  fn: (page: import('puppeteer').Page) => Promise<T>
): Promise<T> {
  await waitForSlot();

  const b = await getBrowser();
  const page = await b.newPage();
  activePages++;
  try {
    return await fn(page);
  } finally {
    activePages--;
    // Wake the next waiter in queue, if any
    waitQueue.shift()?.();
    await page.close().catch(() => { /* ignore */ });
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
