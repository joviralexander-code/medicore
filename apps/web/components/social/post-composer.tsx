'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectedAccount {
  id: string;
  platform: string;
  account_name: string;
}

export interface PostComposerProps {
  slug: string;
  tenantId: string;
  tenantName: string;
  connectedAccounts: ConnectedAccount[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORM_CONFIG: Record<string, { label: string; icon: string; charLimit: number; color: string }> = {
  instagram: { label: 'Instagram', icon: '📸', charLimit: 2200, color: 'border-pink-300 bg-pink-50 text-pink-800' },
  facebook:  { label: 'Facebook',  icon: '👍', charLimit: 63206, color: 'border-blue-300 bg-blue-50 text-blue-800' },
  tiktok:    { label: 'TikTok',    icon: '🎵', charLimit: 2200, color: 'border-gray-300 bg-gray-50 text-gray-800' },
  linkedin:  { label: 'LinkedIn',  icon: '💼', charLimit: 3000, color: 'border-blue-400 bg-blue-50 text-blue-900' },
};

const AI_CONTENT_TYPES = [
  { value: 'consejos_salud',       label: 'Consejo de salud' },
  { value: 'prevencion',           label: 'Prevención y autocuidado' },
  { value: 'mitos_verdades',       label: 'Mitos y verdades médicas' },
  { value: 'cuando_consultar',     label: '¿Cuándo consultar al médico?' },
  { value: 'promocion_servicios',  label: 'Promoción de servicios' },
  { value: 'testimonio',           label: 'Testimonio / caso de éxito' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function RequiredMark() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

export function PostComposer({ slug, tenantId, tenantName, connectedAccounts }: PostComposerProps) {
  const router = useRouter();

  // Platforms selection
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    connectedAccounts.map((a) => a.platform)
  );

  // Content
  const [caption, setCaption] = useState('');
  const [mediaUrls, setMediaUrls] = useState('');

  // Scheduling
  const [scheduleType, setScheduleType] = useState<'now' | 'later' | 'draft'>('draft');
  const [scheduledAt, setScheduledAt] = useState('');

  // AI generation
  const [aiMode, setAiMode] = useState(false);
  const [aiContentType, setAiContentType] = useState('consejos_salud');
  const [aiTopic, setAiTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Submit
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  async function generateAiContent() {
    if (!aiTopic.trim()) { setAiError('Escribe el tema para generar el contenido.'); return; }

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch(`/api/social/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName,
          contentType: aiContentType,
          topic: aiTopic,
          platforms: selectedPlatforms,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Error al generar contenido');
      }

      const { caption: generated } = await res.json() as { caption: string };
      setCaption(generated);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al generar contenido');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (selectedPlatforms.length === 0) {
      setError('Selecciona al menos una plataforma.');
      return;
    }
    if (!caption.trim()) {
      setError('El texto de la publicación es obligatorio.');
      return;
    }
    if (scheduleType === 'later' && !scheduledAt) {
      setError('Selecciona fecha y hora para programar.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const status = scheduleType === 'draft' ? 'borrador' :
                   scheduleType === 'later' ? 'programado' : 'publicado';

    const mediaList = mediaUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    const { error: insertError } = await supabase
      .from('social_posts')
      .insert({
        tenant_id: tenantId,
        platforms: selectedPlatforms,
        caption: caption.trim(),
        media_urls: mediaList.length > 0 ? mediaList : null,
        status,
        ai_generated: aiMode && caption.length > 0,
        ...(scheduleType === 'later' && scheduledAt ? { scheduled_at: scheduledAt } : {}),
        ...(scheduleType === 'now' ? { published_at: new Date().toISOString() } : {}),
      });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push(`/app/${slug}/social`);
  }

  const activePlatforms = connectedAccounts.length > 0
    ? connectedAccounts
    : Object.keys(PLATFORM_CONFIG).map((p) => ({ id: p, platform: p, account_name: '' }));

  const minScheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  // Char limit for active platform
  const minCharLimit = selectedPlatforms.reduce((min, p) => {
    const limit = PLATFORM_CONFIG[p]?.charLimit ?? 2200;
    return Math.min(min, limit);
  }, 63206);
  const charWarning = caption.length > minCharLimit * 0.9;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Platform selection */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm tracking-wide">📱 Plataformas</p>
        </div>
        <div className="p-6">
          {connectedAccounts.length === 0 && (
            <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-2 text-xs text-orange-800">
              No hay cuentas conectadas. Puedes crear el borrador y conectar cuentas después.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {activePlatforms.map((acct) => {
              const config = PLATFORM_CONFIG[acct.platform];
              if (!config) return null;
              const selected = selectedPlatforms.includes(acct.platform);
              return (
                <button
                  key={acct.platform}
                  type="button"
                  onClick={() => togglePlatform(acct.platform)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    selected
                      ? 'border-[#1E40AF] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xl">{config.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${selected ? 'text-[#1E40AF]' : 'text-gray-700'}`}>
                      {config.label}
                    </p>
                    {acct.account_name && (
                      <p className="text-xs text-muted-foreground">@{acct.account_name}</p>
                    )}
                  </div>
                  {selected && (
                    <span className="ml-auto text-[#1E40AF] font-bold">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI content generator */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-white text-sm tracking-wide">✨ Contenido</p>
            <button
              type="button"
              onClick={() => setAiMode((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-colors ${
                aiMode ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {aiMode ? '✨ IA activa' : '✨ Generar con IA'}
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">

          {/* AI panel */}
          {aiMode && (
            <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 space-y-3">
              <p className="text-sm font-semibold text-purple-800">Generador de contenido con Claude AI</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Tipo de contenido</Label>
                  <select
                    value={aiContentType}
                    onChange={(e) => setAiContentType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:border-[#1E40AF]"
                  >
                    {AI_CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-700">Tema específico</Label>
                  <Input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="Ej: diabetes tipo 2, hipertensión..."
                    className="h-9 text-sm border-gray-200 bg-white focus:border-[#1E40AF]"
                  />
                </div>
              </div>
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              <Button
                type="button"
                onClick={generateAiContent}
                disabled={aiLoading || !aiTopic.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm"
                size="sm"
              >
                {aiLoading ? (
                  <span className="flex items-center gap-2"><span className="animate-spin">⟳</span>Generando...</span>
                ) : '✨ Generar texto'}
              </Button>
            </div>
          )}

          {/* Caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">
                Texto de la publicación<RequiredMark />
              </Label>
              <span className={`text-xs ${charWarning ? 'text-orange-600 font-semibold' : 'text-muted-foreground'}`}>
                {caption.length}/{minCharLimit}
              </span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={8}
              placeholder="Escribe tu publicación aquí... o usa el generador de IA arriba."
              required
              className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors placeholder:text-muted-foreground resize-none"
            />
          </div>

          {/* Media URLs */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">URLs de imágenes/videos (opcional)</Label>
            <textarea
              value={mediaUrls}
              onChange={(e) => setMediaUrls(e.target.value)}
              rows={3}
              placeholder="Una URL por línea..."
              className="flex w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-[#1E40AF] focus:bg-white transition-colors placeholder:text-muted-foreground resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Soporta imágenes JPG/PNG y videos MP4. Recomendado: subir a Supabase Storage primero.
            </p>
          </div>
        </div>
      </div>

      {/* Scheduling */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-[#1E40AF] to-[#0D9488]">
          <p className="font-semibold text-white text-sm tracking-wide">🗓 Publicación</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'draft', label: 'Guardar borrador', icon: '📝' },
              { value: 'later', label: 'Programar',        icon: '⏰' },
              { value: 'now',   label: 'Publicar ahora',   icon: '🚀' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScheduleType(opt.value as 'now' | 'later' | 'draft')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                  scheduleType === opt.value
                    ? 'border-[#1E40AF] bg-blue-50 text-[#1E40AF]'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {scheduleType === 'later' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Fecha y hora<RequiredMark /></Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={minScheduledAt}
                required
                className="h-10 w-full max-w-xs border-gray-200 bg-gray-50 focus:bg-white focus:border-[#1E40AF] text-sm"
              />
            </div>
          )}

          {scheduleType === 'now' && connectedAccounts.length === 0 && (
            <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-2 text-xs text-orange-800">
              No hay cuentas conectadas. Se guardará como borrador hasta que conectes una cuenta.
            </div>
          )}
        </div>
      </div>

      {/* Error + Submit */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/app/${slug}/social`)}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#1E40AF] hover:bg-[#1e3a8a] text-white font-semibold px-8"
        >
          {loading ? (
            <span className="flex items-center gap-2"><span className="animate-spin">⟳</span>Guardando...</span>
          ) : scheduleType === 'draft' ? 'Guardar borrador'
            : scheduleType === 'later' ? 'Programar publicación'
            : 'Publicar ahora'}
        </Button>
      </div>
    </form>
  );
}
