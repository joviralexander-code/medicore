import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Redes Sociales' };

interface Props {
  params: Promise<{ slug: string }>;
}

interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  token_expires_at: string | null;
  page_id: string | null;
}

interface SocialPost {
  id: string;
  platforms: string[];
  caption: string;
  scheduled_at: string | null;
  published_at: string | null;
  status: string;
  ai_generated: boolean;
  metrics: Record<string, unknown> | null;
}

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  instagram: { label: 'Instagram', icon: '📸', color: 'bg-gradient-to-br from-purple-500 to-pink-500' },
  facebook:  { label: 'Facebook',  icon: '👍', color: 'bg-blue-600' },
  tiktok:    { label: 'TikTok',    icon: '🎵', color: 'bg-gray-900' },
  linkedin:  { label: 'LinkedIn',  icon: '💼', color: 'bg-blue-700' },
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    borrador:   { label: 'Borrador',   cls: 'bg-gray-100 text-gray-600' },
    programado: { label: 'Programado', cls: 'bg-yellow-100 text-yellow-800' },
    publicado:  { label: 'Publicado',  cls: 'bg-green-100 text-green-800' },
    error:      { label: 'Error',      cls: 'bg-red-100 text-red-800' },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff < 7 * 24 * 60 * 60 * 1000; // 7 days
}

export default async function SocialPage({ params }: Props) {
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
    .select('id')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/onboarding');

  const [accountsResult, postsResult] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('id, platform, account_name, token_expires_at, page_id')
      .eq('tenant_id', tenant.id),
    supabase
      .from('social_posts')
      .select('id, platforms, caption, scheduled_at, published_at, status, ai_generated, metrics')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const accounts = (accountsResult.data as unknown as SocialAccount[]) ?? [];
  const posts    = (postsResult.data as unknown as SocialPost[]) ?? [];

  const allPlatforms = ['instagram', 'facebook', 'tiktok', 'linkedin'];

  const publishedPosts  = posts.filter((p) => p.status === 'publicado');
  const scheduledPosts  = posts.filter((p) => p.status === 'programado');
  const aiGeneratedCount = posts.filter((p) => p.ai_generated).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Redes Sociales</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gestiona y programa publicaciones para tu consultorio
          </p>
        </div>
        <Button asChild>
          <Link href={`/app/${slug}/social/new`}>+ Nueva publicación</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cuentas conectadas</p>
            <p className="text-3xl font-bold text-gray-900">{accounts.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">de {allPlatforms.length} plataformas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Publicadas</p>
            <p className="text-3xl font-bold text-green-600">{publishedPosts.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">publicaciones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Programadas</p>
            <p className="text-3xl font-bold text-yellow-600">{scheduledPosts.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Generadas con IA</p>
            <p className="text-3xl font-bold text-purple-600">{aiGeneratedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">publicaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Connected accounts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cuentas conectadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {allPlatforms.map((platform) => {
              const config = PLATFORM_CONFIG[platform]!;
              const account = accounts.find((a) => a.platform === platform);
              const isConnected = !!account;
              const expiring = account ? isExpiringSoon(account.token_expires_at) : false;

              return (
                <div
                  key={platform}
                  className={`flex items-center gap-4 p-4 rounded-xl border ${
                    isConnected ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl ${config.color}`}>
                    {config.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{config.label}</p>
                    {isConnected ? (
                      <>
                        <p className="text-xs text-muted-foreground truncate">@{account.account_name}</p>
                        {expiring && (
                          <p className="text-xs text-orange-600 font-medium mt-0.5">
                            ⚠ Token expira pronto
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No conectado</p>
                    )}
                  </div>

                  {/* Action */}
                  {isConnected ? (
                    <span className="text-xs text-green-600 font-semibold flex-shrink-0">✓ Conectado</span>
                  ) : (
                    <Link
                      href={`/app/${slug}/social/connect/${platform}`}
                      className="text-xs text-primary hover:underline font-medium flex-shrink-0"
                    >
                      Conectar →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {accounts.length === 0 && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Conecta al menos una cuenta para comenzar a publicar. Los tokens de Meta (Instagram/Facebook)
              tienen vigencia de 60 días — recibirás una alerta 7 días antes de que expiren.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Posts list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Publicaciones recientes</CardTitle>
          {posts.length > 0 && (
            <Link href={`/app/${slug}/social/new`} className="text-sm text-primary hover:underline">
              + Nueva →
            </Link>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {posts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-3">📱</p>
              <p className="font-medium">Sin publicaciones aún</p>
              <p className="text-sm mt-1">
                <Link href={`/app/${slug}/social/new`} className="text-primary hover:underline">
                  Crear la primera publicación
                </Link>
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/app/${slug}/social/${post.id}`}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Platform icons */}
                  <div className="flex gap-1 flex-shrink-0 mt-0.5">
                    {(post.platforms ?? []).map((p) => (
                      <span key={p} title={PLATFORM_CONFIG[p]?.label ?? p} className="text-base">
                        {PLATFORM_CONFIG[p]?.icon ?? '🌐'}
                      </span>
                    ))}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 line-clamp-2">{post.caption}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <StatusBadge status={post.status} />
                      {post.ai_generated && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                          ✨ IA
                        </span>
                      )}
                      {post.scheduled_at && (
                        <span className="text-xs text-muted-foreground">
                          📅 {formatDate(post.scheduled_at)}
                        </span>
                      )}
                      {post.published_at && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(post.published_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-muted-foreground text-sm flex-shrink-0">→</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
