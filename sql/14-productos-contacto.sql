-- Contacto estructurado en productos (persona, teléfonos, correo, web).
-- Ejecutar en Supabase SQL Editor después de 12 (o 07 si aún no tienes ubicación).

ALTER TABLE public.productos_apoyo
  ADD COLUMN IF NOT EXISTS contacto_persona TEXT,
  ADD COLUMN IF NOT EXISTS telefono         TEXT,
  ADD COLUMN IF NOT EXISTS email            TEXT,
  ADD COLUMN IF NOT EXISTS pagina_web       TEXT;

COMMENT ON COLUMN public.productos_apoyo.contacto_persona IS 'Nombre o cargo de la persona de contacto.';
COMMENT ON COLUMN public.productos_apoyo.telefono IS 'Uno o más teléfonos (separados por salto de línea en la app).';
COMMENT ON COLUMN public.productos_apoyo.email IS 'Correo de contacto del proveedor.';
COMMENT ON COLUMN public.productos_apoyo.pagina_web IS 'URL del sitio web del proveedor.';
COMMENT ON COLUMN public.productos_apoyo.contacto IS 'Campo legado (texto libre); preferir columnas nuevas.';

DROP VIEW IF EXISTS public.v_productos;
CREATE VIEW public.v_productos AS
SELECT
  p.id,
  p.categoria             AS cat,
  NULL::text              AS cat_slug,
  p.proveedor             AS prov,
  p.oferta,
  p.contacto_persona,
  p.telefono              AS tel,
  p.email,
  p.pagina_web            AS web,
  p.contacto,
  p.direccion             AS d,
  p.direccion_complemento AS d_compl,
  p.comuna                AS c,
  p.barrio,
  p.latitud               AS lat,
  p.longitud              AS lon
FROM public.productos_apoyo p;

ALTER VIEW public.v_productos SET (security_invoker = on);
