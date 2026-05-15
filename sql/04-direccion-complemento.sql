-- =====================================================================
-- MIGRACIÓN: complemento de dirección (apto, torre, oficina, etc.)
-- Ejecutar en Supabase SQL Editor si la base ya existía sin esta columna.
-- =====================================================================

ALTER TABLE public.instituciones
  ADD COLUMN IF NOT EXISTS direccion_complemento TEXT;

COMMENT ON COLUMN public.instituciones.direccion_complemento IS
  'Detalle adicional de ubicación; en el mapa se concatena con dirección en el campo d de las vistas.';

-- Vistas del mapa: `d` = dirección + complemento (separador " · ")
CREATE OR REPLACE VIEW public.v_disc_orgs AS
SELECT
  id,
  nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion) || ' · ' || trim(direccion_complemento)
    WHEN nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion)
    ELSE nullif(trim(coalesce(direccion_complemento, '')), '')
  END                  AS d,
  COALESCE(latitud_verdadera, latitud)   AS lat,
  COALESCE(longitud_verdadera, longitud) AS lon,
  comuna               AS c,
  barrio,
  telefono             AS tel,
  email,
  servicios            AS srv,
  costo                AS cos,
  requisitos           AS req,
  cupos,
  cobertura,
  poblacion_objetivo   AS poblacion,
  programa,
  tipo_organizacion,
  sector               AS sec,
  eje_pp_1             AS eje,
  dimension_pp         AS dim,
  nivel_relacionamiento_pp AS niv,
  tipos_discapacidad   AS discs,
  'discapacidad'       AS tipo
FROM public.instituciones
WHERE categoria = 'discapacidad';

CREATE OR REPLACE VIEW public.v_cuid_orgs AS
SELECT
  id,
  nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion) || ' · ' || trim(direccion_complemento)
    WHEN nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion)
    ELSE nullif(trim(coalesce(direccion_complemento, '')), '')
  END                  AS d,
  COALESCE(latitud_verdadera, latitud)   AS lat,
  COALESCE(longitud_verdadera, longitud) AS lon,
  comuna               AS c,
  barrio,
  telefono             AS tel,
  email,
  servicios            AS srv,
  costo                AS cos,
  requisitos           AS req,
  cupos,
  cobertura,
  poblacion_objetivo   AS poblacion,
  programa,
  tipo_organizacion,
  sector               AS sec,
  eje_pp_1             AS eje,
  dimension_pp         AS dim,
  'cuidado'            AS tipo
FROM public.instituciones
WHERE categoria = 'cuidado';

CREATE OR REPLACE VIEW public.v_mesa_orgs AS
SELECT
  id,
  nombre               AS n,
  CASE
    WHEN nullif(trim(coalesce(direccion_complemento, '')), '') IS NOT NULL
         AND nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion) || ' · ' || trim(direccion_complemento)
    WHEN nullif(trim(coalesce(direccion, '')), '') IS NOT NULL
      THEN trim(direccion)
    ELSE nullif(trim(coalesce(direccion_complemento, '')), '')
  END                  AS d,
  COALESCE(latitud_verdadera, latitud)   AS lat,
  COALESCE(longitud_verdadera, longitud) AS lon,
  comuna               AS c,
  barrio,
  telefono             AS tel,
  email,
  servicios            AS srv,
  costo                AS cos,
  requisitos           AS req,
  cupos,
  cobertura,
  poblacion_objetivo   AS poblacion,
  programa,
  tipo_organizacion,
  sector               AS sec,
  eje_pp_1             AS eje,
  dimension_pp         AS dim,
  'mesa'               AS tipo
FROM public.instituciones
WHERE categoria = 'mesa';

ALTER VIEW public.v_disc_orgs SET (security_invoker = on);
ALTER VIEW public.v_cuid_orgs SET (security_invoker = on);
ALTER VIEW public.v_mesa_orgs SET (security_invoker = on);
