import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TransactionForm } from '@/components/finances/transaction-form';

export const metadata: Metadata = { title: 'Nuevo movimiento' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}

export default async function NewTransactionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { type } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect(`/app/${slug}/dashboard`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  // Get open cash session
  const { data: openSession } = await supabase
    .from('cash_register_sessions')
    .select('id')
    .eq('tenant_id', tenant.id)
    .is('closed_at', null)
    .maybeSingle() as { data: { id: string } | null };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/finances`} className="hover:text-gray-900 transition-colors">
            Finanzas
          </Link>
          <span>›</span>
          <span className="text-gray-900">Nuevo movimiento</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Registrar movimiento</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Ingrese un ingreso o egreso del consultorio
        </p>
      </div>

      <TransactionForm
        slug={slug}
        tenantId={tenant.id}
        createdBy={user.id}
        {...(openSession?.id !== undefined ? { cashSessionId: openSession.id } : {})}
        {...(type !== undefined ? { defaultType: type as 'ingreso' | 'egreso' } : {})}
      />
    </div>
  );
}
