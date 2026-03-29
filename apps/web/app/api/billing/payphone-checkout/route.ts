/**
 * POST /api/billing/payphone-checkout
 * Crea una sesión de pago PayPhone para actualizar el plan del tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PAYPHONE_BASE = 'https://pay.payphonetransfer.com';

const PLAN_PRICES_USD: Record<string, number> = {
  pro: 49,
  clinica: 129,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = (await req.json()) as { tier: string; tenantId: string; slug: string };
  const { tier, tenantId, slug } = body;

  const priceUsd = PLAN_PRICES_USD[tier];
  if (!priceUsd) {
    return NextResponse.json({ error: 'Plan no válido para PayPhone' }, { status: 400 });
  }

  const payphoneToken = process.env['PAYPHONE_TOKEN'];
  const storeId = process.env['PAYPHONE_STORE_ID'];

  if (!payphoneToken || !storeId) {
    return NextResponse.json({ error: 'PayPhone no configurado' }, { status: 500 });
  }

  const amountCents = Math.round(priceUsd * 100);
  const clientTransactionId = `${tenantId}:${tier}:${Date.now()}`;
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://plexomed.com';

  const payload = {
    amount: amountCents,
    amountWithTax: 0,
    amountWithoutTax: amountCents,
    tax: 0,
    service: 0,
    tip: 0,
    currency: 'USD',
    storeId,
    reference: `PlexoMed ${tier} - ${tenantId}`,
    clientTransactionId,
    responseUrl: `${appUrl}/api/webhooks/payphone`,
    cancellationUrl: `${appUrl}/app/${slug}/settings/billing?cancelled=1`,
  };

  const res = await fetch(`${PAYPHONE_BASE}/api/button/Prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payphoneToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `PayPhone error ${res.status}: ${text}` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { paymentUrl: string };
  return NextResponse.json({ paymentUrl: data.paymentUrl });
}
