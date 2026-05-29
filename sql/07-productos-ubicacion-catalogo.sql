-- =====================================================================
-- MIGRACIÓN: catálogo estandarizado de productos, ubicación y georreferencia
-- Ejecutar en Supabase SQL Editor DESPUÉS de 01–06.
-- =====================================================================

-- ----- Catálogo: tipos de producto / ayuda técnica (una categoría por registro)
CREATE TABLE IF NOT EXISTS public.catalogo_producto_apoyo (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  etiqueta   TEXT NOT NULL,
  orden      INT  NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.catalogo_producto_apoyo IS
  'Categorías estandarizadas de productos y ayudas técnicas (un producto = una categoría del catálogo).';

CREATE INDEX IF NOT EXISTS idx_catalogo_producto_orden ON public.catalogo_producto_apoyo (orden);

INSERT INTO public.catalogo_producto_apoyo (slug, etiqueta, orden) VALUES
  ('movilidad',              'Movilidad',                         10),
  ('auditivo',               'Auditivo',                          20),
  ('visual',                 'Visual',                            30),
  ('comunicacion',           'Comunicación y lenguaje',           40),
  ('cognitivo_sensorial',    'Cognitivo / sensorial',             50),
  ('hogar_adaptaciones',     'Hogar y adaptaciones',              60),
  ('ortesis_protesis',       'Órtesis, prótesis y soporte',       70),
  ('autocuidado',            'Autocuidado e higiene',             80),
  ('deporte_recreacion',     'Deporte y recreación inclusiva',    90),
  ('otros',                  'Otros productos de apoyo',         100)
ON CONFLICT (slug) DO NOTHING;

-- ----- Columnas de ubicación en productos
ALTER TABLE public.productos_apoyo
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS direccion_complemento TEXT,
  ADD COLUMN IF NOT EXISTS comuna TEXT,
  ADD COLUMN IF NOT EXISTS barrio TEXT,
  ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS catalogo_producto_id UUID REFERENCES public.catalogo_producto_apoyo (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.productos_apoyo.direccion IS 'Dirección del punto de venta o entrega del producto.';
COMMENT ON COLUMN public.productos_apoyo.latitud IS 'Latitud WGS84 para mapa público.';
COMMENT ON COLUMN public.productos_apoyo.catalogo_producto_id IS 'Categoría estandarizada (sustituye texto libre en categoria cuando está asignada).';

CREATE INDEX IF NOT EXISTS idx_productos_geo
  ON public.productos_apoyo (latitud, longitud)
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- Sincronizar categoría legado desde catálogo donde falte vínculo pero haya texto parecido
UPDATE public.productos_apoyo p
SET catalogo_producto_id = c.id
FROM public.catalogo_producto_apoyo c
WHERE p.catalogo_producto_id IS NULL
  AND p.categoria IS NOT NULL
  AND lower(trim(p.categoria)) = lower(trim(c.etiqueta));

-- Vista pública del mapa (categoría = texto del directorio / CSV, no catálogo fijo)
DROP VIEW IF EXISTS public.v_productos;
CREATE VIEW public.v_productos AS
SELECT
  p.id,
  p.categoria                        AS cat,
  NULL::text                         AS cat_slug,
  p.proveedor                        AS prov,
  p.oferta,
  p.contacto,
  p.direccion                        AS d,
  p.direccion_complemento            AS d_compl,
  p.comuna                           AS c,
  p.barrio,
  p.latitud                          AS lat,
  p.longitud                         AS lon
FROM public.productos_apoyo p;

ALTER VIEW public.v_productos SET (security_invoker = on);
