-- ============================================================
-- 0008_prescriptions.sql
-- Recetas médicas con firma electrónica y QR de verificación
-- ============================================================

CREATE TYPE prescription_status AS ENUM (
  'borrador', 'emitida', 'dispensada', 'anulada'
);

CREATE TABLE prescriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id             UUID NOT NULL REFERENCES user_profiles(id),
  consultation_id       UUID REFERENCES consultations(id) ON DELETE SET NULL,

  -- Numeración
  prescription_number   VARCHAR(20) UNIQUE NOT NULL,
  issue_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  validity_days         SMALLINT NOT NULL DEFAULT 30,

  -- Diagnósticos relacionados
  -- [{cie10_code, description}]
  diagnoses             JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Medicamentos prescritos
  -- [{
  --   name: str,
  --   active_ingredient: str,
  --   concentration: str,
  --   pharmaceutical_form: str,  ('tableta','cápsula','jarabe','inyectable',...)
  --   quantity: number,
  --   unit: str,
  --   dosage: {
  --     amount: number,
  --     unit: str,
  --     frequency: str,    ('cada 8 horas', 'una vez al día', ...)
  --     duration: str,     ('7 días', '1 mes', ...)
  --     instructions: str  ('con alimentos', 'en ayunas', ...)
  --   },
  --   is_controlled: bool,
  --   cie10_code: str | null
  -- }]
  medications           JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Instrucciones generales al paciente
  instructions          TEXT,

  -- Estado
  status                prescription_status NOT NULL DEFAULT 'borrador',

  -- Firma visual (PNG del canvas de firma del médico)
  doctor_signature_url  TEXT,
  doctor_signed_at      TIMESTAMPTZ,

  -- Firma electrónica XAdES-BES (mismo P12 del SRI)
  electronic_signature  JSONB,
  -- { signature_type: 'XAdES-BES', algorithm: 'SHA-256', signed_at, cert_subject }

  -- PDF generado (Puppeteer)
  -- {tenant_id}/prescriptions/{id}.pdf
  pdf_storage_path      TEXT,
  pdf_generated_at      TIMESTAMPTZ,

  -- QR de verificación pública
  verification_code     VARCHAR(16) UNIQUE NOT NULL
                        DEFAULT upper(encode(gen_random_bytes(8), 'hex')),

  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prescriptions_tenant ON prescriptions(tenant_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(tenant_id, patient_id);
CREATE INDEX idx_prescriptions_doctor ON prescriptions(tenant_id, doctor_id);
CREATE INDEX idx_prescriptions_date ON prescriptions(tenant_id, issue_date DESC);
CREATE INDEX idx_prescriptions_verification ON prescriptions(verification_code);
CREATE INDEX idx_prescriptions_number ON prescriptions(prescription_number);

CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para generar número de receta
CREATE OR REPLACE FUNCTION generate_prescription_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
  v_year  TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM prescriptions
  WHERE tenant_id = p_tenant_id
    AND EXTRACT(YEAR FROM issue_date) = EXTRACT(YEAR FROM CURRENT_DATE);

  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  RETURN 'RX-' || v_year || '-' || LPAD((v_count + 1)::TEXT, 6, '0');
END;
$$;
