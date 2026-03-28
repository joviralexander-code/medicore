-- ============================================================
-- 0005_cie10.sql
-- Base de datos CIE-10 en español (Clasificación Internacional de Enfermedades)
-- Datos globales — sin tenant_id — solo lectura para todos los usuarios
-- Fuente: verasativa/CIE-10 en GitHub (aprox. 14,000 registros)
-- ============================================================

-- -------------------------------------------------------
-- Tabla: cie10_chapters (capítulos)
-- -------------------------------------------------------
CREATE TABLE cie10_chapters (
  id          SMALLINT PRIMARY KEY,
  code_range  VARCHAR(10) NOT NULL,  -- Ej: 'A00-B99'
  title       TEXT NOT NULL
);

-- -------------------------------------------------------
-- Tabla: cie10_categories (categorías de 3 dígitos)
-- -------------------------------------------------------
CREATE TABLE cie10_categories (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(3) UNIQUE NOT NULL,  -- Ej: 'A00'
  description TEXT NOT NULL,
  chapter_id  SMALLINT REFERENCES cie10_chapters(id)
);

CREATE INDEX idx_cie10_cat_code ON cie10_categories(code);
CREATE INDEX idx_cie10_cat_chapter ON cie10_categories(chapter_id);

-- -------------------------------------------------------
-- Tabla: cie10_codes (códigos completos)
-- Incluye vector de búsqueda generado automáticamente
-- -------------------------------------------------------
CREATE TABLE cie10_codes (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(8) UNIQUE NOT NULL,  -- Ej: 'A00.0', 'Z99.89'
  description     TEXT NOT NULL,
  category_id     INTEGER REFERENCES cie10_categories(id),
  inclusions      TEXT,      -- Texto "incluye" de la descripción
  exclusions      TEXT,      -- Texto "excluye" de la descripción
  notes           TEXT,

  -- Vector de búsqueda FTS generado automáticamente
  -- Combina código + descripción para búsqueda eficiente
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector(
      'spanish_unaccent',
      code || ' ' || description || ' ' ||
      COALESCE(inclusions, '') || ' ' ||
      COALESCE(notes, '')
    )
  ) STORED
);

-- Índices para búsqueda
CREATE INDEX idx_cie10_search_vector ON cie10_codes USING GIN(search_vector);
CREATE INDEX idx_cie10_description_trgm ON cie10_codes
  USING GIN(description gin_trgm_ops);
CREATE INDEX idx_cie10_code ON cie10_codes(code);
CREATE INDEX idx_cie10_category ON cie10_codes(category_id);

-- Función de búsqueda CIE-10 con ranking combinado
CREATE OR REPLACE FUNCTION search_cie10(
  p_query  TEXT,
  p_limit  INTEGER DEFAULT 15
)
RETURNS TABLE (
  id          INTEGER,
  code        VARCHAR,
  description TEXT,
  rank        FLOAT4
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.code,
    c.description,
    GREATEST(
      ts_rank(c.search_vector, websearch_to_tsquery('spanish_unaccent', p_query)),
      similarity(c.description, p_query),
      -- Boost exacto si el código coincide
      CASE WHEN c.code ILIKE p_query || '%' THEN 1.0 ELSE 0.0 END
    ) AS rank
  FROM cie10_codes c
  WHERE
    c.search_vector @@ websearch_to_tsquery('spanish_unaccent', p_query)
    OR c.description ILIKE '%' || p_query || '%'
    OR c.code ILIKE p_query || '%'
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

COMMENT ON TABLE cie10_codes IS 'CIE-10 en español. Datos globales, solo lectura. Seed desde verasativa/CIE-10 GitHub.';
COMMENT ON FUNCTION search_cie10(TEXT, INTEGER) IS 'Búsqueda CIE-10 por código o descripción. Ranking combinado FTS + trigram.';
