-- Instituciones sin sede física: no se geolocalizan en el mapa; listado aparte en la UI.
-- Ejecutar en Supabase después de sql/10-unificar-coordenadas.sql

ALTER TABLE public.instituciones
  ADD COLUMN IF NOT EXISTS sin_sede BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.instituciones.sin_sede IS
  'Sin sede: comuna 17 - SIN SEDE FISICA, direccion SIN NOMENCLATURA. Fuera de Medellín: comuna 00 - FUERA DE MEDELLIN.';

-- Limpiar coords si quedaron marcadas sin sede (coherencia)
UPDATE public.instituciones
SET latitud = NULL, longitud = NULL
WHERE sin_sede = true AND (latitud IS NOT NULL OR longitud IS NOT NULL);

UPDATE public.instituciones
SET direccion = 'SIN NOMENCLATURA'
WHERE direccion = '00 - SIN NOMENCLATURA';

UPDATE public.instituciones
SET
  comuna = '17 - SIN SEDE FISICA',
  direccion = 'SIN NOMENCLATURA',
  direccion_complemento = NULL
WHERE sin_sede = true;

DROP VIEW IF EXISTS public.v_disc_orgs CASCADE;
DROP VIEW IF EXISTS public.v_cuid_orgs CASCADE;
DROP VIEW IF EXISTS public.v_mesa_orgs CASCADE;

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
  SELECT ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT idi.institucion_id,
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
  COALESCE(ss.srv_slugs, ARRAY[]::text[])    AS srv_slugs,
  COALESCE(dx.disc_slug, ARRAY[]::text[])    AS disc_slugs
FROM public.instituciones i
LEFT JOIN (
  SELECT ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT idi.institucion_id,
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
  COALESCE(ss.srv_slugs, ARRAY[]::text[])    AS srv_slugs,
  COALESCE(dx.disc_slug, ARRAY[]::text[])    AS disc_slugs
FROM public.instituciones i
LEFT JOIN (
  SELECT ins.institucion_id,
    array_agg(so.etiqueta ORDER BY so.orden) AS srv_cats,
    array_agg(so.slug ORDER BY so.orden) AS srv_slugs
  FROM public.institucion_servicio ins
  JOIN public.servicio_oferta so ON so.id = ins.servicio_id
  GROUP BY ins.institucion_id
) ss ON ss.institucion_id = i.id
LEFT JOIN (
  SELECT idi.institucion_id,
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
