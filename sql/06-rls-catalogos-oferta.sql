-- =====================================================================
-- RLS para catálogos y tablas puente de oferta (tras 05-catalogos-oferta.sql)
-- Requisito: ejecutar 05 completo antes. Si ves 42P01 "servicio_oferta does not exist",
--             el 05 no creó las tablas (falló a medias o no se ejecutó este archivo).
-- =====================================================================

ALTER TABLE public.servicio_oferta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_discapacidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institucion_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institucion_discapacidad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer_servicio_oferta"           ON public.servicio_oferta;
DROP POLICY IF EXISTS "admin_muta_servicio_oferta"     ON public.servicio_oferta;
DROP POLICY IF EXISTS "leer_catalogo_discapacidad"     ON public.catalogo_discapacidad;
DROP POLICY IF EXISTS "admin_muta_catalogo_discapacidad" ON public.catalogo_discapacidad;
DROP POLICY IF EXISTS "leer_institucion_servicio"       ON public.institucion_servicio;
DROP POLICY IF EXISTS "admin_muta_institucion_servicio" ON public.institucion_servicio;
DROP POLICY IF EXISTS "leer_institucion_discapacidad"       ON public.institucion_discapacidad;
DROP POLICY IF EXISTS "admin_muta_institucion_discapacidad" ON public.institucion_discapacidad;

CREATE POLICY "leer_servicio_oferta"
  ON public.servicio_oferta FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "admin_muta_servicio_oferta"
  ON public.servicio_oferta FOR ALL
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "leer_catalogo_discapacidad"
  ON public.catalogo_discapacidad FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "admin_muta_catalogo_discapacidad"
  ON public.catalogo_discapacidad FOR ALL
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "leer_institucion_servicio"
  ON public.institucion_servicio FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "admin_muta_institucion_servicio"
  ON public.institucion_servicio FOR ALL
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "leer_institucion_discapacidad"
  ON public.institucion_discapacidad FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "admin_muta_institucion_discapacidad"
  ON public.institucion_discapacidad FOR ALL
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());
