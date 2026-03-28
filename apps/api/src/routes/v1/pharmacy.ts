/**
 * Ruta: /v1/pharmacy
 * Búsqueda de medicamentos con precios de farmacias
 * Scraping on-demand con cache Redis (30 min on-demand, 6h periódico)
 */

import { Router } from 'express';
import { redis } from '../../config/redis';
import { supabaseAdmin } from '../../config/supabase';
import { scrapeFybeca } from '../../services/scraping/fybeca';
import { scrapeCruzAzul } from '../../services/scraping/cruz-azul';
import { scrapeSanaSana } from '../../services/scraping/sana-sana';
import { scrapeMedicity } from '../../services/scraping/medicity';
import { scrapePharmacys } from '../../services/scraping/pharmacys';
import type { PharmacyResult } from '../../services/scraping/base-scraper';

export const pharmacy_Router = Router();

const CACHE_TTL_ONDEMAND = 60 * 30;    // 30 min
const CACHE_TTL_PERIODIC = 60 * 60 * 6; // 6 h

// GET /pharmacy/search?q=<query>&fresh=1
pharmacy_Router.get('/search', async (req, res) => {
  try {
    const query = (req.query['q'] as string | undefined)?.trim();
    const fresh = req.query['fresh'] === '1';

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Búsqueda mínimo 2 caracteres' });
      return;
    }

    const cacheKey = `pharmacy:search:${query.toLowerCase()}`;

    if (!fresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json({ data: JSON.parse(cached) as PharmacyResult[], fromCache: true });
        return;
      }
    }

    // Scrape all pharmacies in parallel (ignore individual failures)
    const results = await Promise.allSettled([
      scrapeFybeca(query),
      scrapeCruzAzul(query),
      scrapeSanaSana(query),
      scrapeMedicity(query),
      scrapePharmacys(query),
    ]);

    const all: PharmacyResult[] = results
      .filter((r): r is PromiseFulfilledResult<PharmacyResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // Persist results to pharmacy_prices table (global cache)
    if (all.length > 0) {
      const rows = all.map((r) => ({
        pharmacy_name: r.pharmacyName,
        brand_name: r.brandName,
        price: r.price,
        pvp: r.pvp,
        stock_status: r.stockStatus,
        url: r.url ?? null,
        scraped_at: new Date().toISOString(),
        cache_expires_at: new Date(Date.now() + CACHE_TTL_PERIODIC * 1000).toISOString(),
        // No product_id for on-demand — would need molecule matching
      }));

      // Best-effort upsert, ignore failures
      await supabaseAdmin.from('pharmacy_prices').upsert(rows, { ignoreDuplicates: true }).then(
        () => undefined,
        () => undefined
      );
    }

    // Cache in Redis
    await redis.setex(cacheKey, CACHE_TTL_ONDEMAND, JSON.stringify(all));

    res.json({ data: all, fromCache: false });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /pharmacy/prices/:productId — precios en BD para un producto conocido
pharmacy_Router.get('/prices/:productId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('pharmacy_prices')
      .select('pharmacy_name, price, pvp, stock_status, url, scraped_at')
      .eq('product_id', req.params['productId']!)
      .gt('cache_expires_at', new Date().toISOString())
      .order('pvp', { ascending: true });

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /pharmacy/molecules/search?q=<query> — buscar moléculas
pharmacy_Router.get('/molecules/search', async (req, res) => {
  try {
    const q = (req.query['q'] as string | undefined)?.trim();
    if (!q || q.length < 2) {
      res.json({ data: [] });
      return;
    }

    const { data } = await supabaseAdmin
      .from('molecules')
      .select('id, name, atc_code, category, controlled')
      .ilike('name', `%${q}%`)
      .limit(20);

    res.json({ data: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
