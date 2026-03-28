-- ============================================================
-- 0015_audit_log.sql
-- Audit trail para compliance LOPDP Ecuador
-- Registra acceso a datos PHI/PII
-- Solo service_role puede insertar — nunca exponer en API pública
-- ============================================================

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID,         -- NULL para acciones del sistema
  user_id         UUID,         -- NULL para acciones automatizadas
  user_role       user_role,

  -- Qué acción
  action          VARCHAR(100) NOT NULL,
  -- Ej: 'patient.read', 'patient.update', 'consultation.create',
  --     'sri.sign', 'sri.transmit', 'prescription.download', 'data.export'

  -- Sobre qué recurso
  resource_type   VARCHAR(50) NOT NULL,
  resource_id     UUID,

  -- NUNCA almacenar PHI en old_data / new_data
  -- Solo metadatos: qué campos cambiaron, sin los valores sensibles
  changed_fields  TEXT[],   -- ['first_name', 'email'] — qué campos, sin los valores
  metadata        JSONB,    -- Datos no-PHI adicionales

  -- Red
  ip_address      INET,
  user_agent      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Particionado por mes para performance (implementar cuando el volumen lo requiera)
-- Por ahora índices simples
CREATE INDEX idx_audit_tenant_date ON audit_log(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);

-- IMPORTANTE: Sin RLS en esta tabla
-- Solo accesible via service_role (apps/api)
-- NUNCA exponer en endpoints públicos ni de médicos/secretarias

COMMENT ON TABLE audit_log IS 'Audit trail LOPDP. Solo service_role. NUNCA almacenar PHI. Solo metadatos de acceso.';
COMMENT ON COLUMN audit_log.changed_fields IS 'Lista de nombres de campos modificados, SIN los valores (que son PHI)';
