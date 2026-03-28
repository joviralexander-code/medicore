-- ============================================================
-- 0011_finances.sql
-- Módulo financiero completo
-- SOLO accesible para rol 'admin' (RLS estricto)
-- ============================================================

CREATE TYPE transaction_type AS ENUM ('ingreso', 'egreso');

CREATE TYPE transaction_category AS ENUM (
  -- Ingresos
  'consulta', 'procedimiento', 'laboratorio', 'farmacia', 'certificado',
  -- Egresos
  'alquiler', 'servicios_basicos', 'sueldos', 'insumos_medicos', 'equipos',
  'impuestos', 'marketing', 'capacitacion', 'seguros', 'otros'
);

-- -------------------------------------------------------
-- Tabla: cash_register_sessions
-- Cada día se abre y cierra la caja
-- -------------------------------------------------------
CREATE TABLE cash_register_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  opened_by         UUID NOT NULL REFERENCES user_profiles(id),
  closed_by         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  opening_balance   NUMERIC(14,2) NOT NULL DEFAULT 0
                    CHECK (opening_balance >= 0),
  closing_balance   NUMERIC(14,2)
                    CHECK (closing_balance IS NULL OR closing_balance >= 0),
  expected_balance  NUMERIC(14,2),    -- Calculado automáticamente
  difference        NUMERIC(14,2),    -- closing - expected

  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  notes             TEXT,

  closed_at_null_marker BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN closed_at IS NULL THEN true ELSE NULL END
  ) STORED
);

-- Solo puede haber una caja abierta por tenant a la vez
-- (índice único parcial — más simple que EXCLUDE USING GIST)
CREATE UNIQUE INDEX one_open_session_per_tenant
  ON cash_register_sessions (tenant_id, closed_at_null_marker)
  WHERE closed_at IS NULL;

CREATE INDEX idx_cash_sessions_tenant ON cash_register_sessions(tenant_id, opened_at DESC);

-- -------------------------------------------------------
-- Tabla: financial_transactions
-- Ingresos y egresos con categorías y deducibilidad SRI
-- -------------------------------------------------------
CREATE TABLE financial_transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cash_session_id       UUID REFERENCES cash_register_sessions(id) ON DELETE SET NULL,

  type                  transaction_type NOT NULL,
  category              transaction_category NOT NULL,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description           TEXT NOT NULL,
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Formas de pago
  payment_method        VARCHAR(50)
                        CHECK (payment_method IN (
                          'efectivo','transferencia','tarjeta','seguro_medico','otro'
                        )),
  reference             VARCHAR(100),    -- Número de transacción/autorización

  -- Para pagos con seguro médico
  insurance_company     VARCHAR(200),
  insurance_auth_number VARCHAR(100),
  insurance_coverage_pct NUMERIC(5,2)
                        CHECK (insurance_coverage_pct IS NULL
                          OR (insurance_coverage_pct >= 0 AND insurance_coverage_pct <= 100)),
  insurance_amount      NUMERIC(14,2),
  patient_amount        NUMERIC(14,2),

  -- Links
  sri_document_id       UUID REFERENCES sri_documents(id) ON DELETE SET NULL,
  patient_id            UUID REFERENCES patients(id) ON DELETE SET NULL,

  -- Archivo de soporte (factura de proveedor, recibo, etc.)
  -- {tenant_id}/finances/attachments/{id}
  attachment_storage_path TEXT,

  -- Contabilidad
  is_reconciled         BOOLEAN NOT NULL DEFAULT false,
  tax_deductible        BOOLEAN NOT NULL DEFAULT false,  -- Deducible SRI

  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_transactions_tenant ON financial_transactions(tenant_id);
CREATE INDEX idx_fin_transactions_date ON financial_transactions(tenant_id, transaction_date DESC);
CREATE INDEX idx_fin_transactions_type ON financial_transactions(tenant_id, type, transaction_date);
CREATE INDEX idx_fin_transactions_session ON financial_transactions(cash_session_id)
  WHERE cash_session_id IS NOT NULL;

CREATE TRIGGER financial_transactions_updated_at
  BEFORE UPDATE ON financial_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vista: Cuentas por cobrar (facturas autorizadas no cobradas)
CREATE VIEW accounts_receivable AS
SELECT
  sd.id AS document_id,
  sd.tenant_id,
  sd.buyer_name,
  sd.buyer_id,
  sd.total,
  sd.created_at AS invoice_date,
  p.first_name || ' ' || p.last_name AS patient_name,
  p.id AS patient_id,
  EXTRACT(DAY FROM now() - sd.created_at)::INTEGER AS days_outstanding
FROM sri_documents sd
LEFT JOIN patients p ON p.id = sd.patient_id
WHERE
  sd.status = 'autorizado'
  AND NOT EXISTS (
    SELECT 1 FROM financial_transactions ft
    WHERE ft.sri_document_id = sd.id
      AND ft.type = 'ingreso'
      AND ft.tenant_id = sd.tenant_id
  );

COMMENT ON TABLE financial_transactions IS 'Solo accesible para rol admin. Secretaria NO tiene acceso (RLS).';
COMMENT ON TABLE cash_register_sessions IS 'La caja debe estar abierta para registrar transacciones del día.';
