import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const stripeKey = process.env['STRIPE_SECRET_KEY'];
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const stripe = new Stripe(stripeKey);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { tenantId } = await request.json() as { tenantId: string };

  const { data: tenant } = await supabase
    .from('tenants')
    .select('stripe_customer_id, slug')
    .eq('id', tenantId)
    .single();

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 });
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id as string,
    return_url: `${appUrl}/app/${tenant.slug}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
