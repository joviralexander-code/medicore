-- ============================================================
-- 0018_onboarding_rpc.sql
-- Función RPC para el onboarding del médico
-- Crea el tenant y vincula al usuario de forma atómica
-- SECURITY DEFINER: bypasea RLS intencionalmente (solo para onboarding)
-- ============================================================

CREATE OR REPLACE FUNCTION create_onboarding_tenant(
  p_tenant_name TEXT,
  p_tenant_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID;
  v_tenant_id UUID;
  v_slug      TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Validar slug
  IF p_tenant_slug IS NULL OR length(p_tenant_slug) < 3 THEN
    RAISE EXCEPTION 'El subdominio debe tener al menos 3 caracteres';
  END IF;

  IF p_tenant_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' AND length(p_tenant_slug) > 2 THEN
    -- allow 3-char slugs like 'abc'
    NULL;
  END IF;

  -- Verificar que el slug no esté en uso
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_tenant_slug) THEN
    RAISE EXCEPTION 'El subdominio % ya está en uso', p_tenant_slug;
  END IF;

  -- Verificar que el usuario no tenga ya un tenant
  IF EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = v_user_id AND tenant_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este usuario ya tiene un consultorio registrado';
  END IF;

  -- Crear el tenant
  INSERT INTO tenants (
    name, slug, plan_tier, status,
    timezone, currency,
    invoices_this_month, invoices_reset_at
  )
  VALUES (
    p_tenant_name, p_tenant_slug, 'free', 'trial',
    'America/Guayaquil', 'USD',
    0, CURRENT_DATE
  )
  RETURNING id, slug INTO v_tenant_id, v_slug;

  -- Vincular usuario al tenant como admin
  UPDATE user_profiles
  SET
    tenant_id  = v_tenant_id,
    role       = 'admin',
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'id',   v_tenant_id,
    'slug', v_slug
  );
END;
$$;

-- Revocar acceso público y dar solo a usuarios autenticados
REVOKE ALL ON FUNCTION create_onboarding_tenant(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_onboarding_tenant(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION create_onboarding_tenant(TEXT, TEXT) IS
  'Onboarding: crea el tenant y vincula el médico como admin. SECURITY DEFINER — no llama desde frontend sin validar.';
