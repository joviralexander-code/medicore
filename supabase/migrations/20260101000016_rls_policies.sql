-- ============================================================
-- 0016_rls_policies.sql
-- Row Level Security — aislamiento multi-tenant
-- NUNCA hacer queries cross-tenant
-- SIEMPRE ejecutar npm run test:rls después de cambios aquí
-- ============================================================

-- ============================================================
-- HELPER: Funciones para leer claims del JWT
-- Los claims tenant_id y role los inyecta el Custom Access Token Hook
-- ============================================================

CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '')::UUID;
$$;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() ->> 'role';
$$;

CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION auth_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() IN ('admin', 'secretaria');
$$;

-- ============================================================
-- RLS: tenants
-- Solo el admin del tenant puede ver/editar su propio tenant
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (id = auth_tenant_id());

CREATE POLICY "tenants_update_own" ON tenants
  FOR UPDATE USING (id = auth_tenant_id() AND auth_is_admin())
  WITH CHECK (id = auth_tenant_id());

-- ============================================================
-- RLS: user_profiles
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Staff (admin/secretaria) puede ver perfiles del mismo tenant
CREATE POLICY "user_profiles_select_tenant" ON user_profiles
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

-- Cada usuario puede ver su propio perfil
CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT USING (id = auth.uid());

-- Solo admin puede crear/actualizar perfiles del tenant
CREATE POLICY "user_profiles_insert_admin" ON user_profiles
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "user_profiles_update_admin" ON user_profiles
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- Cada usuario puede actualizar su propio perfil básico
CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- RLS: tenant_invitations
-- ============================================================
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select_admin" ON tenant_invitations
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "invitations_insert_admin" ON tenant_invitations
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "invitations_delete_admin" ON tenant_invitations
  FOR DELETE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: patients
-- Admin y secretaria ven todos los pacientes del tenant
-- Paciente solo ve su propio registro (via portal)
-- ============================================================
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_select_staff" ON patients
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "patients_select_own_portal" ON patients
  FOR SELECT USING (
    portal_user_id = auth.uid()
  );

CREATE POLICY "patients_insert_staff" ON patients
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "patients_update_staff" ON patients
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "patients_delete_admin" ON patients
  FOR DELETE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: consultations
-- Admin y médicos (admin) pueden escribir
-- Secretaria solo lee
-- Paciente lee sus propias
-- ============================================================
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultations_select_staff" ON consultations
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "consultations_select_patient_portal" ON consultations
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = consultations.patient_id
        AND p.portal_user_id = auth.uid()
    )
  );

CREATE POLICY "consultations_write_admin" ON consultations
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  ) WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: clinical_attachments
-- ============================================================
ALTER TABLE clinical_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select_staff" ON clinical_attachments
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "attachments_write_staff" ON clinical_attachments
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "attachments_delete_admin" ON clinical_attachments
  FOR DELETE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: sri_documents
-- Secretaria puede crear facturas
-- Paciente ve sus propias facturas
-- ============================================================
ALTER TABLE sri_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sri_docs_select_staff" ON sri_documents
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "sri_docs_select_patient" ON sri_documents
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = sri_documents.patient_id
        AND p.portal_user_id = auth.uid()
    )
  );

CREATE POLICY "sri_docs_insert_staff" ON sri_documents
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "sri_docs_update_admin" ON sri_documents
  FOR UPDATE USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: sri_transmissions
-- Solo admin puede ver el log de transmisiones
-- ============================================================
ALTER TABLE sri_transmissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sri_transmissions_admin" ON sri_transmissions
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: prescriptions
-- ============================================================
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescriptions_select_staff" ON prescriptions
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "prescriptions_select_patient" ON prescriptions
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = prescriptions.patient_id
        AND p.portal_user_id = auth.uid()
    )
  );

CREATE POLICY "prescriptions_write_admin" ON prescriptions
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  ) WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: appointments y slots
-- Paciente puede crear citas vía portal
-- ============================================================
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slots_select_staff" ON appointment_slots
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

-- Paciente puede ver slots disponibles de su tenant para agendar
CREATE POLICY "slots_select_patient_portal" ON appointment_slots
  FOR SELECT USING (
    is_available = true
    AND is_blocked = false
    AND tenant_id IN (
      SELECT p.tenant_id FROM patients p WHERE p.portal_user_id = auth.uid()
    )
  );

CREATE POLICY "slots_write_admin" ON appointment_slots
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "appointments_select_staff" ON appointments
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "appointments_select_patient" ON appointments
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = appointments.patient_id
        AND p.portal_user_id = auth.uid()
    )
  );

CREATE POLICY "appointments_insert_patient_portal" ON appointments
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id FROM patients p WHERE p.portal_user_id = auth.uid()
    )
    AND source = 'portal'
  );

CREATE POLICY "appointments_write_staff" ON appointments
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  ) WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

-- ============================================================
-- RLS: finances — SOLO admin
-- ============================================================
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_transactions_admin_only" ON financial_transactions
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  ) WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "cash_sessions_admin_only" ON cash_register_sessions
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  ) WITH CHECK (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: social — solo admin
-- ============================================================
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_accounts_admin" ON social_accounts
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "social_posts_admin" ON social_posts
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: WhatsApp
-- ============================================================
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_connections_admin" ON whatsapp_connections
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

CREATE POLICY "wa_conversations_staff" ON whatsapp_conversations
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "wa_conversations_write_staff" ON whatsapp_conversations
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND auth_is_staff());

CREATE POLICY "wa_conversations_update_staff" ON whatsapp_conversations
  FOR UPDATE USING (tenant_id = auth_tenant_id() AND auth_is_staff());

CREATE POLICY "wa_messages_staff" ON whatsapp_messages
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND auth_is_staff()
  );

CREATE POLICY "wa_messages_insert_staff" ON whatsapp_messages
  FOR INSERT WITH CHECK (tenant_id = auth_tenant_id() AND auth_is_staff());

-- ============================================================
-- RLS: CIE-10 — global, solo lectura, cualquier usuario autenticado
-- ============================================================
ALTER TABLE cie10_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cie10_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cie10_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cie10_codes_read_all" ON cie10_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cie10_categories_read_all" ON cie10_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cie10_chapters_read_all" ON cie10_chapters
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- RLS: pharmacy — global, solo lectura para staff
-- ============================================================
ALTER TABLE molecules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "molecules_read_staff" ON molecules
  FOR SELECT USING (auth_is_staff());

CREATE POLICY "pharmacy_products_read_staff" ON pharmacy_products
  FOR SELECT USING (auth_is_staff());

CREATE POLICY "pharmacy_prices_read_staff" ON pharmacy_prices
  FOR SELECT USING (auth_is_staff());

-- ============================================================
-- RLS: data_business — solo admin con plan habilitado
-- ============================================================
ALTER TABLE data_business_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_consent_admin" ON data_business_consent
  FOR ALL USING (
    tenant_id = auth_tenant_id()
    AND auth_is_admin()
  );

-- ============================================================
-- RLS: plans — solo lectura para todos
-- ============================================================
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_read_all" ON plans
  FOR SELECT USING (true);

-- ============================================================
-- audit_log: SIN RLS
-- Solo accesible via service_role desde el backend
-- ============================================================
-- NO aplicar RLS a audit_log — acceso solo por service_role

COMMENT ON FUNCTION auth_tenant_id() IS 'Lee tenant_id del JWT. Inyectado por Custom Access Token Hook.';
COMMENT ON FUNCTION auth_role() IS 'Lee role del JWT. Inyectado por Custom Access Token Hook.';
