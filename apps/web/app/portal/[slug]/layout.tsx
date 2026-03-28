import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function PortalLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#1E40AF] flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-[#1E40AF]">MediCore</p>
              <p className="text-xs text-muted-foreground">{tenant.name}</p>
            </div>
          </div>
          {user ? (
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-xs text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cerrar sesión
              </button>
            </form>
          ) : (
            <a
              href={`/portal/${slug}/login`}
              className="text-xs text-[#1E40AF] hover:underline font-medium"
            >
              Iniciar sesión
            </a>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-6">
        <p className="text-center text-xs text-muted-foreground">
          Portal del Paciente · {tenant.name} · Powered by MediCore Ecuador
        </p>
      </footer>
    </div>
  );
}
