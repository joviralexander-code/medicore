import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PortalLoginForm } from '@/components/portal/portal-login-form';

export const metadata: Metadata = { title: 'Iniciar sesión — Portal del Paciente' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PortalLoginPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Already logged in → go to portal home
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(`/portal/${slug}`);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('slug', slug)
    .single();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-4xl mb-3">🏥</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {tenant?.name ?? 'Portal del Paciente'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Inicia sesión para ver tus citas y recetas
          </p>
        </div>

        <PortalLoginForm slug={slug} />

        <p className="text-center text-xs text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link href={`/portal/${slug}/book`} className="text-[#1E40AF] hover:underline">
            Solicita una cita
          </Link>{' '}
          y el consultorio creará tu acceso.
        </p>

        <p className="text-center text-xs text-muted-foreground">
          <Link href={`/portal/${slug}`} className="hover:text-gray-900 transition-colors">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
