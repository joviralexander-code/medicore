-- ============================================================
-- 0014_data_business.sql
-- Módulo Data Business — comercialización de datos anonimizados
-- Compliance LOPDP Ecuador — k-anonimidad k≥5
-- Solo planes Clínica/Enterprise con consentimiento explícito
-- ============================================================

-- -------------------------------------------------------
-- Tabla: data_business_consent
-- Consentimiento explícito del tenant para participar en Data Business
-- -------------------------------------------------------
CREATE TABLE data_business_consent (
  tenant_id         UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  consented         BOOLEAN NOT NULL DEFAULT false,
  consented_at      TIMESTAMPTZ,
  consented_by      UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  -- Versión de los términos aceptados
  terms_version     VARCHAR(20),
  ip_address        INET,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER data_business_consent_updated_at
  BEFORE UPDATE ON data_business_consent FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: data_buyers
-- Compradores de datos (laboratorios, aseguradoras, farmacéuticas)
-- -------------------------------------------------------
CREATE TABLE data_buyers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name          VARCHAR(255) NOT NULL,
  company_type          VARCHAR(100)
                        CHECK (company_type IN ('laboratorio','aseguradora','farmaceutica','investigacion','otro')),
  contact_name          VARCHAR(200),
  contact_email         VARCHAR(255) NOT NULL,
  contact_phone         VARCHAR(20),

  -- API key para acceso programático
  -- Almacenamos el HASH SHA-256 — nunca el token en texto plano
  api_key_hash          TEXT UNIQUE,

  -- Rate limiting
  daily_request_limit   INTEGER NOT NULL DEFAULT 1000,
  monthly_request_limit INTEGER DEFAULT 30000,

  -- Estado
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_buyers_api_key ON data_buyers(api_key_hash)
  WHERE api_key_hash IS NOT NULL;

-- -------------------------------------------------------
-- Tabla: data_buyer_access_log
-- Log de accesos a la API de compradores (para rate limiting y auditoría)
-- -------------------------------------------------------
CREATE TABLE data_buyer_access_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id      UUID NOT NULL REFERENCES data_buyers(id) ON DELETE CASCADE,
  endpoint      VARCHAR(100),
  method        VARCHAR(10),
  ip_address    INET,
  request_count INTEGER NOT NULL DEFAULT 1,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (buyer_id, date)
);

CREATE INDEX idx_buyer_access_date ON data_buyer_access_log(buyer_id, date DESC);

-- -------------------------------------------------------
-- Tabla: data_exports
-- Registro de exportaciones generadas
-- -------------------------------------------------------
CREATE TABLE data_exports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id          UUID REFERENCES data_buyers(id) ON DELETE SET NULL,

  export_type       VARCHAR(100) NOT NULL,   -- 'diagnosticos', 'medicamentos', 'demografico', etc.
  date_range_start  DATE NOT NULL,
  date_range_end    DATE NOT NULL,
  filters           JSONB DEFAULT '{}'::jsonb,  -- Filtros aplicados (sin PHI)

  -- Resultado
  record_count      INTEGER,
  k_anonymity_min   INTEGER,    -- k mínimo alcanzado en la exportación
  k_anonymity_ok    BOOLEAN,    -- true si k >= 5 en todas las celdas

  -- Archivo generado
  -- {exports}/{buyer_id}/{id}.(pdf|xlsx)
  file_storage_path TEXT,
  file_type         VARCHAR(10)
                    CHECK (file_type IN ('pdf', 'xlsx', 'json', 'csv')),
  file_size_bytes   INTEGER,

  -- Metadata
  generated_by      VARCHAR(50) DEFAULT 'system',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_exports_buyer ON data_exports(buyer_id, created_at DESC)
  WHERE buyer_id IS NOT NULL;

COMMENT ON TABLE data_business_consent IS 'Verificar consented=true Y no revocado ANTES de incluir datos del tenant en ETL';
COMMENT ON TABLE data_buyers IS 'api_key_hash = SHA-256 del API key. Nunca almacenar el token en texto plano.';
COMMENT ON TABLE data_exports IS 'k_anonymity_min debe ser >= 5. Rechazar exportación si k_anonymity_ok = false.';
