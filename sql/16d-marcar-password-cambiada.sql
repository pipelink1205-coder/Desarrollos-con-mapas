-- =====================================================================
-- Función RPC: marcar contraseña cambiada (evita bloqueo por RLS)
-- Ejecutar en Supabase SQL Editor si el login queda en bucle tras temporal.
-- =====================================================================

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
