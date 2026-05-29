-- =====================================================================
-- MIGRACIÓN: catálogo de servicios de oferta, catálogo de discapacidad
--           y tablas puente institución ↔ catálogo.
-- Ejecutar en Supabase SQL Editor DESPUÉS de 01–04 (y 02-rls si aplica).
-- Luego ejecutar 06-rls-catalogos-oferta.sql **en el mismo proyecto y solo si el 05 terminó sin error**.
--
-- Si aparece 42P16 al “reemplazar” vistas: ya no aplica; este script hace DROP VIEW y CREATE.
-- =====================================================================

-- ----- Catálogo: tipos de servicio (filas tipo planilla Excel, muchos-a-muchos)
CREATE TABLE IF NOT EXISTS public.servicio_oferta (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  etiqueta   TEXT NOT NULL,
  orden      INT  NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.servicio_oferta IS
  'Categorías estandarizadas de servicios que puede ofrecer una institución (varias por institución).';

CREATE INDEX IF NOT EXISTS idx_servicio_oferta_orden ON public.servicio_oferta (orden);

INSERT INTO public.servicio_oferta (slug, etiqueta, orden) VALUES
  ('educacion_capacitacion',    'Educación/capacitación',           10),
  ('asesoria_apoyo_social',     'Asesoría y apoyo social',           20),
  ('apoyo_inclusion',           'Apoyo a la inclusión',              30),
  ('rehabilitacion_fisica',      'Rehabilitación física',             40),
  ('rehabilitacion_integral',    'Rehabilitación integral',           50),
  ('habilitacion_ocupacional',   'Habilitación ocupacional',          60),
  ('hogar_permanente',           'Hogar permanente',                  70),
  ('productos_apoyo_servicio',   'Productos de apoyo',                80),
  ('consulta_medica',           'Consulta médica',                   90)
ON CONFLICT (slug) DO NOTHING;

-- ----- Catálogo: tipo de discapacidad / población (varias por institución)
CREATE TABLE IF NOT EXISTS public.catalogo_discapacidad (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  etiqueta   TEXT NOT NULL,
  orden      INT  NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.catalogo_discapacidad IS
  'Etiquetas estandarizadas de tipos de discapacidad o líneas de atención para formularios y filtros.';

CREATE INDEX IF NOT EXISTS idx_catalogo_discapacidad_orden ON public.catalogo_discapacidad (orden);

INSERT INTO public.catalogo_discapacidad (slug, etiqueta, orden) VALUES
  ('fisica_motora',     'Discapacidad física / motriz',           10),
  ('visual',            'Discapacidad visual',                     20),
  ('auditiva',          'Discapacidad auditiva',                   30),
  ('intelectual',       'Discapacidad intelectual',                40),
  ('psicosocial',       'Discapacidad psicosocial',               50),
  ('multiple',          'Discapacidad múltiple',                  60),
  ('sordoceguera',      'Sordoceguera',                           70),
  ('otras',             'Otras / condiciones relacionadas',        90)
ON CONFLICT (slug) DO NOTHING;

-- ----- Puentes
CREATE TABLE IF NOT EXISTS public.institucion_servicio (
  institucion_id UUID NOT NULL REFERENCES public.instituciones (id) ON DELETE CASCADE,
  servicio_id    UUID NOT NULL REFERENCES public.servicio_oferta (id) ON DELETE RESTRICT,
  PRIMARY KEY (institucion_id, servicio_id)
);

COMMENT ON TABLE public.institucion_servicio IS
  'Marcación de uno o más servicios estandarizados por institución.';

CREATE INDEX IF NOT EXISTS idx_institucion_servicio_servicio ON public.institucion_servicio (servicio_id);

CREATE TABLE IF NOT EXISTS public.institucion_discapacidad (
  institucion_id         UUID NOT NULL REFERENCES public.instituciones (id) ON DELETE CASCADE,
  tipo_discapacidad_id   UUID NOT NULL REFERENCES public.catalogo_discapacidad (id) ON DELETE RESTRICT,
  PRIMARY KEY (institucion_id, tipo_discapacidad_id)
);

COMMENT ON TABLE public.institucion_discapacidad IS
  'Marcación estandarizada de tipos de discapacidad atendidos por la institución.';

CREATE INDEX IF NOT EXISTS idx_institucion_disc_tipo ON public.institucion_discapacidad (tipo_discapacidad_id);

-- =====================================================================
-- VISTAS del mapa: srv_cats, srv_slugs, disc_slugs, discs (prioriza puente discap.)
-- =====================================================================
-- PostgreSQL: CREATE OR REPLACE VIEW no permite insertar columnas en medio de la
-- lista respecto a la vista anterior (error 42P16). Se eliminan y recrean.
DROP VIEW IF EXISTS public.v_mesa_orgs CASCADE;
DROP VIEW IF EXISTS public.v_cuid_orgs CASCADE;
DROP VIEW IF EXISTS public.v_disc_orgs CASCADE;

CREATE VIEW public.v_disc_orgs AS
SELECT
  i.id,
  i.nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(i.direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion) || ' · ' || trim(i.direccion_complemento)
    WHEN nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion)
    ELSE nullif(trim(coalesce(i.direccion_complemento, '')), '')
  END                  AS d,
  i.latitud            AS lat,
  i.longitud           AS lon,
  i.sin_sede           AS sin_sede,
  i.comuna             AS c,
  i.barrio,
  i.telefono           AS tel,
  i.email,
  i.pagina_web         AS web,
  i.servicios          AS srv,
  i.costo              AS cos,
  i.requisitos         AS req,
  i.cupos,
  i.cobertura,
  i.poblacion_objetivo AS poblacion,
  i.programa,
  i.tipo_organizacion,
  i.sector             AS sec,
  i.eje_pp_1           AS eje,
  i.dimension_pp       AS dim,
  i.nivel_relacionamiento_pp AS niv,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.institucion_discapacidad ix
      WHERE ix.institucion_id = i.id
    )
    THEN COALESCE(dx.disc_etiq, ARRAY[]::text[])
    ELSE COALESCE(i.tipos_discapacidad, ARRAY[]::text[])
  END AS discs,
  'discapacidad'::text AS tipo,
  COALESCE(ss.srv_cats, ARRAY[]::text[])     AS srv_cats,
  COALESCE(ss.srv_slugs, ARRAY[]::text[])    AS srv_slugs,
  COALESCE(dx.disc_slug, ARRAY[]::text[])    AS disc_slugs
FROM public.instituciones i
LEFT JOIN (
  SELECT
    ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT
    idi.institucion_id,
    array_agg(cd.etiqueta ORDER BY cd.orden) AS disc_etiq,
    array_agg(cd.slug ORDER BY cd.orden)     AS disc_slug
  FROM public.institucion_discapacidad idi
  JOIN public.catalogo_discapacidad cd ON cd.id = idi.tipo_discapacidad_id
  GROUP BY idi.institucion_id
) dx ON dx.institucion_id = i.id
WHERE i.categoria = 'discapacidad'::public.categoria_institucion;

CREATE VIEW public.v_cuid_orgs AS
SELECT
  i.id,
  i.nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(i.direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion) || ' · ' || trim(i.direccion_complemento)
    WHEN nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion)
    ELSE nullif(trim(coalesce(i.direccion_complemento, '')), '')
  END                  AS d,
  i.latitud            AS lat,
  i.longitud           AS lon,
  i.sin_sede           AS sin_sede,
  i.comuna             AS c,
  i.barrio,
  i.telefono           AS tel,
  i.email,
  i.pagina_web         AS web,
  i.servicios          AS srv,
  i.costo              AS cos,
  i.requisitos         AS req,
  i.cupos,
  i.cobertura,
  i.poblacion_objetivo AS poblacion,
  i.programa,
  i.tipo_organizacion,
  i.sector             AS sec,
  i.eje_pp_1           AS eje,
  i.dimension_pp       AS dim,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.institucion_discapacidad ix
      WHERE ix.institucion_id = i.id
    )
    THEN COALESCE(dx.disc_etiq, ARRAY[]::text[])
    ELSE COALESCE(i.tipos_discapacidad, ARRAY[]::text[])
  END AS discs,
  'cuidado'::text AS tipo,
  COALESCE(ss.srv_cats, ARRAY[]::text[])     AS srv_cats,
  COALESCE(ss.srv_slugs, ARRAY[]::text[])     AS srv_slugs,
  COALESCE(dx.disc_slug, ARRAY[]::text[])     AS disc_slugs
FROM public.instituciones i
LEFT JOIN (
  SELECT
    ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT
    idi.institucion_id,
    array_agg(cd.etiqueta ORDER BY cd.orden) AS disc_etiq,
    array_agg(cd.slug ORDER BY cd.orden)     AS disc_slug
  FROM public.institucion_discapacidad idi
  JOIN public.catalogo_discapacidad cd ON cd.id = idi.tipo_discapacidad_id
  GROUP BY idi.institucion_id
) dx ON dx.institucion_id = i.id
WHERE i.categoria = 'cuidado'::public.categoria_institucion;

CREATE VIEW public.v_mesa_orgs AS
SELECT
  i.id,
  i.nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(i.direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion) || ' · ' || trim(i.direccion_complemento)
    WHEN nullif(trim(coalesce(i.direccion, '')), '') IS NOT NULL
      THEN trim(i.direccion)
    ELSE nullif(trim(coalesce(i.direccion_complemento, '')), '')
  END                  AS d,
  i.latitud            AS lat,
  i.longitud           AS lon,
  i.sin_sede           AS sin_sede,
  i.comuna             AS c,
  i.barrio,
  i.telefono           AS tel,
  i.email,
  i.pagina_web         AS web,
  i.servicios          AS srv,
  i.costo              AS cos,
  i.requisitos         AS req,
  i.cupos,
  i.cobertura,
  i.poblacion_objetivo AS poblacion,
  i.programa,
  i.tipo_organizacion,
  i.sector             AS sec,
  i.eje_pp_1           AS eje,
  i.dimension_pp       AS dim,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.institucion_discapacidad ix
      WHERE ix.institucion_id = i.id
    )
    THEN COALESCE(dx.disc_etiq, ARRAY[]::text[])
    ELSE COALESCE(i.tipos_discapacidad, ARRAY[]::text[])
  END AS discs,
  'mesa'::text AS tipo,
  COALESCE(ss.srv_cats, ARRAY[]::text[])     AS srv_cats,
  COALESCE(ss.srv_slugs, ARRAY[]::text[])     AS srv_slugs,
  COALESCE(dx.disc_slug, ARRAY[]::text[])     AS disc_slugs
FROM public.instituciones i
LEFT JOIN (
  SELECT
    ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT
    idi.institucion_id,
    array_agg(cd.etiqueta ORDER BY cd.orden) AS disc_etiq,
    array_agg(cd.slug ORDER BY cd.orden)     AS disc_slug
  FROM public.institucion_discapacidad idi
  JOIN public.catalogo_discapacidad cd ON cd.id = idi.tipo_discapacidad_id
  GROUP BY idi.institucion_id
) dx ON dx.institucion_id = i.id
WHERE i.categoria = 'mesa'::public.categoria_institucion;

ALTER VIEW public.v_disc_orgs SET (security_invoker = on);
ALTER VIEW public.v_cuid_orgs SET (security_invoker = on);
ALTER VIEW public.v_mesa_orgs SET (security_invoker = on);
