-- ============================================================
-- 0006_consultations.sql
-- Historial clínico: consultas y archivos adjuntos
-- ============================================================

CREATE TYPE consultation_type AS ENUM (
  'primera_vez', 'control', 'emergencia', 'teleconsulta', 'domicilio'
);

-- -------------------------------------------------------
-- Tabla: consultations (consultas médicas)
-- -------------------------------------------------------
CREATE TABLE consultations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id             UUID NOT NULL REFERENCES user_profiles(id),
  appointment_id        UUID,  -- FK a appointments (agregado en migración 0010)

  -- Tipo y fecha
  consultation_type     consultation_type NOT NULL DEFAULT 'primera_vez',
  consultation_date     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Anamnesis
  reason                TEXT NOT NULL,       -- Motivo de consulta
  current_illness       TEXT,                -- Enfermedad actual

  -- Revisión de sistemas (JSONB estructurado)
  -- { cardiovascular, respiratorio, digestivo, nervioso, ... }
  review_of_systems     JSONB,

  -- Examen físico (JSONB por sistemas)
  physical_exam         JSONB,

  -- Signos vitales
  weight_kg             NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  height_cm             NUMERIC(5,1) CHECK (height_cm IS NULL OR height_cm > 0),
  bmi                   NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE
      WHEN height_cm > 0 AND weight_kg > 0
      THEN ROUND((weight_kg / ((height_cm / 100.0) ^ 2))::NUMERIC, 2)
      ELSE NULL
    END
  ) STORED,
  bp_systolic           SMALLINT CHECK (bp_systolic IS NULL OR (bp_systolic > 0 AND bp_systolic < 300)),
  bp_diastolic          SMALLINT CHECK (bp_diastolic IS NULL OR (bp_diastolic > 0 AND bp_diastolic < 200)),
  heart_rate            SMALLINT CHECK (heart_rate IS NULL OR (heart_rate > 0 AND heart_rate < 300)),
  temp_celsius          NUMERIC(4,1) CHECK (temp_celsius IS NULL OR (temp_celsius > 30 AND temp_celsius < 45)),
  o2_saturation         NUMERIC(4,1) CHECK (o2_saturation IS NULL OR (o2_saturation >= 0 AND o2_saturation <= 100)),
  respiratory_rate      SMALLINT,
  glucose_mgdl          NUMERIC(6,1),

  -- Diagnósticos CIE-10 (múltiples posibles)
  -- [{cie10_code: 'J00', description: '...', type: 'definitivo'|'presuntivo'|'descartado', is_primary: bool}]
  diagnoses             JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Plan de tratamiento
  treatment_plan        TEXT,
  next_appointment      DATE,

  -- IA assistance log (NO almacenar datos del paciente aquí)
  -- Solo los códigos CIE-10 sugeridos y si fueron aceptados
  ai_suggestions        JSONB,  -- [{cie10_code, accepted: bool}]

  -- Firma del médico
  is_signed             BOOLEAN NOT NULL DEFAULT false,
  signed_at             TIMESTAMPTZ,
  signed_by             UUID REFERENCES user_profiles(id),

  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_consultations_tenant ON consultations(tenant_id);
CREATE INDEX idx_consultations_patient ON consultations(tenant_id, patient_id);
CREATE INDEX idx_consultations_doctor ON consultations(tenant_id, doctor_id);
CREATE INDEX idx_consultations_date ON consultations(tenant_id, consultation_date DESC);
CREATE INDEX idx_consultations_type ON consultations(tenant_id, consultation_type);

CREATE TRIGGER consultations_updated_at
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: clinical_attachments
-- Archivos adjuntos: labs, imágenes, otros documentos
-- -------------------------------------------------------
CREATE TABLE clinical_attachments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id   UUID REFERENCES consultations(id) ON DELETE SET NULL,

  file_name         VARCHAR(255) NOT NULL,
  file_type         VARCHAR(100),     -- MIME type
  file_size_bytes   INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),

  -- Ruta en Supabase Storage
  -- Formato: {tenant_id}/patients/{patient_id}/attachments/{file_name}
  storage_path      TEXT NOT NULL,

  -- Categoría del archivo
  category          VARCHAR(50) NOT NULL DEFAULT 'other'
                    CHECK (category IN ('lab','imaging','ecg','prescription','report','other')),
  notes             TEXT,
  uploaded_by       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_tenant ON clinical_attachments(tenant_id);
CREATE INDEX idx_attachments_patient ON clinical_attachments(tenant_id, patient_id);
CREATE INDEX idx_attachments_consultation ON clinical_attachments(consultation_id)
  WHERE consultation_id IS NOT NULL;

COMMENT ON TABLE consultations IS 'Historial clínico — PHI. NUNCA loguear contenido. Auditar acceso.';
COMMENT ON COLUMN consultations.ai_suggestions IS 'Log de sugerencias IA — solo códigos CIE-10, nunca datos del paciente';
COMMENT ON COLUMN clinical_attachments.storage_path IS 'Path en Supabase Storage. RLS aplica: {tenant_id}/patients/{patient_id}/...';
