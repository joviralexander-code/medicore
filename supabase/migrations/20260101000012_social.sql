-- ============================================================
-- 0012_social.sql
-- Módulo de redes sociales
-- Instagram, Facebook, TikTok, LinkedIn
-- ============================================================

CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'tiktok', 'linkedin');
CREATE TYPE post_status AS ENUM ('borrador', 'programado', 'publicado', 'error', 'cancelado');
CREATE TYPE content_generation_mode AS ENUM ('mejorar_texto', 'desde_tema', 'plantilla');

-- -------------------------------------------------------
-- Tabla: social_accounts
-- Cuentas de RRSS conectadas por tenant
-- -------------------------------------------------------
CREATE TABLE social_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  platform          social_platform NOT NULL,
  account_id        VARCHAR(255) NOT NULL,
  account_name      VARCHAR(255),
  account_username  VARCHAR(255),

  -- Tokens (CIFRADOS con pgcrypto en la capa de aplicación)
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,

  -- Facebook Pages
  page_id           VARCHAR(255),
  page_name         VARCHAR(255),

  -- Instagram Business
  instagram_id      VARCHAR(255),

  -- Métricas básicas (actualizadas periódicamente)
  followers_count   INTEGER DEFAULT 0,
  following_count   INTEGER DEFAULT 0,
  posts_count       INTEGER DEFAULT 0,
  metrics_updated_at TIMESTAMPTZ,

  is_active         BOOLEAN NOT NULL DEFAULT true,
  connected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at      TIMESTAMPTZ,

  UNIQUE (tenant_id, platform, account_id)
);

CREATE INDEX idx_social_accounts_tenant ON social_accounts(tenant_id);
CREATE INDEX idx_social_accounts_token_expiry ON social_accounts(tenant_id, token_expires_at)
  WHERE token_expires_at IS NOT NULL AND is_active = true;

-- -------------------------------------------------------
-- Tabla: social_posts
-- Publicaciones programadas o publicadas
-- -------------------------------------------------------
CREATE TABLE social_posts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Plataformas donde publicar (puede ser en múltiples a la vez)
  platforms         social_platform[] NOT NULL,

  -- Contenido
  caption           TEXT,
  hashtags          TEXT[] DEFAULT '{}',

  -- Media: URLs en Supabase Storage o externas
  -- {tenant_id}/social/media/{id}/{filename}
  media_storage_paths TEXT[] DEFAULT '{}',

  -- Programación
  scheduled_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,

  -- Estado y errores
  status            post_status NOT NULL DEFAULT 'borrador',
  error_message     TEXT,

  -- IDs de las publicaciones en cada plataforma
  -- {instagram: '123...', facebook: '456...'}
  platform_post_ids JSONB DEFAULT '{}'::jsonb,

  -- Métricas de la publicación
  -- {instagram: {likes: 0, comments: 0, reach: 0, impressions: 0}}
  metrics           JSONB DEFAULT '{}'::jsonb,
  metrics_updated_at TIMESTAMPTZ,

  -- IA
  ai_generated      BOOLEAN NOT NULL DEFAULT false,
  ai_mode           content_generation_mode,
  ai_prompt_used    TEXT,    -- El prompt/tema usado (no PHI)

  created_by        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_tenant ON social_posts(tenant_id);
CREATE INDEX idx_social_posts_scheduled ON social_posts(tenant_id, scheduled_at)
  WHERE status = 'programado';
CREATE INDEX idx_social_posts_status ON social_posts(tenant_id, status, created_at DESC);

CREATE TRIGGER social_posts_updated_at
  BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN social_accounts.token_expires_at IS 'Token Meta expira cada 60 días. BullMQ alerta 7 días antes.';
