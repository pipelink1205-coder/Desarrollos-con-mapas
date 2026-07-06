-- =====================================================================
-- Rellenar cédula en perfiles (usuarios viejos creados solo con documento)
-- Útil si el correo en auth.users era solo números, p. ej. 1037654321@...
-- Revisar el SELECT antes de ejecutar el UPDATE.
-- =====================================================================

SELECT
  u.email,
  p.nombre_completo,
  p.cedula AS cedula_actual,
  regexp_replace(split_part(u.email, '@', 1), '[^0-9]', '', 'g') AS cedula_desde_email
FROM auth.users u
JOIN public.perfiles p ON p.id = u.id
WHERE (p.cedula IS NULL OR btrim(p.cedula) = '')
  AND length(regexp_replace(split_part(u.email, '@', 1), '[^0-9]', '', 'g')) BETWEEN 5 AND 12;

UPDATE public.perfiles p
SET cedula = regexp_replace(split_part(u.email, '@', 1), '[^0-9]', '', 'g')
FROM auth.users u
WHERE p.id = u.id
  AND (p.cedula IS NULL OR btrim(p.cedula) = '')
  AND length(regexp_replace(split_part(u.email, '@', 1), '[^0-9]', '', 'g')) BETWEEN 5 AND 12;
