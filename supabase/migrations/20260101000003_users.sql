-- ============================================================
-- 0003_users.sql
-- Perfiles de usuario y sistema de invitaciones
-- Extiende auth.users de Supabase
-- ============================================================

-- -------------------------------------------------------
-- Tabla: user_profiles
-- Extiende auth.users con datos del negocio
-- -------------------------------------------------------
CREATE TABLE user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role                  user_role NOT NULL DEFAULT 'admin',

  -- Datos personales
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  cedula                VARCHAR(13)
                        CHECK (cedula IS NULL OR cedula ~ '^\d{10,13}$'),
  phone                 VARCHAR(20),
  avatar_url            TEXT,

  -- Datos médicos (solo role='admin')
  speciality            VARCHAR(200),
  senescyt_registration VARCHAR(50),  -- Número de título médico SENESCYT

  -- Link al paciente si el usuario tiene portal de paciente
  patient_id            UUID,  -- FK a patients (FK agregado en migración 0004)

  -- Estado
  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_login            TIMESTAMPTZ,

  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_role ON user_profiles(tenant_id, role)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_user_profiles_cedula ON user_profiles(cedula)
  WHERE cedula IS NOT NULL;
CREATE INDEX idx_user_profiles_active ON user_profiles(tenant_id, is_active)
  WHERE is_active = true;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Trigger: on_auth_user_created
-- Crea el user_profile automáticamente al registrarse
-- Por defecto role='admin' — el onboarding completa los datos
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, role)
  VALUES (NEW.id, 'admin');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------
-- Tabla: tenant_invitations
-- Sistema de invitaciones para agregar secretarias y médicos
-- -------------------------------------------------------
CREATE TABLE tenant_invitations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'secretaria',
  token         VARCHAR(64) UNIQUE NOT NULL
                DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL
                DEFAULT (now() + INTERVAL '7 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_invitations_token ON tenant_invitations(token)
  WHERE accepted_at IS NULL;
CREATE INDEX idx_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX idx_invitations_email ON tenant_invitations(email, expires_at)
  WHERE accepted_at IS NULL;

COMMENT ON TABLE tenant_invitations IS 'Invitaciones para agregar secretarias o médicos adicionales a un tenant';
COMMENT ON COLUMN tenant_invitations.token IS 'Token único de 64 chars (32 bytes hex) para aceptar la invitación';
