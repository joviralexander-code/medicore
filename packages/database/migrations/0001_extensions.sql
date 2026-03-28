-- ============================================================
-- 0001_extensions.sql
-- Extensions y configuraciones globales de PostgreSQL
-- IMPORTANTE: Debe ser la primera migración
-- ============================================================

-- Extensions necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Búsqueda trigram (nombre de paciente)
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- Búsqueda sin acentos (CIE-10 español)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- encrypt/decrypt para P12 y tokens
CREATE EXTENSION IF NOT EXISTS "btree_gist";    -- EXCLUDE USING GIST con tipos no-geométricos

-- Configuración de búsqueda de texto en español sin acentos
-- Necesario para CIE-10 autocomplete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'spanish_unaccent'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
  END IF;
END
$$;
ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, spanish_stem;

-- Función helper para timestamps con zona horaria Ecuador
CREATE OR REPLACE FUNCTION now_ec()
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
AS $$
  SELECT now() AT TIME ZONE 'America/Guayaquil';
$$;

COMMENT ON FUNCTION now_ec() IS 'Retorna timestamp actual en zona horaria Ecuador (America/Guayaquil)';
