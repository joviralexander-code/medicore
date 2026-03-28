-- ============================================================
-- 0009_pharmacy.sql
-- Base de medicamentos con precios de farmacias Ecuador
-- Datos scrapeados cada 6h via BullMQ (Fybeca, Cruz Azul, etc.)
-- ============================================================

CREATE TYPE molecule_category AS ENUM (
  'analgesico', 'antiinflamatorio', 'antibiotico', 'antihipertensivo',
  'antidiabetico', 'cardiovascular', 'respiratorio', 'neurologico',
  'endocrino', 'gastrointestinal', 'dermatologico', 'ginecologico',
  'oftalmologico', 'psiquiatrico', 'oncologico', 'inmunologico', 'otro'
);

-- -------------------------------------------------------
-- Tabla: molecules (moléculas activas — base global)
-- -------------------------------------------------------
CREATE TABLE molecules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(300) NOT NULL,
  atc_code          VARCHAR(10) UNIQUE,  -- Clasificación ATC de la OMS
  category          molecule_category,
  description       TEXT,

  -- Interacciones medicamentosas
  -- [{molecule_id: UUID, molecule_name: str, severity: 'leve'|'moderada'|'grave', description: str}]
  interactions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  contraindications TEXT[] NOT NULL DEFAULT '{}',

  -- Clasificación de riesgo en embarazo (FDA A/B/C/D/X)
  pregnancy_risk    VARCHAR(5)
                    CHECK (pregnancy_risk IS NULL OR pregnancy_risk IN ('A','B','C','D','X')),

  -- Medicamento controlado (requiere receta retenida)
  controlled        BOOLEAN NOT NULL DEFAULT false,

  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_molecules_name ON molecules USING GIN(name gin_trgm_ops);
CREATE INDEX idx_molecules_atc ON molecules(atc_code) WHERE atc_code IS NOT NULL;
CREATE INDEX idx_molecules_category ON molecules(category);
CREATE INDEX idx_molecules_name_fts ON molecules
  USING GIN (to_tsvector('spanish', name));

CREATE TRIGGER molecules_updated_at
  BEFORE UPDATE ON molecules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: pharmacy_products (presentaciones comerciales)
-- -------------------------------------------------------
CREATE TABLE pharmacy_products (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  molecule_id         UUID REFERENCES molecules(id) ON DELETE SET NULL,

  brand_name          VARCHAR(300) NOT NULL,
  manufacturer        VARCHAR(200),
  pharmaceutical_form VARCHAR(100),   -- 'tableta', 'cápsula', 'jarabe', 'inyectable', ...
  concentration       VARCHAR(100),   -- '500mg', '10mg/ml', ...
  presentation        VARCHAR(200),   -- 'Caja x 20 tabletas', 'Frasco 120ml', ...
  barcode             VARCHAR(30),

  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_molecule ON pharmacy_products(molecule_id);
CREATE INDEX idx_products_brand ON pharmacy_products USING GIN(brand_name gin_trgm_ops);
CREATE INDEX idx_products_brand_fts ON pharmacy_products
  USING GIN (to_tsvector('spanish', brand_name));
CREATE INDEX idx_products_barcode ON pharmacy_products(barcode) WHERE barcode IS NOT NULL;

CREATE TRIGGER pharmacy_products_updated_at
  BEFORE UPDATE ON pharmacy_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- -------------------------------------------------------
-- Tabla: pharmacy_prices (precios por cadena — datos scrapeados)
-- No tiene tenant_id: datos globales para todos los médicos
-- -------------------------------------------------------
CREATE TABLE pharmacy_prices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID NOT NULL REFERENCES pharmacy_products(id) ON DELETE CASCADE,

  pharmacy_name     VARCHAR(50) NOT NULL
                    CHECK (pharmacy_name IN ('fybeca','cruz_azul','sana_sana','pharmacys','medicity')),
  price             NUMERIC(10,2),            -- Precio normal
  pvp               NUMERIC(10,2),            -- Precio de venta al público
  stock_status      VARCHAR(30)
                    CHECK (stock_status IS NULL OR stock_status IN ('disponible','agotado','bajo_pedido','sin_info')),
  product_url       TEXT,                     -- URL del producto en la farmacia
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  cache_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '6 hours')
);

CREATE INDEX idx_pharmacy_prices_product ON pharmacy_prices(product_id);
CREATE INDEX idx_pharmacy_prices_pharmacy ON pharmacy_prices(pharmacy_name, scraped_at DESC);
CREATE INDEX idx_pharmacy_prices_expires ON pharmacy_prices(cache_expires_at);

-- Vista: precios actuales (sin expirados)
CREATE VIEW pharmacy_prices_current AS
SELECT * FROM pharmacy_prices
WHERE cache_expires_at > now();

-- Función de búsqueda de medicamentos con precios
CREATE OR REPLACE FUNCTION search_medications(
  p_query   TEXT,
  p_limit   INTEGER DEFAULT 20
)
RETURNS TABLE (
  product_id        UUID,
  brand_name        VARCHAR,
  molecule_name     VARCHAR,
  concentration     VARCHAR,
  pharmaceutical_form VARCHAR,
  pharmacy_count    BIGINT,
  min_price         NUMERIC,
  max_price         NUMERIC,
  rank              FLOAT4
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pp.id AS product_id,
    pp.brand_name,
    m.name AS molecule_name,
    pp.concentration,
    pp.pharmaceutical_form,
    COUNT(DISTINCT pr.pharmacy_name) FILTER (WHERE pr.cache_expires_at > now()) AS pharmacy_count,
    MIN(pr.pvp) FILTER (WHERE pr.cache_expires_at > now()) AS min_price,
    MAX(pr.pvp) FILTER (WHERE pr.cache_expires_at > now()) AS max_price,
    GREATEST(
      similarity(pp.brand_name, p_query),
      similarity(COALESCE(m.name, ''), p_query),
      CASE WHEN pp.brand_name ILIKE p_query || '%' THEN 1.0 ELSE 0.0 END
    ) AS rank
  FROM pharmacy_products pp
  LEFT JOIN molecules m ON m.id = pp.molecule_id
  LEFT JOIN pharmacy_prices pr ON pr.product_id = pp.id
  WHERE
    pp.is_active = true
    AND (
      pp.brand_name ILIKE '%' || p_query || '%'
      OR m.name ILIKE '%' || p_query || '%'
    )
  GROUP BY pp.id, pp.brand_name, m.name, pp.concentration, pp.pharmaceutical_form
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

COMMENT ON TABLE pharmacy_prices IS 'Precios scrapeados cada 6h de Fybeca, Cruz Azul, Sana Sana, Pharmacys, Medicity. Cache Redis 6h/30min.';
