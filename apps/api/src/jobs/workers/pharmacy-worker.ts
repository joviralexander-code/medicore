/**
 * Worker: pharmacy-scrape
 * Ejecuta scraping periódico de todas las farmacias
 * Cron: cada 6 horas
 */

import { Worker, type Job } from 'bullmq';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';
import { scrapeFybeca } from '../../services/scraping/fybeca';
import { scrapeCruzAzul } from '../../services/scraping/cruz-azul';
import { scrapeSanaSana } from '../../services/scraping/sana-sana';
import { scrapeMedicity } from '../../services/scraping/medicity';
import { scrapePharmacys } from '../../services/scraping/pharmacys';
import type { PharmacyResult } from '../../services/scraping/base-scraper';

const CACHE_TTL = 60 * 60 * 6;

async function processPharmacyScrape(job: Job): Promise<void> {
  const { query } = job.data as { query?: string };

  // If no query, run top 50 common medications
  const queries = query
    ? [query]
    : [
        'paracetamol', 'ibuprofeno', 'amoxicilina', 'metformina', 'atorvastatina',
        'losartan', 'omeprazol', 'amlodipino', 'metoprolol', 'enalapril',
        'azitromicina', 'ciprofloxacino', 'diclofenaco', 'prednisona', 'salbutamol',
        'loratadina', 'cetirizina', 'ranitidina', 'pantoprazol', 'metronidazol',
      ];

  for (const q of queries) {
    await job.updateProgress({ query: q, status: 'scraping' });

    const results = await Promise.allSettled([
      scrapeFybeca(q),
      scrapeCruzAzul(q),
      scrapeSanaSana(q),
      scrapeMedicity(q),
      scrapePharmacys(q),
    ]);

    const all: PharmacyResult[] = results
      .filter((r): r is PromiseFulfilledResult<PharmacyResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    if (all.length > 0) {
      const expiresAt = new Date(Date.now() + CACHE_TTL * 1000).toISOString();
      const rows = all.map((r) => ({
        pharmacy_name: r.pharmacyName,
        brand_name: r.brandName,
        price: r.price,
        pvp: r.pvp,
        stock_status: r.stockStatus,
        url: r.url ?? null,
        scraped_at: new Date().toISOString(),
        cache_expires_at: expiresAt,
      }));

      await supabaseAdmin.from('pharmacy_prices').upsert(rows, { ignoreDuplicates: true }).then(
        () => undefined,
        (err: unknown) => console.error('pharmacy upsert error:', err)
      );

      // Also cache in Redis
      const cacheKey = `pharmacy:search:${q.toLowerCase()}`;
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(all));
    }

    // Small delay between queries to avoid hammering sites
    await new Promise<void>((r) => setTimeout(r, 2000));
  }
}

export function startPharmacyWorker() {
  const worker = new Worker('pharmacy-scrape', processPharmacyScrape, {
    connection: redis,
    concurrency: 1, // Sequential to avoid detection
  });

  worker.on('completed', (job) => {
    console.log(`[pharmacy-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[pharmacy-worker] Job ${job?.id} failed:`, err);
  });

  return worker;
}
