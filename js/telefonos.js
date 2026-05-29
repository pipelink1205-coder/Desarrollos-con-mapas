// Utilidades para varios teléfonos en un solo campo TEXT (separador: salto de línea).

const TEL_STORE_SEP = '\n';

/** Parte una cadena guardada en uno o más números. */
export function parseTelefonos(raw) {
  if (raw == null || raw === '' || String(raw).trim() === '' || raw === 'nan') return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch (_) { /* legacy */ }
  }
  if (s.includes('\n')) {
    return s.split('\n').map((t) => t.trim()).filter(Boolean);
  }
  if (s.includes('|')) {
    return s.split('|').map((t) => t.trim()).filter(Boolean);
  }
  if (/[;,]/.test(s)) {
    return s.split(/[;,]+/).map((t) => t.trim()).filter(Boolean);
  }
  const legacy = partirTelefonosPegados(s);
  return legacy.length ? legacy : [s];
}

/** Intenta separar varios números pegados solo con espacios (datos antiguos). */
function partirTelefonosPegados(s) {
  const re = /(?<=\d)\s+(?=(?:604|60[0-9]|[34]\d{2})\s*\d)/g;
  const bits = s.split(re).map((t) => t.trim()).filter(Boolean);
  if (bits.length > 1) return bits;
  return [s];
}

/** Serializa para guardar en BD. */
export function serializarTelefonos(lista) {
  const nums = (lista || []).map((t) => String(t).trim()).filter(Boolean);
  return nums.length ? nums.join(TEL_STORE_SEP) : null;
}

/** Texto legible en tablas (admin). */
export function textoTelefonos(raw) {
  const nums = parseTelefonos(raw);
  return nums.length ? nums.join(' · ') : '';
}
