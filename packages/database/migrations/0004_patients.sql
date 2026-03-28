-- ============================================================
-- 0004_patients.sql
-- Gestión de pacientes — datos clínicos + LOPDP compliance
-- ============================================================

CREATE TYPE sex_type AS ENUM ('masculino', 'femenino', 'otro');
CREATE TYPE blood_type AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-','desconocido');
CREATE TYPE civil_status AS ENUM ('soltero','casado','divorciado','viudo','union_libre');
CREATE TYPE insurance_type AS ENUM ('iess','issfa','isspol','privado','ninguno');

-- -------------------------------------------------------
-- Tabla: patients
-- -------------------------------------------------------
CREATE TABLE patients (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Identificación
  cedula                    VARCHAR(13),
  cedula_type               VARCHAR(20) NOT NULL DEFAULT 'cedula'
                            CHECK (cedula_type IN ('cedula','pasaporte','ruc')),
  first_name                VARCHAR(100) NOT NULL,
  last_name                 VARCHAR(100) NOT NULL,
  birth_date                DATE,
  sex                       sex_type,
  civil_status              civil_status,
  nationality               VARCHAR(100) NOT NULL DEFAULT 'Ecuatoriana',

  -- Contacto
  email                     VARCHAR(255),
  phone                     VARCHAR(20),
  phone_alt                 VARCHAR(20),
  address                   TEXT,
  city                      VARCHAR(100),
  province                  VARCHAR(100),

  -- Datos médicos
  blood_type                blood_type NOT NULL DEFAULT 'desconocido',
  allergies                 TEXT[] NOT NULL DEFAULT '{}',
  chronic_conditions        TEXT[] NOT NULL DEFAULT '{}',
  emergency_contact_name    VARCHAR(200),
  emergency_contact_phone   VARCHAR(20),

  -- Seguro médico
  insurance_type            insurance_type NOT NULL DEFAULT 'ninguno',
  insurance_number          VARCHAR(50),
  insurance_company         VARCHAR(200),

  -- Seguro con desglose de cobertura (para facturación)
  insurance_coverage_pct    NUMERIC(5,2)
                            CHECK (insurance_coverage_pct IS NULL
                              OR (insurance_coverage_pct >= 0 AND insurance_coverage_pct <= 100)),

  -- Estado
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  photo_url                 TEXT,
  notes                     TEXT,

  -- LOPDP Ecuador — Consentimientos obligatorios
  data_consent              BOOLEAN NOT NULL DEFAULT false,
  data_consent_date         TIMESTAMPTZ,
  marketing_consent         BOOLEAN NOT NULL DEFAULT false,
  -- Consentimiento para compartir datos anonimizados (Data Business)
  data_sharing_consent      BOOLEAN NOT NULL DEFAULT false,
  data_sharing_consent_date TIMESTAMPTZ,

  -- Portal del paciente
  portal_user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Metadata
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un tenant no puede tener dos pacientes con la misma cédula
  UNIQUE NULLS NOT DISTINCT (tenant_id, cedula)
);

-- Índices
CREATE INDEX idx_patients_tenant ON patients(tenant_id);
CREATE INDEX idx_patients_cedula ON patients(tenant_id, cedula)
  WHERE cedula IS NOT NULL;

-- Búsqueda por nombre — Full Text Search
CREATE INDEX idx_patients_name_fts ON patients
  USING GIN (to_tsvector('spanish', first_name || ' ' || last_name));

-- Búsqueda por nombre — Trigram (para LIKE/ILIKE)
CREATE INDEX idx_patients_name_trgm ON patients
  USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX idx_patients_phone ON patients(tenant_id, phone)
  WHERE phone IS NOT NULL;
CREATE INDEX idx_patients_email ON patients(tenant_id, email)
  WHERE email IS NOT NULL;
CREATE INDEX idx_patients_portal_user ON patients(portal_user_id)
  WHERE portal_user_id IS NOT NULL;
CREATE INDEX idx_patients_active ON patients(tenant_id, is_active)
  WHERE is_active = true;

CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función de búsqueda de pacientes con ranking
CREATE OR REPLACE FUNCTION search_patients(
  p_tenant_id UUID,
  p_query     TEXT,
  p_limit     INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  cedula VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  rank FLOAT4
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id,
    p.first_name || ' ' || p.last_name AS full_name,
    p.cedula,
    p.phone,
    p.email,
    GREATEST(
      ts_rank(
        to_tsvector('spanish', p.first_name || ' ' || p.last_name),
        websearch_to_tsquery('spanish', p_query)
      ),
      similarity(p.first_name || ' ' || p.last_name, p_query)
    ) AS rank
  FROM patients p
  WHERE
    p.tenant_id = p_tenant_id
    AND p.is_active = true
    AND (
      (p.first_name || ' ' || p.last_name) ILIKE '%' || p_query || '%'
      OR p.cedula ILIKE '%' || p_query || '%'
      OR p.phone ILIKE '%' || p_query || '%'
      OR to_tsvector('spanish', p.first_name || ' ' || p.last_name)
         @@ websearch_to_tsquery('spanish', p_query)
    )
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- FK deferido: agregar link desde user_profiles a patients
ALTER TABLE user_profiles
  ADD CONSTRAINT fk_user_profiles_patient
  FOREIGN KEY (patient_id)
  REFERENCES patients(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE patients IS 'Pacientes del tenant. Datos PHI/PII — acceso auditado. NUNCA loguear contenido.';
COMMENT ON COLUMN patients.data_consent IS 'Consentimiento LOPDP requerido antes de almacenar datos';
COMMENT ON COLUMN patients.data_sharing_consent IS 'Consentimiento para Data Business — verificar antes de ETL';
