/**
 * Ruta: /v1/data-business
 * Data Business — exportaciones de datos anonimizados (plan Clínica/Enterprise)
 * Requiere: rol admin + consentimiento data_business_consent = true
 */

import { Router } from 'express';
import { adminOnly } from '../../middleware/roles';
import { supabaseAdmin } from '../../config/supabase';
import { runEtlPipeline, toCSV, toAggregated } from '../../services/anonymization/etl';
import { K_MIN } from '../../services/anonymization/k-anonymity';

export const dataBusiness_Router = Router();

dataBusiness_Router.use(adminOnly);

// Middleware: verificar plan Clínica/Enterprise + consentimiento
dataBusiness_Router.use(async (req, res, next) => {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan_tier')
    .eq('id', req.tenantId)
    .single();

  const tier = (tenant as Record<string, string> | null)?.['plan_tier'];
  if (tier !== 'clinica' && tier !== 'enterprise') {
    res.status(403).json({
      error: 'El programa de datos requiere plan Clínica o Enterprise',
      code: 'PLAN_REQUIRED',
    });
    return;
  }

  const { data: consent } = await supabaseAdmin
    .from('data_business_consent')
    .select('consented')
    .eq('tenant_id', req.tenantId)
    .maybeSingle();

  if (!(consent as Record<string, boolean> | null)?.['consented']) {
    res.status(403).json({
      error: 'Debe activar el consentimiento de datos en Configuración → Privacidad',
      code: 'CONSENT_REQUIRED',
    });
    return;
  }

  next();
});

// GET /data-business/preview — preview con stats (sin descarga)
dataBusiness_Router.get('/preview', async (req, res) => {
  try {
    const { date_from, date_to, consultation_type } = req.query as Record<string, string>;

    if (!date_from || !date_to) {
      res.status(400).json({ error: 'date_from y date_to requeridos' });
      return;
    }

    const result = await runEtlPipeline({
      tenantId: req.tenantId,
      dateFrom: date_from,
      dateTo: date_to,
      ...(consultation_type ? { consultationType: consultation_type } : {}),
    });

    const aggregated = toAggregated(result.records);

    res.json({
      totalRaw: result.totalRaw,
      totalSafe: result.totalSafe,
      suppressedCount: result.suppressedCount,
      k: result.k,
      kMin: K_MIN,
      valid: result.valid,
      aggregated,
      canExport: result.valid && result.totalSafe >= K_MIN,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /data-business/export — exportar CSV anonimizado
dataBusiness_Router.post('/export', async (req, res) => {
  try {
    const { date_from, date_to, consultation_type, format = 'csv' } = req.body as {
      date_from: string;
      date_to: string;
      consultation_type?: string;
      format?: 'csv' | 'json';
    };

    if (!date_from || !date_to) {
      res.status(400).json({ error: 'date_from y date_to requeridos' });
      return;
    }

    const result = await runEtlPipeline({
      tenantId: req.tenantId,
      dateFrom: date_from,
      dateTo: date_to,
      ...(consultation_type ? { consultationType: consultation_type } : {}),
    });

    if (!result.valid) {
      res.status(400).json({
        error: `Exportación bloqueada: k=${result.k} < ${K_MIN}. Se suprimieron ${result.suppressedCount} registros. Necesita más datos o un rango de fechas mayor.`,
        code: 'K_ANONYMITY_VIOLATION',
        k: result.k,
        suppressedCount: result.suppressedCount,
      });
      return;
    }

    // Log export to data_exports table
    await supabaseAdmin.from('data_exports').insert({
      tenant_id: req.tenantId,
      export_type: 'consultations',
      date_range_start: date_from,
      date_range_end: date_to,
      filters: { consultation_type: consultation_type ?? null },
      record_count: result.totalSafe,
      created_at: new Date().toISOString(),
    });

    if (format === 'json') {
      res.json({
        records: result.records,
        metadata: {
          totalRecords: result.totalSafe,
          k: result.k,
          period: { from: date_from, to: date_to },
          exportedAt: new Date().toISOString(),
        },
      });
      return;
    }

    // CSV response
    const csv = toCSV(result.records);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="medicore_data_${date_from}_${date_to}.csv"`
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /data-business/exports — historial de exportaciones
dataBusiness_Router.get('/exports', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('data_exports')
      .select('id, export_type, date_range_start, date_range_end, record_count, created_at')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
