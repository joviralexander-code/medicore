-- ============================================================
-- 0007_sri_billing.sql
-- Facturación electrónica SRI Ecuador
-- Esquema XML 2.1.0 (facturas), 1.1.0 (notas crédito)
-- Firma XAdES-BES SHA-256
-- ============================================================

CREATE TYPE sri_doc_type AS ENUM (
  'factura',
  'nota_credito',
  'nota_debito',
  'liquidacion_compra',
  'retencion'
);

CREATE TYPE sri_status AS ENUM (
  'borrador',
  'firmado',
  'enviado',
  'autorizado',
  'rechazado',
  'anulado'
);

CREATE TYPE payment_method_sri AS ENUM (
  'efectivo',
  'cheque',
  'debito',
  'transferencia',
  'tarjeta_credito',
  'tarjeta_debito',
  'compensacion',
  'endoso_titulos',
  'otros'
);

-- -------------------------------------------------------
-- Tabla: sri_documents
-- Un registro por cada documento electrónico emitido
-- -------------------------------------------------------
CREATE TABLE sri_documents (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identificación del documento
  doc_type              sri_doc_type NOT NULL,
  ambiente              SMALLINT NOT NULL CHECK (ambiente IN (1, 2)),
  serie                 VARCHAR(6) NOT NULL,    -- Ej: '001001'
  secuencial            VARCHAR(9) NOT NULL,    -- Zero-padded 9 dígitos
  clave_acceso          VARCHAR(49) UNIQUE,     -- Calculado al firmar

  -- Receptor
  buyer_id_type         VARCHAR(20) NOT NULL DEFAULT 'cedula'
                        CHECK (buyer_id_type IN ('cedula','ruc','pasaporte','consumidor_final')),
  buyer_id              VARCHAR(20) NOT NULL,
  buyer_name            VARCHAR(300) NOT NULL,
  buyer_email           VARCHAR(255),
  buyer_address         TEXT,

  -- Link al paciente (puede ser NULL si no es paciente del sistema)
  patient_id            UUID REFERENCES patients(id) ON DELETE SET NULL,

  -- Valores financieros
  subtotal_0            NUMERIC(14,2) NOT NULL DEFAULT 0,   -- IVA 0%
  subtotal_12           NUMERIC(14,2) NOT NULL DEFAULT 0,   -- IVA 12%
  subtotal_15           NUMERIC(14,2) NOT NULL DEFAULT 0,   -- IVA 15%
  subtotal_exento       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- IVA exento
  iva_0                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  iva_12                NUMERIC(14,2) NOT NULL DEFAULT 0,
  iva_15                NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(14,2) NOT NULL CHECK (total >= 0),
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Items (líneas del documento)
  -- [{codigo_principal, descripcion, cantidad, precio_unitario, descuento, iva_pct, subtotal}]
  items                 JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Pago
  payment_method        payment_method_sri NOT NULL DEFAULT 'efectivo',
  -- Para múltiples formas de pago: [{metodo, valor, plazo_dias}]
  payment_detail        JSONB,
  payment_deadline_days SMALLINT NOT NULL DEFAULT 0,

  -- XML y firma
  xml_unsigned          TEXT,               -- XML sin firmar
  xml_signed            TEXT,               -- XML con XAdES-BES
  sri_response          JSONB,              -- Respuesta SOAP completa del SRI

  -- Autorización
  authorization_number  VARCHAR(49),
  authorization_date    TIMESTAMPTZ,

  -- Estado del documento
  status                sri_status NOT NULL DEFAULT 'borrador',
  rejection_reason      TEXT,
  retry_count           SMALLINT NOT NULL DEFAULT 0,
  last_retry_at         TIMESTAMPTZ,

  -- RIDE (Representación Impresa)
  -- Almacenado en Supabase Storage: {tenant_id}/sri/rides/{doc_id}.pdf
  ride_storage_path     TEXT,

  -- Nota crédito: referencia al documento modificado
  modified_doc_id       UUID REFERENCES sri_documents(id) ON DELETE RESTRICT,
  modified_doc_clave    VARCHAR(49),
  modification_reason   TEXT,

  -- Metadata
  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_sri_docs_tenant ON sri_documents(tenant_id);
CREATE INDEX idx_sri_docs_status ON sri_documents(tenant_id, status, created_at DESC);
CREATE INDEX idx_sri_docs_patient ON sri_documents(tenant_id, patient_id)
  WHERE patient_id IS NOT NULL;
CREATE INDEX idx_sri_docs_date ON sri_documents(tenant_id, created_at DESC);
CREATE INDEX idx_sri_docs_clave ON sri_documents(clave_acceso)
  WHERE clave_acceso IS NOT NULL;
CREATE INDEX idx_sri_docs_buyer ON sri_documents(tenant_id, buyer_id);
CREATE INDEX idx_sri_docs_serie_seq ON sri_documents(tenant_id, doc_type, serie, secuencial);

CREATE TRIGGER sri_documents_updated_at
  BEFORE UPDATE ON sri_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: sri_transmissions
-- Log de cada intento de transmisión al SRI
-- Para auditoría y debugging de rechazos
-- -------------------------------------------------------
CREATE TABLE sri_transmissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES sri_documents(id) ON DELETE CASCADE,

  attempt         SMALLINT NOT NULL DEFAULT 1,
  ws_action       VARCHAR(50),    -- 'recepcion' | 'autorizacion'
  request_xml     TEXT,
  response_xml    TEXT,
  http_status     INTEGER,
  sri_estado      VARCHAR(50),    -- Estado retornado por el SRI
  error_message   TEXT,
  duration_ms     INTEGER,

  transmitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sri_transmissions_doc ON sri_transmissions(document_id);
CREATE INDEX idx_sri_transmissions_tenant ON sri_transmissions(tenant_id, transmitted_at DESC);

COMMENT ON TABLE sri_documents IS 'Documentos electrónicos SRI. Ambientes: 1=pruebas (celcer), 2=prod (cel)';
COMMENT ON COLUMN sri_documents.xml_signed IS 'XML con firma XAdES-BES SHA-256. Generado con node-forge + xadesjs.';
COMMENT ON COLUMN sri_documents.ride_storage_path IS 'RIDE PDF en Supabase Storage. Generado con Puppeteer + QR de clave_acceso.';
COMMENT ON TABLE sri_transmissions IS 'Log de transmisiones al WS SRI. Timeout=60s, máx 3 reintentos con backoff exponencial.';
