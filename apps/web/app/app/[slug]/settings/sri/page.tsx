import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SriConfigForm } from '@/components/settings/sri-config-form';
import { SriCertUpload } from '@/components/settings/sri-cert-upload';

export const metadata: Metadata = { title: 'Configuración SRI' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SriSettingsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect(`/app/${slug}/dashboard`);
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, sri_ruc, sri_razon_social, sri_serie, sri_ambiente, sri_cert_password')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const hasCert = tenant.sri_cert_password !== null && tenant.sri_cert_password !== undefined;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/app/${slug}/settings`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Configuración
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturación SRI</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura tu RUC, serie y certificado digital para emitir comprobantes electrónicos.
        </p>
      </div>

      {/* SRI Config Form */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm tracking-wide">Datos del contribuyente</p>
        </div>
        <div className="p-6">
          <SriConfigForm
            slug={slug}
            tenantId={tenant.id}
            current={{
              sri_ruc: tenant.sri_ruc ?? null,
              sri_razon_social: tenant.sri_razon_social ?? null,
              sri_serie: tenant.sri_serie ?? null,
              sri_ambiente: tenant.sri_ambiente ?? null,
            }}
          />
        </div>
      </div>

      {/* Certificate Upload */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm tracking-wide">Certificado digital (.p12)</p>
        </div>
        <div className="p-6">
          <SriCertUpload
            slug={slug}
            tenantId={tenant.id}
            hasCert={hasCert}
          />
        </div>
      </div>
    </div>
  );
}
