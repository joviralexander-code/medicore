-- ============================================================
-- 0021_medical_certificates.sql
-- Certificados médicos: reposo, salud, atención, personalizados
-- Firmados electrónicamente con el p12 del médico (mismo que SRI)
-- ============================================================

CREATE TYPE certificate_type AS ENUM (
  'reposo',        -- Reposo médico / incapacidad
  'salud',         -- Certificado de salud / aptitud
  'atencion',      -- Constancia de atención médica
  'personalizado'  -- Plantilla libre
);

CREATE TABLE medical_certificates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id             UUID NOT NULL REFERENCES user_profiles(id),
  consultation_id       UUID REFERENCES consultations(id) ON DELETE SET NULL,

  certificate_type      certificate_type NOT NULL,
  certificate_number    VARCHAR(30) UNIQUE,

  -- Campos estructurados según el tipo
  -- reposo:       { days, diagnosis, from_date, to_date, observations }
  -- salud:        { purpose, observations, valid_until_date }
  -- atencion:     { diagnosis, treatment, observations }
  -- personalizado:{ title, body }
  content               JSONB NOT NULL DEFAULT '{}',

  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until           DATE,

  -- PDF generado y firmado
  pdf_url               TEXT,
  is_signed             BOOLEAN NOT NULL DEFAULT false,
  signed_at             TIMESTAMPTZ,
  signature_info        JSONB,  -- { cert_subject, cert_serial, signed_by }

  -- Código de verificación pública (QR)
  verification_code     VARCHAR(16) UNIQUE NOT NULL
    DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_certificates_tenant    ON medical_certificates(tenant_id, issued_at DESC);
CREATE INDEX idx_certificates_patient   ON medical_certificates(patient_id);
CREATE INDEX idx_certificates_consult   ON medical_certificates(consultation_id);
CREATE INDEX idx_certificates_verify    ON medical_certificates(verification_code);

-- Auto-numero de certificado por tenant
CREATE OR REPLACE FUNCTION generate_certificate_number(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_year  TEXT;
BEGIN
  v_year := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_count
  FROM medical_certificates
  WHERE tenant_id = p_tenant_id
    AND date_part('year', issued_at) = date_part('year', now());
  RETURN 'CERT-' || v_year || '-' || lpad(v_count::text, 4, '0');
END;
$$;

-- RLS
ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificates_read_staff" ON medical_certificates
  FOR SELECT USING (tenant_id = auth_tenant_id() AND auth_is_staff());

CREATE POLICY "certificates_insert_staff" ON medical_certificates
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND auth_is_staff());

CREATE POLICY "certificates_update_staff" ON medical_certificates
  FOR UPDATE USING (tenant_id = auth_tenant_id() AND auth_is_staff());

CREATE POLICY "certificates_delete_admin" ON medical_certificates
  FOR DELETE USING (tenant_id = auth_tenant_id() AND auth_is_admin());

-- Paciente puede ver sus propios certificados (portal)
CREATE POLICY "certificates_read_patient" ON medical_certificates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = medical_certificates.patient_id
        AND p.portal_user_id = auth.uid()
    )
  );
