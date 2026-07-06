-- =====================================================================
-- PASO 2 de 2 — Super administrador y contraseña temporal
-- Ejecutar DESPUÉS de 16a-super-admin-enum.sql (en una segunda ejecución).
-- =====================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.perfiles.debe_cambiar_password IS
  'TRUE: al iniciar sesión debe elegir contraseña nueva (tras temporal asignada por super admin).';

-- Administrador de datos = admin | super_admin
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid()
      AND rol IN ('admin', 'super_admin')
      AND activo = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.es_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid()
      AND rol = 'super_admin'
      AND activo = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Compatibilidad: quien era admin pasa a super_admin (gestión de usuarios)
UPDATE public.perfiles
SET rol = 'super_admin'::public.rol_usuario
WHERE rol = 'admin'::public.rol_usuario;

-- Políticas perfiles: solo super_admin lista/edita/borra otros usuarios
DROP POLICY IF EXISTS "admin_lee_todos_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "admin_actualiza_perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "admin_borra_perfiles" ON public.perfiles;

CREATE POLICY "super_admin_lee_todos_perfiles"
  ON public.perfiles FOR SELECT
  TO authenticated
  USING (public.es_super_admin());

CREATE POLICY "super_admin_actualiza_perfiles"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (public.es_super_admin())
  WITH CHECK (public.es_super_admin());

CREATE POLICY "super_admin_borra_perfiles"
  ON public.perfiles FOR DELETE
  TO authenticated
  USING (public.es_super_admin());

-- Actualización del propio perfil (p. ej. debe_cambiar_password tras cambiar contraseña)
CREATE OR REPLACE FUNCTION public.mi_rol_usuario()
RETURNS public.rol_usuario AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "actualizar_propio_perfil" ON public.perfiles;

CREATE POLICY "actualizar_propio_perfil"
  ON public.perfiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND rol = public.mi_rol_usuario()
  );

-- RPC: quitar flag debe_cambiar_password tras cambio (evita bucle de login)
CREATE OR REPLACE FUNCTION public.marcar_password_cambiada()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.perfiles
  SET debe_cambiar_password = FALSE
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_password_cambiada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_password_cambiada() TO authenticated;
