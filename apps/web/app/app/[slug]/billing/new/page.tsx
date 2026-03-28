import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InvoiceForm } from '@/components/billing/invoice-form';

export const metadata: Metadata = { title: 'Nueva Factura' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewInvoicePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/app/${slug}/billing`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors"
        >
          ← Volver a Facturación
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Se guardará como borrador. Los campos con{' '}
          <span className="text-red-500 font-medium">*</span> son obligatorios.
        </p>
      </div>

      <InvoiceForm slug={slug} tenantId={tenant.id} />
    </div>
  );
}
