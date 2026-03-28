import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalBookingForm } from '@/components/portal/portal-booking-form';

export const metadata: Metadata = { title: 'Solicitar cita' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/');

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/portal/${slug}`} className="hover:text-gray-900 transition-colors">
            Inicio
          </Link>
          <span>›</span>
          <span className="text-gray-900">Solicitar cita</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitar una cita</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Completa el formulario y nos pondremos en contacto para confirmar
        </p>
      </div>

      <PortalBookingForm slug={slug} tenantId={tenant.id} />
    </div>
  );
}
