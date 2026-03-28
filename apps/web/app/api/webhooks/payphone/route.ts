/**
 * Webhook PayPhone — confirmación de pagos Ecuador
 * PayPhone llama a este endpoint tras cada transacción
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(['pro', 'clinica', 'enterprise']);

interface PayphoneWebhookPayload {
  transactionStatus: string;   // 'Approved' | 'Cancelled' | 'Error'
  statusCode: number;          // 1 = aprobada
  id: number;
  clientTransactionId: string; // formato: {tenantId}:{tier}:{timestamp}
  amount: number;
  currency: string;
  authorizationCode?: string;
}

interface PayphoneVerifyResponse {
  transactionStatus: string;
  statusCode: number;
  id: number;
  amount: number;
}

/**
 * Verificar la transacción directamente con PayPhone para
 * confirmar que el payload no fue fabricado por un atacante.
 */
async function verifyWithPayphone(transactionId: number): Promise<boolean> {
  const token = process.env['PAYPHONE_TOKEN'];
  if (!token) return false;

  try {
    const res = await fetch(
      `https://pay.payphonetodoesunred.com/api/button/V2/Confirm`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: transactionId }),
      }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as PayphoneVerifyResponse;
    return data.statusCode === 1 && data.transactionStatus === 'Approved';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as PayphoneWebhookPayload;

  // Solo procesar transacciones aprobadas
  if (body.statusCode !== 1 || body.transactionStatus !== 'Approved') {
    return NextResponse.json({ received: true });
  }

  // Verificar con PayPhone que la transacción es auténtica
  const isValid = await verifyWithPayphone(body.id);
  if (!isValid) {
    console.error('[PAYPHONE_WEBHOOK] Transaction verification failed', { id: body.id });
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
  }

  // clientTransactionId: "tenantId:tier:timestamp"
  const parts = body.clientTransactionId.split(':');
  const tenantId = parts[0];
  const tier = parts[1];

  if (!tenantId || !tier) {
    return NextResponse.json({ error: 'Invalid clientTransactionId' }, { status: 400 });
  }

  // Validar formato UUID para evitar inyección
  if (!UUID_REGEX.test(tenantId)) {
    console.error('[PAYPHONE_WEBHOOK] Invalid tenantId format');
    return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 });
  }

  // Whitelist de tiers para evitar escalada de privilegios
  if (!VALID_TIERS.has(tier)) {
    console.error('[PAYPHONE_WEBHOOK] Invalid tier', { tier });
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  // Usar service_role para el update — este es un webhook de sistema
  const supabase = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase
    .from('tenants')
    .update({ plan_tier: tier, status: 'active' })
    .eq('id', tenantId);

  if (error) {
    console.error('[PAYPHONE_WEBHOOK] DB update failed', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
