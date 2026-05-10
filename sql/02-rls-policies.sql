-- =====================================================================
-- POLÍTICAS DE SEGURIDAD (Row Level Security)
-- =====================================================================
-- Ejecuta este script DESPUÉS de 01-schema.sql.
-- Define quién puede leer, crear, editar y borrar cada tabla.
-- =====================================================================
--
-- REGLAS DE NEGOCIO:
--   * Cualquier usuario AUTENTICADO (admin o consulta) puede LEER todo.
--   * Solo usuarios con rol 'admin' pueden CREAR, EDITAR y BORRAR.
--   * Cada usuario puede leer y editar SU PROPIO perfil.
--   * Solo admins pueden ver/editar perfiles de otros usuarios.
--   * Los usuarios anónimos (sin login) no pueden leer NADA.
-- =====================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.perfiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instituciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos_apoyo  ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- PERFILES
-- =====================================================================

DROP POLICY IF EXISTS "leer_propio_perfil"      ON public.perfiles;
DROP POLICY IF EXISTS "admin_lee_todos_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "actualizar_propio_perfil" ON public.perfiles;
DROP POLICY IF EXISTS "admin_actualiza_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "admin_borra_perfiles"     ON public.perfiles;

-- Cualquier usuario autenticado puede leer su propio perfil
CREATE POLICY "leer_propio_perfil"
  ON public.perfiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Los admins pueden leer todos los perfiles
CREATE POLICY "admin_lee_todos_perfiles"
  ON public.perfiles FOR SELECT
  TO authenticated
  USING (public.es_admin());

-- Cada usuario puede actualizar SU propio perfil (pero NO cambiar su propio rol)
CREATE POLICY "actualizar_propio_perfil"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND rol = (SELECT rol FROM public.perfiles WHERE id = auth.uid())
  );

-- Los admins pueden actualizar cualquier perfil (incluido el rol)
CREATE POLICY "admin_actualiza_perfiles"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

-- Los admins pueden borrar perfiles
CREATE POLICY "admin_borra_perfiles"
  ON public.perfiles FOR DELETE
  TO authenticated
  USING (public.es_admin());

-- INSERT en perfiles solo lo hace el trigger handle_new_user (SECURITY DEFINER),
-- así que no necesitamos política de INSERT directa.

-- =====================================================================
-- INSTITUCIONES
-- =====================================================================

DROP POLICY IF EXISTS "leer_instituciones"      ON public.instituciones;
DROP POLICY IF EXISTS "admin_crea_instituciones" ON public.instituciones;
DROP POLICY IF EXISTS "admin_edita_instituciones" ON public.instituciones;
DROP POLICY IF EXISTS "admin_borra_instituciones" ON public.instituciones;

-- Cualquier usuario autenticado puede leer todas las instituciones
CREATE POLICY "leer_instituciones"
  ON public.instituciones FOR SELECT
  TO authenticated
  USING (TRUE);

-- Solo admins pueden crear
CREATE POLICY "admin_crea_instituciones"
  ON public.instituciones FOR INSERT
  TO authenticated
  WITH CHECK (public.es_admin());

-- Solo admins pueden editar
CREATE POLICY "admin_edita_instituciones"
  ON public.instituciones FOR UPDATE
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

-- Solo admins pueden borrar
CREATE POLICY "admin_borra_instituciones"
  ON public.instituciones FOR DELETE
  TO authenticated
  USING (public.es_admin());

-- =====================================================================
-- PRODUCTOS DE APOYO
-- =====================================================================

DROP POLICY IF EXISTS "leer_productos"       ON public.productos_apoyo;
DROP POLICY IF EXISTS "admin_crea_productos"  ON public.productos_apoyo;
DROP POLICY IF EXISTS "admin_edita_productos" ON public.productos_apoyo;
DROP POLICY IF EXISTS "admin_borra_productos" ON public.productos_apoyo;

CREATE POLICY "leer_productos"
  ON public.productos_apoyo FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "admin_crea_productos"
  ON public.productos_apoyo FOR INSERT
  TO authenticated
  WITH CHECK (public.es_admin());

CREATE POLICY "admin_edita_productos"
  ON public.productos_apoyo FOR UPDATE
  TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

CREATE POLICY "admin_borra_productos"
  ON public.productos_apoyo FOR DELETE
  TO authenticated
  USING (public.es_admin());

-- =====================================================================
-- VISTAS: heredan el RLS de la tabla base (instituciones)
-- No necesitan políticas propias porque corren con los permisos del invoker.
-- =====================================================================

-- Asegurar que las vistas usen los permisos del invocador (no del creador)
ALTER VIEW public.v_disc_orgs SET (security_invoker = on);
ALTER VIEW public.v_cuid_orgs SET (security_invoker = on);
ALTER VIEW public.v_mesa_orgs SET (security_invoker = on);
ALTER VIEW public.v_productos SET (security_invoker = on);
