-- Storage bucket para certificados SRI (privado)
-- El API server accede con service_role; ningún usuario puede acceder directamente
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sri-certificates',
  'sri-certificates',
  false,
  1048576,  -- 1MB max
  ARRAY['application/octet-stream', 'application/x-pkcs12']
)
ON CONFLICT (id) DO NOTHING;

-- Solo service_role puede acceder a los objetos del bucket
-- RLS para storage.objects
CREATE POLICY "sri_certs_service_only" ON storage.objects
  FOR ALL USING (
    bucket_id = 'sri-certificates'
    AND auth.role() = 'service_role'
  );
