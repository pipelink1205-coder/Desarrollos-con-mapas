-- =====================================================================
-- PASO 1 de 2 — Ejecutar SOLO este archivo primero (Run).
-- PostgreSQL exige confirmar el nuevo valor del enum antes de usarlo.
-- =====================================================================

ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'super_admin';
