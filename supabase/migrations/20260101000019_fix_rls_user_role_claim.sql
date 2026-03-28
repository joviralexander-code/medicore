-- ============================================================
-- 0019_fix_rls_user_role_claim.sql
-- Corrección: el claim 'role' en JWT es reservado por PostgREST
-- para el database role. El rol de aplicación se guarda en 'user_role'.
-- ============================================================

-- Actualizar helper functions para leer 'user_role' en vez de 'role'
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() ->> 'user_role';
$$;

CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'user_role') = 'admin';
$$;

CREATE OR REPLACE FUNCTION auth_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'user_role') IN ('admin', 'secretaria');
$$;

COMMENT ON FUNCTION auth_role() IS 'Lee user_role del JWT (claim de aplicación, distinto del database role).';
COMMENT ON FUNCTION auth_is_admin() IS 'True si user_role = admin.';
COMMENT ON FUNCTION auth_is_staff() IS 'True si user_role IN (admin, secretaria).';
