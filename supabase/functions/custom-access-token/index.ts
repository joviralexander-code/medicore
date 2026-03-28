/**
 * Custom Access Token Hook
 * Inyecta tenant_id y role en el JWT de Supabase
 * para que las políticas RLS puedan usar auth.jwt() ->> 'tenant_id'
 *
 * Configurar en: Supabase Dashboard → Auth → Hooks → Custom Access Token
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  user_id: string;
  claims: Record<string, unknown>;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req: Request) => {
  try {
    const body = await req.text();

    const payload = JSON.parse(body) as WebhookPayload;
    const { user_id: userId } = payload;

    // Obtener el perfil del usuario con tenant_id y role
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('tenant_id, role, is_active')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      // Usuario sin perfil (durante onboarding inicial)
      return Response.json({
        claims: {
          ...payload.claims,
          tenant_id: null,
          user_role: 'admin',
          onboarding_required: true,
        },
      });
    }

    if (!profile.is_active) {
      return Response.json(
        { error: 'Usuario desactivado' },
        { status: 403 },
      );
    }

    return Response.json({
      claims: {
        ...payload.claims,
        tenant_id: profile.tenant_id ?? null,
        user_role: profile.role,
        onboarding_required: !profile.tenant_id,
      },
    });
  } catch (err) {
    console.error('Custom access token hook error:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
});
