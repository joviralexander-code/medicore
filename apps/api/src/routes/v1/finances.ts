/**
 * Ruta: /v1/finances
 * Módulo financiero — transacciones, caja, reportes
 * Accesible solo por rol admin
 */

import { Router } from 'express';
import { adminOnly } from '../../middleware/roles';
import { supabaseAdmin } from '../../config/supabase';
import { generateReportPdf, ReportData } from '../../services/pdf/report';

export const finances_Router = Router();

// Todas las rutas de finanzas son admin-only
finances_Router.use(adminOnly);

// GET /finances/transactions — lista de transacciones
finances_Router.get('/transactions', async (req, res) => {
  try {
    const {
      month, year, type, category,
      page = '1', limit = '50',
    } = req.query as Record<string, string>;

    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    let query = req.supabase
      .from('financial_transactions')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    if (month && year) {
      const startDate = `${year}-${month.padStart(2, '0')}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]!;
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    const { data, error, count } = await query;
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /finances/transactions — crear transacción
finances_Router.post('/transactions', async (req, res) => {
  try {
    const body = req.body as {
      type: 'ingreso' | 'egreso';
      category: string;
      amount: number;
      description: string;
      transaction_date: string;
      payment_method?: string;
      reference?: string;
      sri_document_id?: string;
      patient_id?: string;
      cash_session_id?: string;
      tax_deductible?: boolean;
      is_reconciled?: boolean;
    };

    const insertPayload: Record<string, unknown> = {
      tenant_id: req.tenantId,
      type: body.type,
      category: body.category,
      amount: body.amount,
      description: body.description,
      transaction_date: body.transaction_date,
      tax_deductible: body.tax_deductible ?? false,
      is_reconciled: body.is_reconciled ?? false,
    };

    const optionals: Array<keyof typeof body> = ['payment_method', 'reference', 'sri_document_id', 'patient_id', 'cash_session_id'];
    for (const key of optionals) {
      if (body[key] !== undefined) insertPayload[key] = body[key];
    }

    const { data, error } = await req.supabase
      .from('financial_transactions')
      .insert(insertPayload)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /finances/transactions/:id
finances_Router.patch('/transactions/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const allowed = ['category', 'amount', 'description', 'transaction_date', 'payment_method', 'reference', 'tax_deductible', 'is_reconciled'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await req.supabase
      .from('financial_transactions')
      .update(updates)
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /finances/transactions/:id
finances_Router.delete('/transactions/:id', async (req, res) => {
  try {
    const { error } = await req.supabase
      .from('financial_transactions')
      .delete()
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /finances/summary — resumen financiero por mes
finances_Router.get('/summary', async (req, res) => {
  try {
    const { month, year } = req.query as Record<string, string>;

    if (!month || !year) {
      res.status(400).json({ error: 'month y year requeridos' });
      return;
    }

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]!;

    const { data, error } = await req.supabase
      .from('financial_transactions')
      .select('type, category, amount, payment_method, tax_deductible')
      .eq('tenant_id', req.tenantId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (error) { res.status(400).json({ error: error.message }); return; }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    let totalIngresos = 0;
    let totalEgresos = 0;
    const byCategory: Record<string, number> = {};

    for (const row of rows) {
      const amount = row['amount'] as number;
      const type = row['type'] as string;
      const category = row['category'] as string;

      if (type === 'ingreso') totalIngresos += amount;
      else totalEgresos += amount;

      byCategory[`${type}:${category}`] = (byCategory[`${type}:${category}`] ?? 0) + amount;
    }

    res.json({
      totalIngresos,
      totalEgresos,
      utilidad: totalIngresos - totalEgresos,
      byCategory,
      period: { month, year, startDate, endDate },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /finances/cash-sessions — sesiones de caja
finances_Router.get('/cash-sessions', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('cash_register_sessions')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('opened_at', { ascending: false })
      .limit(30);

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /finances/cash-sessions/open — sesión activa
finances_Router.get('/cash-sessions/open', async (req, res) => {
  try {
    const { data } = await req.supabase
      .from('cash_register_sessions')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .is('closed_at', null)
      .maybeSingle();

    res.json({ session: data ?? null });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /finances/cash-sessions/open — abrir sesión
finances_Router.post('/cash-sessions/open', async (req, res) => {
  try {
    const { opening_balance = 0 } = req.body as { opening_balance?: number };

    // Check no open session
    const { data: existing } = await req.supabase
      .from('cash_register_sessions')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .is('closed_at', null)
      .maybeSingle();

    if (existing) {
      res.status(400).json({ error: 'Ya existe una sesión de caja abierta' });
      return;
    }

    const { data, error } = await req.supabase
      .from('cash_register_sessions')
      .insert({
        tenant_id: req.tenantId,
        opened_by: req.auth.userId,
        opening_balance,
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /finances/cash-sessions/:id/close — cerrar sesión
finances_Router.post('/cash-sessions/:id/close', async (req, res) => {
  try {
    const { closing_balance } = req.body as { closing_balance: number };

    // Calculate expected balance from transactions in session
    const { data: session } = await req.supabase
      .from('cash_register_sessions')
      .select('opening_balance, opened_at')
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .is('closed_at', null)
      .single();

    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada o ya cerrada' });
      return;
    }

    const s = session as Record<string, unknown>;

    // Sum cash transactions in this session
    const { data: txns } = await req.supabase
      .from('financial_transactions')
      .select('type, amount')
      .eq('tenant_id', req.tenantId)
      .eq('cash_session_id', req.params['id']!)
      .eq('payment_method', 'efectivo');

    const cashMovement = ((txns ?? []) as Array<Record<string, unknown>>).reduce(
      (acc, t) => acc + (t['type'] === 'ingreso' ? (t['amount'] as number) : -(t['amount'] as number)),
      0
    );

    const expectedBalance = (s['opening_balance'] as number) + cashMovement;
    const difference = closing_balance - expectedBalance;

    const { data, error } = await supabaseAdmin
      .from('cash_register_sessions')
      .update({
        closed_by: req.auth.userId,
        closing_balance,
        expected_balance: expectedBalance,
        difference,
        closed_at: new Date().toISOString(),
      })
      .eq('id', req.params['id']!)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /finances/report-pdf — genera PDF del reporte mensual (admin only, via API)
finances_Router.post('/report-pdf', async (req, res) => {
  try {
    const { month, year } = req.body as { month: string; year: string };

    if (!month || !year) {
      res.status(400).json({ error: 'month y year requeridos' });
      return;
    }

    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate   = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]!;

    const { data: tenantRow } = await req.supabase
      .from('tenants').select('name').eq('id', req.tenantId).single();

    const { data: txns, error: txnError } = await req.supabase
      .from('financial_transactions')
      .select('type, category, amount, description, transaction_date, payment_method')
      .eq('tenant_id', req.tenantId)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (txnError) { res.status(400).json({ error: txnError.message }); return; }

    const rows = (txns ?? []) as Array<Record<string, unknown>>;
    let totalIngresos = 0;
    let totalEgresos  = 0;
    const catMap: Record<string, { category: string; type: 'ingreso' | 'egreso'; total: number; count: number }> = {};

    for (const row of rows) {
      const amount   = row['amount'] as number;
      const type     = row['type'] as 'ingreso' | 'egreso';
      const category = row['category'] as string;
      const key      = `${type}:${category}`;
      if (type === 'ingreso') totalIngresos += amount;
      else totalEgresos += amount;
      if (!catMap[key]) catMap[key] = { category, type, total: 0, count: 0 };
      catMap[key]!.total += amount;
      catMap[key]!.count++;
    }

    const MONTH_NAMES = [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
    ];
    const periodLabel = `${MONTH_NAMES[parseInt(month) - 1] ?? month} ${year}`;

    const reportData: ReportData = {
      title:       'Reporte Financiero',
      period:      periodLabel,
      tenantName:  (tenantRow as Record<string, unknown> | null)?.['name'] as string ?? 'Consultorio',
      generatedAt: new Date(),
      summary: { totalIngresos, totalEgresos, utilidad: totalIngresos - totalEgresos },
      byCategory: Object.values(catMap),
      transactions: rows.map((r) => ({
        date:          r['transaction_date'] as string,
        description:   r['description'] as string,
        category:      r['category'] as string,
        type:          r['type'] as 'ingreso' | 'egreso',
        amount:        r['amount'] as number,
        paymentMethod: r['payment_method'] as string | undefined,
      })),
    };

    const pdfBuffer = await generateReportPdf(reportData);
    const filename  = `reporte-financiero-${year}-${month.padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
