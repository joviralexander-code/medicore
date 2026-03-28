import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const stripe = new Stripe(stripeKey);

  const PRICE_IDS: Record<string, string> = {
    pro: process.env['STRIPE_PRICE_PRO'] ?? '',
    clinica: process.env['STRIPE_PRICE_CLINICA'] ?? '',
    enterprise: process.env['STRIPE_PRICE_ENTERPRISE'] ?? '',
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const tier = formData.get('tier') as string;
  const tenantId = formData.get('tenantId') as string;
  const slug = formData.get('slug') as string;

  if (!tier || !tenantId || !slug) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const priceId = PRICE_IDS[tier];
  if (!priceId) {
    return NextResponse.redirect(
      new URL(`/app/${slug}/settings/billing?error=invalid_plan`, request.url)
    );
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_customer_id, name')
    .eq('id', tenantId)
    .single();

  let customerId = tenant?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      ...(user.email !== undefined ? { email: user.email } : {}),
      ...(tenant?.name !== undefined ? { name: tenant.name as string } : {}),
      metadata: { tenant_id: tenantId, supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from('tenants')
      .update({ stripe_customer_id: customerId })
      .eq('id', tenantId);
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/app/${slug}/settings/billing?success=1`,
    cancel_url: `${appUrl}/app/${slug}/settings/billing`,
    metadata: { tenant_id: tenantId, slug, tier },
    subscription_data: { metadata: { tenant_id: tenantId } },
  });

  return NextResponse.redirect(session.url!, 303);
}
