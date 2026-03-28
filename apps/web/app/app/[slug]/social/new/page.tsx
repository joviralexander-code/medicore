import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PostComposer } from '@/components/social/post-composer';

export const metadata: Metadata = { title: 'Nueva publicación' };

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function NewPostPage({ params }: Props) {
  const { slug } = await params;
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
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  // Get connected accounts
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, platform, account_name')
    .eq('tenant_id', tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link href={`/app/${slug}/social`} className="hover:text-gray-900 transition-colors">
            Redes Sociales
          </Link>
          <span>›</span>
          <span className="text-gray-900">Nueva publicación</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Crear publicación</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Publica en múltiples redes a la vez o programa para después
        </p>
      </div>

      <PostComposer
        slug={slug}
        tenantId={tenant.id}
        tenantName={tenant.name}
        connectedAccounts={(accounts ?? []) as { id: string; platform: string; account_name: string }[]}
      />
    </div>
  );
}
