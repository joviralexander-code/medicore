import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(['pro', 'clinica', 'enterprise']);

/** Valida tenantId y tier antes de escribir en DB. */
function validateWebhookMetadata(tenantId: string | undefined, tier: string | undefined): boolean {
  if (!tenantId || !tier) return false;
  if (!UUID_REGEX.test(tenantId)) return false;
  if (!VALID_TIERS.has(tier)) return false;
  return true;
}

const TIER_BY_PRICE: Record<string, string> = {
  [process.env['STRIPE_PRICE_PRO'] ?? '']: 'pro',
  [process.env['STRIPE_PRICE_CLINICA'] ?? '']: 'clinica',
  [process.env['STRIPE_PRICE_ENTERPRISE'] ?? '']: 'enterprise',
};

export async function POST(request: Request) {
  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  const stripe = new Stripe(stripeKey);

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env['STRIPE_WEBHOOK_SECRET']!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Usar service_role — webhooks no tienen cookies de sesión de usuario
  const supabase = createSupabaseAdmin(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } }
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const tenantId = session.metadata?.tenant_id;
    const tier     = session.metadata?.tier;
    if (validateWebhookMetadata(tenantId, tier)) {
      await supabase
        .from('tenants')
        .update({
          plan_tier: tier!,
          status: 'active',
          stripe_subscription_id: session.subscription as string,
        })
        .eq('id', tenantId!);
    } else {
      console.error('[STRIPE_WEBHOOK] Invalid metadata in checkout.session.completed', { tenantId, tier });
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const sub      = event.data.object as Stripe.Subscription;
    const tenantId = sub.metadata?.tenant_id;
    if (tenantId && UUID_REGEX.test(tenantId)) {
      const priceId = sub.items.data[0]?.price.id ?? '';
      const tier    = TIER_BY_PRICE[priceId] ?? 'free';
      const status  = sub.status === 'active' ? 'active' : 'suspended';
      await supabase
        .from('tenants')
        .update({ plan_tier: tier, status, stripe_subscription_id: sub.id })
        .eq('id', tenantId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub      = event.data.object as Stripe.Subscription;
    const tenantId = sub.metadata?.tenant_id;
    if (tenantId && UUID_REGEX.test(tenantId)) {
      await supabase
        .from('tenants')
        .update({ plan_tier: 'free', status: 'active', stripe_subscription_id: null })
        .eq('id', tenantId);
    }
  }

  return NextResponse.json({ received: true });
}
