-- ============================================================
-- 0013_whatsapp.sql
-- WhatsApp Business: conexión, conversaciones, mensajes
-- API oficial + Baileys (fallback QR)
-- ============================================================

CREATE TYPE wa_connection_type AS ENUM ('official_api', 'baileys');
CREATE TYPE wa_message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE wa_message_type AS ENUM ('text', 'image', 'document', 'audio', 'video', 'location', 'template', 'interactive');
CREATE TYPE wa_message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- -------------------------------------------------------
-- Tabla: whatsapp_connections
-- Una conexión por tenant
-- -------------------------------------------------------
CREATE TABLE whatsapp_connections (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  connection_type       wa_connection_type NOT NULL DEFAULT 'official_api',
  phone_number          VARCHAR(20),         -- Número con código país: +593...

  -- WhatsApp Business API oficial
  waba_id               VARCHAR(100),        -- WhatsApp Business Account ID
  phone_number_id       VARCHAR(100),        -- Phone Number ID para mensajes
  access_token          TEXT,                -- Token cifrado
  webhook_verify_token  VARCHAR(100),

  -- Baileys (fallback)
  -- QR code para escanear, session data cifrada en la app
  -- No se almacena el estado de sesión completo aquí por seguridad
  baileys_status        VARCHAR(50) DEFAULT 'disconnected',
  -- 'connected' | 'disconnected' | 'connecting' | 'qr_pending'

  is_connected          BOOLEAN NOT NULL DEFAULT false,
  last_connected_at     TIMESTAMPTZ,
  last_ping_at          TIMESTAMPTZ,

  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {bot_enabled: bool, business_hours: {...}, auto_reply: {...}}

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER whatsapp_connections_updated_at
  BEFORE UPDATE ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: whatsapp_conversations
-- Una conversación por número de teléfono
-- -------------------------------------------------------
CREATE TABLE whatsapp_conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Número de teléfono del contacto (con código país)
  phone_number      VARCHAR(20) NOT NULL,
  contact_name      VARCHAR(200),

  -- Link al paciente (si está registrado en el sistema)
  patient_id        UUID REFERENCES patients(id) ON DELETE SET NULL,

  last_message_at   TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count      INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),

  -- Control del chatbot
  is_bot_active     BOOLEAN NOT NULL DEFAULT true,
  bot_paused_until  TIMESTAMPTZ,   -- Pausa temporal del bot

  -- Asignado a un humano
  assigned_to       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ,

  -- Contexto del chatbot (estado de la conversación)
  -- {step: 'greeting'|'booking'|'faq'|'human', appointment_draft: {...}}
  bot_context       JSONB DEFAULT '{}'::jsonb,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX idx_wa_conversations_tenant ON whatsapp_conversations(tenant_id);
CREATE INDEX idx_wa_conversations_patient ON whatsapp_conversations(patient_id)
  WHERE patient_id IS NOT NULL;
CREATE INDEX idx_wa_conversations_unread ON whatsapp_conversations(tenant_id, unread_count)
  WHERE unread_count > 0;
CREATE INDEX idx_wa_conversations_last_msg ON whatsapp_conversations(tenant_id, last_message_at DESC);

CREATE TRIGGER whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: whatsapp_messages
-- Mensajes individuales de cada conversación
-- -------------------------------------------------------
CREATE TABLE whatsapp_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,

  direction         wa_message_direction NOT NULL,
  message_type      wa_message_type NOT NULL DEFAULT 'text',
  content           TEXT,
  media_url         TEXT,       -- URL del media en Supabase Storage o WA
  media_mime_type   VARCHAR(100),

  -- ID del mensaje en WhatsApp (para deduplicación y referencias)
  wa_message_id     VARCHAR(100) UNIQUE,

  status            wa_message_status NOT NULL DEFAULT 'sent',
  error_details     JSONB,

  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,

  -- Indicadores
  is_bot_response   BOOLEAN NOT NULL DEFAULT false,
  is_template       BOOLEAN NOT NULL DEFAULT false,
  template_name     VARCHAR(100)
);

CREATE INDEX idx_wa_messages_conversation ON whatsapp_messages(conversation_id, sent_at DESC);
CREATE INDEX idx_wa_messages_tenant ON whatsapp_messages(tenant_id, sent_at DESC);
CREATE INDEX idx_wa_messages_wa_id ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

COMMENT ON TABLE whatsapp_connections IS 'Una conexión por tenant. Reconexión automática obligatoria para Baileys.';
COMMENT ON COLUMN whatsapp_conversations.bot_context IS 'Estado del chatbot Claude. No almacenar PHI en el contexto.';
