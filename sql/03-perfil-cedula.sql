-- =====================================================================
-- MIGRACIÓN: cédula en perfiles + trigger con metadato cedula
-- =====================================================================
-- Ejecutar en Supabase SQL Editor si ya tenías la BD sin esta columna.
-- =====================================================================

ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS cedula TEXT;

DROP INDEX IF EXISTS idx_perfiles_cedula_unique;
CREATE UNIQUE INDEX idx_perfiles_cedula_unique ON public.perfiles (cedula) WHERE cedula IS NOT NULL;

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
