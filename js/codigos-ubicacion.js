// Códigos estándar para reportes SQL y filtros (instituciones).

/** Texto descriptivo (sin prefijo numérico): no hay dirección para copiar. */
export const DIRECCION_SIN_NOMENCLATURA = 'SIN NOMENCLATURA';
/** Código 00 = territorio fuera del área de comunas de Medellín. */
export const CODIGO_COMUNA_FUERA_MEDELLIN = '00 - FUERA DE MEDELLIN';
export const CODIGO_COMUNA_SIN_SEDE_FISICA = '17 - SIN SEDE FISICA';

export const MED_BBOX = { latMin: 5.85, latMax: 6.65, lonMin: -76.05, lonMax: -75.25 };

const CODIGOS_COMUNA_REPORTE = new Set([
  CODIGO_COMUNA_FUERA_MEDELLIN.toUpperCase(),
  CODIGO_COMUNA_SIN_SEDE_FISICA.toUpperCase(),
  'SIN SEDE',
]);

export function esComunaCodigoReporte(s) {
  const t = String(s || '').trim().toUpperCase();
  if (!t) return false;
  if (CODIGOS_COMUNA_REPORTE.has(t)) return true;
  if (t.startsWith('00 -')) return true;
  if (t.includes('SIN SEDE FISICA')) return true;
  return false;
}

export function esDireccionSinNomenclatura(s) {
  const t = String(s || '').trim().toUpperCase();
  return t === DIRECCION_SIN_NOMENCLATURA.toUpperCase() || t === '00 - SIN NOMENCLATURA';
}

export function normalizarCoords(lat, lon) {
  let la = Number(lat);
  let lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (Math.abs(la) > 50 && Math.abs(lo) < 20) {
    const t = la; la = lo; lo = t;
  }
  if (lo > 70 && lo < 80) lo = -Math.abs(lo);
  return { lat: la, lon: lo };
}

export function coordenadasEnMedellin(lat, lon) {
  const n = normalizarCoords(lat, lon);
  if (!n) return false;
  if (Math.abs(n.lat) < 0.00001 && Math.abs(n.lon) < 0.00001) return false;
  return n.lat >= MED_BBOX.latMin && n.lat <= MED_BBOX.latMax
    && n.lon >= MED_BBOX.lonMin && n.lon <= MED_BBOX.lonMax;
}
