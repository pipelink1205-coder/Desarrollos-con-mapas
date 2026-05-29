-- =====================================================================
-- RLS: catálogo de productos (lectura autenticada; escritura solo admin)
-- Ejecutar DESPUÉS de 07-productos-ubicacion-catalogo.sql
-- =====================================================================

ALTER TABLE public.catalogo_producto_apoyo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leer_catalogo_producto" ON public.catalogo_producto_apoyo;
DROP POLICY IF EXISTS "admin_escribe_catalogo_producto" ON public.catalogo_producto_apoyo;

CREATE POLICY "leer_catalogo_producto"
  ON public.catalogo_producto_apoyo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_escribe_catalogo_producto"
  ON public.catalogo_producto_apoyo FOR ALL
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());
