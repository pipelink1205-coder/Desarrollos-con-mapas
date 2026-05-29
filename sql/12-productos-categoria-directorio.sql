-- Usar solo productos_apoyo.categoria (valores del CSV / directorio), no catalogo_producto_apoyo.
-- Ejecutar si ya corriste sql/07 y el Admin mostraba categorías tipo Movilidad, Auditivo, etc.

UPDATE public.productos_apoyo
SET catalogo_producto_id = NULL
WHERE catalogo_producto_id IS NOT NULL;

DROP VIEW IF EXISTS public.v_productos;
CREATE VIEW public.v_productos AS
SELECT
  p.id,
  p.categoria                        AS cat,
  NULL::text                         AS cat_slug,
  p.proveedor                        AS prov,
  p.oferta,
  p.contacto_persona,
  p.telefono                         AS tel,
  p.email,
  p.pagina_web                       AS web,
  p.contacto,
  p.direccion                        AS d,
  p.direccion_complemento            AS d_compl,
  p.comuna                           AS c,
  p.barrio,
  p.latitud                          AS lat,
  p.longitud                         AS lon
FROM public.productos_apoyo p;

ALTER VIEW public.v_productos SET (security_invoker = on);
