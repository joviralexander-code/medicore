-- ============================================================
-- 0017_storage_buckets.sql
-- Configuración de buckets de Supabase Storage con RLS
-- ============================================================

-- Bucket: medical-records (archivos clínicos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-records',
  'medical-records',
  false,  -- PRIVADO — requiere autenticación
  52428800,  -- 50MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf',
        'application/dicom','text/plain']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: sri-documents (XMLs firmados, RIDEs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sri-documents',
  'sri-documents',
  false,
  10485760,  -- 10MB
  ARRAY['application/xml','application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: prescriptions (PDFs de recetas)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions',
  'prescriptions',
  false,
  5242880,  -- 5MB
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: social-media (imágenes para publicaciones)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-media',
  'social-media',
  false,
  20971520,  -- 20MB
  ARRAY['image/jpeg','image/png','image/webp','video/mp4']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: finances (soportes contables)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finances',
  'finances',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Bucket: exports (reportes Data Business — temporal)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  104857600,  -- 100MB
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/json']
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS para Storage: medical-records
-- El path debe comenzar con el tenant_id del usuario
-- ============================================================

CREATE POLICY "medical_records_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_staff()
  );

CREATE POLICY "medical_records_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_staff()
  );

CREATE POLICY "medical_records_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_admin()
  );

-- RLS para sri-documents
CREATE POLICY "sri_docs_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'sri-documents'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_staff()
  );

CREATE POLICY "sri_docs_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'sri-documents'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_staff()
  );

-- RLS para prescriptions
CREATE POLICY "prescriptions_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'prescriptions'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_staff()
  );

-- Paciente puede ver sus propias recetas
CREATE POLICY "prescriptions_storage_patient" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'prescriptions'
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.portal_user_id = auth.uid()
        AND name LIKE '%' || p.id::TEXT || '%'
    )
  );

-- RLS para social-media
CREATE POLICY "social_media_storage_admin" ON storage.objects
  FOR ALL USING (
    bucket_id = 'social-media'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_admin()
  );

-- RLS para finances
CREATE POLICY "finances_storage_admin" ON storage.objects
  FOR ALL USING (
    bucket_id = 'finances'
    AND (storage.foldername(name))[1] = auth_tenant_id()::TEXT
    AND auth_is_admin()
  );
