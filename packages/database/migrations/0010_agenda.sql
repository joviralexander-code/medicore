-- ============================================================
-- 0010_agenda.sql
-- Sistema de agenda bidireccional
-- Médico / secretaria / portal paciente / WhatsApp
-- ============================================================

CREATE TYPE appointment_status AS ENUM (
  'programada', 'confirmada', 'en_proceso', 'completada',
  'cancelada', 'no_show', 'reprogramada'
);

CREATE TYPE appointment_source AS ENUM (
  'manual', 'portal', 'whatsapp', 'phone', 'walk_in'
);

-- -------------------------------------------------------
-- Tabla: appointment_slots
-- Disponibilidad del médico por día y hora
-- -------------------------------------------------------
CREATE TABLE appointment_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doctor_id       UUID NOT NULL REFERENCES user_profiles(id),

  date            DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  duration_min    SMALLINT GENERATED ALWAYS AS (
    CAST(EXTRACT(EPOCH FROM (end_time - start_time)) / 60 AS SMALLINT)
  ) STORED,

  is_available    BOOLEAN NOT NULL DEFAULT true,
  is_blocked      BOOLEAN NOT NULL DEFAULT false,
  block_reason    VARCHAR(255),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, doctor_id, date, start_time),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_slots_tenant_doctor ON appointment_slots(tenant_id, doctor_id, date);
CREATE INDEX idx_slots_available ON appointment_slots(tenant_id, doctor_id, date)
  WHERE is_available = true AND is_blocked = false;

-- -------------------------------------------------------
-- Tabla: appointments
-- Citas médicas (origen: manual, portal, WhatsApp, etc.)
-- -------------------------------------------------------
CREATE TABLE appointments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id            UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id             UUID NOT NULL REFERENCES user_profiles(id),
  slot_id               UUID REFERENCES appointment_slots(id) ON DELETE SET NULL,

  appointment_date      DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  consultation_type     consultation_type NOT NULL DEFAULT 'primera_vez',

  status                appointment_status NOT NULL DEFAULT 'programada',
  source                appointment_source NOT NULL DEFAULT 'manual',

  reason                TEXT,
  notes                 TEXT,
  internal_notes        TEXT,   -- Solo visible para médico/secretaria

  -- Recordatorios enviados
  reminder_24h_sent     BOOLEAN NOT NULL DEFAULT false,
  reminder_24h_sent_at  TIMESTAMPTZ,
  reminder_1h_sent      BOOLEAN NOT NULL DEFAULT false,
  reminder_1h_sent_at   TIMESTAMPTZ,

  -- WhatsApp thread vinculado
  whatsapp_thread_id    UUID,   -- FK a whatsapp_conversations (migración 0013)

  -- Links a módulos relacionados
  sri_document_id       UUID REFERENCES sri_documents(id) ON DELETE SET NULL,
  consultation_id       UUID REFERENCES consultations(id) ON DELETE SET NULL,

  -- Cancelación
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  cancellation_reason   TEXT,

  -- Reprogramación
  rescheduled_from      UUID REFERENCES appointments(id) ON DELETE SET NULL,

  created_by            UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_time > start_time)
);

CREATE INDEX idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX idx_appointments_patient ON appointments(tenant_id, patient_id);
CREATE INDEX idx_appointments_doctor_date ON appointments(tenant_id, doctor_id, appointment_date);
CREATE INDEX idx_appointments_status ON appointments(tenant_id, status, appointment_date);
CREATE INDEX idx_appointments_reminders ON appointments(tenant_id, appointment_date)
  WHERE status IN ('programada', 'confirmada')
    AND (reminder_24h_sent = false OR reminder_1h_sent = false);

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- FK: consultations.appointment_id
ALTER TABLE consultations
  ADD CONSTRAINT fk_consultations_appointment
  FOREIGN KEY (appointment_id)
  REFERENCES appointments(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
