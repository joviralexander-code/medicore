/**
 * Plan guard — verifica que el plan del tenant incluya la feature requerida
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { PLAN_CONFIG, type PlanTier } from '@medicore/shared/constants';

type PlanFeature = keyof typeof PLAN_CONFIG.free.features;

/**
 * Verifica que el plan del tenant incluya la feature antes de ejecutar la ruta
 *
 * @example
 * router.post('/social/publish', requirePlanFeature('socialMedia'), handler)
 * router.get('/data-business', requirePlanFeature('dataBusiness'), handler)
 */
export function requirePlanFeature(feature: PlanFeature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { tenantId } = req.auth;

    if (!tenantId) {
      res.status(403).json({ error: 'Tenant no configurado' });
      return;
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan_tier, status')
      .eq('id', tenantId)
      .single();

    if (!tenant || tenant.status !== 'active') {
      res.status(403).json({
        error: 'Cuenta suspendida o no encontrada',
        code: 'ACCOUNT_INACTIVE',
      });
      return;
    }

    const planConfig = PLAN_CONFIG[tenant.plan_tier as PlanTier];
    const hasFeature = planConfig?.features[feature] ?? false;

    if (!hasFeature) {
      res.status(402).json({
        error: `Esta función requiere un plan superior`,
        feature,
        currentPlan: tenant.plan_tier,
        upgradeUrl: `/pricing`,
        code: 'PLAN_UPGRADE_REQUIRED',
      });
      return;
    }

    next();
  };
}

/**
 * Verifica el límite de facturas para plan Free
 */
export async function checkInvoiceLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { tenantId } = req.auth;
  if (!tenantId) { next(); return; }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan_tier, invoices_this_month')
    .eq('id', tenantId)
    .single();

  if (!tenant) { next(); return; }

  const planConfig = PLAN_CONFIG[tenant.plan_tier as PlanTier];
  const limit = planConfig?.maxInvoicesPerMonth;

  if (limit !== null && tenant.invoices_this_month >= limit) {
    res.status(402).json({
      error: `Has alcanzado el límite de ${limit} facturas por mes del plan Free`,
      limit,
      current: tenant.invoices_this_month,
      code: 'INVOICE_LIMIT_REACHED',
    });
    return;
  }

  next();
}
