-- =====================================================================
-- ESQUEMA DE LA BASE DE DATOS - MAPA DE OFERTA EPI
-- =====================================================================
-- Ejecuta este script en Supabase: Dashboard > SQL Editor > New query
-- Pegar todo el contenido y presionar "RUN".
-- =====================================================================

-- ----- LIMPIEZA (descomentar si necesitas reiniciar) -----
-- DROP TABLE IF EXISTS public.productos_apoyo CASCADE;
-- DROP TABLE IF EXISTS public.instituciones CASCADE;
-- DROP TABLE IF EXISTS public.perfiles CASCADE;
-- DROP TYPE IF EXISTS public.rol_usuario CASCADE;
-- DROP TYPE IF EXISTS public.categoria_institucion CASCADE;

-- ----- TIPOS ENUM -----

CREATE TYPE public.rol_usuario AS ENUM ('admin', 'consulta');

CREATE TYPE public.categoria_institucion AS ENUM (
  'discapacidad',
  'cuidado',
  'mesa'
);

-- =====================================================================
-- TABLA: perfiles
-- Información de cada usuario, ligada a auth.users de Supabase Auth.
-- =====================================================================

CREATE TABLE public.perfiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  cedula          TEXT,
  rol             public.rol_usuario NOT NULL DEFAULT 'consulta',
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_perfiles_cedula_unique ON public.perfiles (cedula) WHERE cedula IS NOT NULL;

COMMENT ON TABLE public.perfiles IS 'Datos extra del usuario, vinculados 1:1 con auth.users';

-- =====================================================================
-- TABLA: instituciones
-- Unifica las 3 ofertas que aparecen en el mapa: discapacidad, cuidado, mesa.
-- =====================================================================

CREATE TABLE public.instituciones (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria                   public.categoria_institucion NOT NULL,

  -- Identificación
  nombre                      TEXT NOT NULL,
  programa                    TEXT,
  tipo_organizacion           TEXT,
  sector                      TEXT,

  -- Ubicación
  direccion                   TEXT,
  direccion_contrastada       TEXT,
  distrito                    TEXT,
  otro_municipio              TEXT,
  comuna                      TEXT,
  barrio                      TEXT,
  latitud                     NUMERIC(10, 7),
  longitud                    NUMERIC(10, 7),
  latitud_verdadera           NUMERIC(10, 7),
  longitud_verdadera          NUMERIC(10, 7),

  -- Contacto
  telefono                    TEXT,
  email                       TEXT,
  pagina_web                  TEXT,
  contacto_persona            TEXT,

  -- Detalle de la oferta
  servicios                   TEXT,
  costo                       TEXT,
  requisitos                  TEXT,
  cupos                       TEXT,
  cobertura                   TEXT,
  poblacion_objetivo          TEXT,

  -- Política pública
  eje_pp_1                    TEXT,
  eje_pp_2                    TEXT,
  eje_pp_3                    TEXT,
  estrategia_pp_1             TEXT,
  estrategia_pp_2             TEXT,
  estrategia_pp_3             TEXT,
  dimension_pp                TEXT,
  nivel_relacionamiento_pp    TEXT,
  instancias_participacion    TEXT,

  -- Discapacidad (solo aplica a categoria='discapacidad')
  tipos_discapacidad          TEXT[],
  atiende_persona_discapacidad BOOLEAN,
  atiende_familia             BOOLEAN,
  atiende_publico_general     BOOLEAN,

  -- Auditoría
  fecha_actualizacion_dato    DATE,
  observacion_actualizacion   TEXT,
  creado_por                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_por             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.instituciones IS 'Instituciones/organizaciones de oferta de discapacidad, cuidado y mesas de cuidado';

CREATE INDEX idx_instituciones_categoria ON public.instituciones(categoria);
CREATE INDEX idx_instituciones_comuna    ON public.instituciones(comuna);
CREATE INDEX idx_instituciones_geo       ON public.instituciones(latitud, longitud)
  WHERE latitud IS NOT NULL AND longitud IS NOT NULL;

-- =====================================================================
-- TABLA: productos_apoyo
-- Productos y ayudas técnicas (categoría aparte, no tiene geolocalización).
-- =====================================================================

CREATE TABLE public.productos_apoyo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria       TEXT NOT NULL,
  proveedor       TEXT NOT NULL,
  oferta          TEXT,
  contacto        TEXT,
  creado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.productos_apoyo IS 'Productos de apoyo y ayudas técnicas';

CREATE INDEX idx_productos_apoyo_categoria ON public.productos_apoyo(categoria);

-- =====================================================================
-- TRIGGERS DE AUTO-ACTUALIZACIÓN
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_perfiles_actualizado
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

CREATE TRIGGER trg_instituciones_actualizado
  BEFORE UPDATE ON public.instituciones
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

CREATE TRIGGER trg_productos_apoyo_actualizado
  BEFORE UPDATE ON public.productos_apoyo
  FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

-- =====================================================================
-- TRIGGER: crear perfil automático cuando se crea un usuario en auth
-- =====================================================================
-- Cuando alguien se crea en auth.users (vía Supabase Auth o vía la
-- función serverless de admin), se inserta automáticamente un perfil.
-- El nombre y rol vienen de los metadatos del usuario.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre_completo, rol, cedula)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'rol')::public.rol_usuario, 'consulta'),
    NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'cedula', ''), '[^0-9]', '', 'g'), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- VISTAS DE COMPATIBILIDAD CON EL MAPA
-- =====================================================================
-- Estas vistas devuelven los datos en el mismo formato corto que usaba
-- el HTML original (n, d, lat, lon, c, etc.), para que el JavaScript
-- del mapa funcione sin reescribirlo.

CREATE OR REPLACE VIEW public.v_disc_orgs AS
SELECT
  id,
  nombre               AS n,
  direccion            AS d,
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
  direccion            AS d,
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
  direccion            AS d,
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

CREATE OR REPLACE VIEW public.v_productos AS
SELECT
  id,
  categoria      AS cat,
  proveedor      AS prov,
  oferta,
  contacto
FROM public.productos_apoyo;

-- =====================================================================
-- FUNCIÓN AUXILIAR: obtener rol del usuario actual
-- Se usa dentro de las políticas RLS.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid()
      AND rol = 'admin'
      AND activo = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
