-- ============================================================
-- 0002_plans_tenants.sql
-- Planes de suscripción y tenants (médicos/clínicas)
-- ============================================================

-- Tipos ENUM globales
CREATE TYPE plan_tier AS ENUM ('free', 'pro', 'clinica', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'cancelled', 'trial');
CREATE TYPE user_role AS ENUM ('admin', 'secretaria', 'paciente');

-- -------------------------------------------------------
-- Tabla: plans (catálogo de planes — datos estáticos)
-- -------------------------------------------------------
CREATE TABLE plans (
  tier                      plan_tier PRIMARY KEY,
  name                      VARCHAR(100) NOT NULL,
  price_usd                 NUMERIC(10,2) NOT NULL CHECK (price_usd >= 0),
  max_doctors               INTEGER NOT NULL DEFAULT 1,
  max_invoices_per_month    INTEGER,   -- NULL = ilimitado
  features                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- features: custom_domain, data_business, api_access, whatsapp, social_media, multi_doctor
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar planes base
INSERT INTO plans (tier, name, price_usd, max_doctors, max_invoices_per_month, features) VALUES
  ('free',
   'Free',
   0,
   1,
   10,
   '{"custom_domain":false,"data_business":false,"api_access":false,"whatsapp":false,"social_media":false,"multi_doctor":false}'::jsonb
  ),
  ('pro',
   'Pro',
   29,
   1,
   NULL,
   '{"custom_domain":false,"data_business":false,"api_access":false,"whatsapp":true,"social_media":true,"multi_doctor":false}'::jsonb
  ),
  ('clinica',
   'Clínica',
   79,
   10,
   NULL,
   '{"custom_domain":true,"data_business":true,"api_access":false,"whatsapp":true,"social_media":true,"multi_doctor":true}'::jsonb
  ),
  ('enterprise',
   'Enterprise',
   199,
   999,
   NULL,
   '{"custom_domain":true,"data_business":true,"api_access":true,"whatsapp":true,"social_media":true,"multi_doctor":true}'::jsonb
  );

-- -------------------------------------------------------
-- Tabla: tenants
-- Cada médico o clínica es un tenant independiente
-- NUNCA hacer queries cross-tenant (RLS enforza esto)
-- -------------------------------------------------------
CREATE TABLE tenants (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                    VARCHAR(63) UNIQUE NOT NULL
                          CHECK (slug ~ '^[a-z0-9][a-z0-9-]+[a-z0-9]$'),
  name                    VARCHAR(255) NOT NULL,
  plan_tier               plan_tier NOT NULL DEFAULT 'free'
                          REFERENCES plans(tier),
  status                  tenant_status NOT NULL DEFAULT 'trial',

  -- Dominio personalizado (planes Clínica/Enterprise)
  custom_domain           VARCHAR(255) UNIQUE
                          CHECK (custom_domain IS NULL OR custom_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  logo_url                TEXT,

  -- Configuración SRI Ecuador
  -- El P12 se almacena cifrado con pgcrypto (clave en variable de entorno)
  sri_ruc                 VARCHAR(13)
                          CHECK (sri_ruc IS NULL OR sri_ruc ~ '^\d{13}$'),
  sri_razon_social        VARCHAR(300),
  sri_nombre_comercial    VARCHAR(300),
  sri_direccion           TEXT,
  sri_telefono            VARCHAR(20),
  sri_email               VARCHAR(255),
  sri_cert_p12            BYTEA,          -- P12 CIFRADO con pgcrypto AES-256
  sri_cert_password       TEXT,           -- Password del P12 CIFRADO con pgcrypto
  sri_ambiente            SMALLINT NOT NULL DEFAULT 1
                          CHECK (sri_ambiente IN (1, 2)),  -- 1=pruebas, 2=produccion
  sri_serie               VARCHAR(6)
                          CHECK (sri_serie IS NULL OR sri_serie ~ '^\d{6}$'),
  sri_secuencial_factura  BIGINT NOT NULL DEFAULT 1,
  sri_secuencial_nc       BIGINT NOT NULL DEFAULT 1,  -- nota crédito
  sri_secuencial_nd       BIGINT NOT NULL DEFAULT 1,  -- nota débito
  sri_secuencial_lc       BIGINT NOT NULL DEFAULT 1,  -- liquidación compra
  sri_secuencial_ret      BIGINT NOT NULL DEFAULT 1,  -- retención

  -- Contadores de facturación (para límite plan Free)
  invoices_this_month     INTEGER NOT NULL DEFAULT 0
                          CHECK (invoices_this_month >= 0),
  invoices_reset_at       DATE DEFAULT CURRENT_DATE,

  -- Stripe (pagos internacionales)
  stripe_customer_id      VARCHAR(255) UNIQUE,
  stripe_subscription_id  VARCHAR(255) UNIQUE,
  stripe_subscription_status VARCHAR(50),

  -- PayPhone (pagos Ecuador)
  payphone_token          TEXT,
  payphone_store_id       TEXT,

  -- Configuración general
  settings                JSONB NOT NULL DEFAULT '{}'::jsonb,
  timezone                VARCHAR(50) NOT NULL DEFAULT 'America/Guayaquil',
  currency                VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Metadata
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices críticos
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain)
  WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_tenants_stripe_customer ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_tenants_status ON tenants(status);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para incrementar secuencial SRI de forma atómica
CREATE OR REPLACE FUNCTION get_next_sri_secuencial(
  p_tenant_id UUID,
  p_doc_type  TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER  -- Solo accesible internamente
AS $$
DECLARE
  v_secuencial BIGINT;
BEGIN
  CASE p_doc_type
    WHEN 'factura' THEN
      UPDATE tenants SET sri_secuencial_factura = sri_secuencial_factura + 1
        WHERE id = p_tenant_id
        RETURNING sri_secuencial_factura INTO v_secuencial;
    WHEN 'nota_credito' THEN
      UPDATE tenants SET sri_secuencial_nc = sri_secuencial_nc + 1
        WHERE id = p_tenant_id
        RETURNING sri_secuencial_nc INTO v_secuencial;
    WHEN 'nota_debito' THEN
      UPDATE tenants SET sri_secuencial_nd = sri_secuencial_nd + 1
        WHERE id = p_tenant_id
        RETURNING sri_secuencial_nd INTO v_secuencial;
    WHEN 'liquidacion_compra' THEN
      UPDATE tenants SET sri_secuencial_lc = sri_secuencial_lc + 1
        WHERE id = p_tenant_id
        RETURNING sri_secuencial_lc INTO v_secuencial;
    WHEN 'retencion' THEN
      UPDATE tenants SET sri_secuencial_ret = sri_secuencial_ret + 1
        WHERE id = p_tenant_id
        RETURNING sri_secuencial_ret INTO v_secuencial;
    ELSE
      RAISE EXCEPTION 'Tipo de documento SRI desconocido: %', p_doc_type;
  END CASE;

  RETURN v_secuencial;
END;
$$;

COMMENT ON TABLE tenants IS 'Cada médico/clínica es un tenant independiente. RLS aísla todos sus datos.';
COMMENT ON COLUMN tenants.sri_cert_p12 IS 'Certificado P12 del SRI CIFRADO con pgcrypto. Nunca almacenar en texto plano.';
COMMENT ON COLUMN tenants.sri_cert_password IS 'Password del P12 CIFRADO con pgcrypto. Nunca en texto plano.';
