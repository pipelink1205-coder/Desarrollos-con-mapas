-- =====================================================================
-- Restaurar acceso — sistemas1.epi@gmail.com (u otro super admin)
-- Ejecutar en Supabase SQL Editor (como postgres, sin RLS).
-- =====================================================================

-- 1) Ver estado actual (revisa el resultado antes de actualizar)
SELECT
  u.id,
  u.email,
  p.nombre_completo,
  p.rol,
  p.activo,
  p.debe_cambiar_password
FROM auth.users u
LEFT JOIN public.perfiles p ON p.id = u.id
WHERE lower(u.email) = lower('sistemas1.epi@gmail.com');

-- 2) Restaurar super administrador y quitar bloqueo de contraseña temporal
UPDATE public.perfiles
SET
  rol = 'super_admin'::public.rol_usuario,
  activo = TRUE,
  debe_cambiar_password = FALSE
WHERE id = (
  SELECT id FROM auth.users WHERE lower(email) = lower('sistemas1.epi@gmail.com')
);

-- 3) Política de actualización del propio perfil (p. ej. al cambiar contraseña)
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

-- 4) Confirmar
SELECT u.email, p.rol, p.activo, p.debe_cambiar_password
FROM auth.users u
JOIN public.perfiles p ON p.id = u.id
WHERE lower(u.email) = lower('sistemas1.epi@gmail.com');
