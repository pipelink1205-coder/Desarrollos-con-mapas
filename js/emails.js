// Utilidades para varios correos en un solo campo TEXT (separador: salto de línea).

const EMAIL_STORE_SEP = '\n';

/** Parte una cadena guardada en uno o más correos. */
export function parseEmails(raw) {
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
  if (/\s/.test(s) && s.includes('@')) {
    const bits = s.split(/\s+/).map((t) => t.trim()).filter((t) => t.includes('@'));
    if (bits.length > 1) return bits;
  }
  return s.includes('@') ? [s] : [];
}

/** Serializa para guardar en BD. */
export function serializarEmails(lista) {
  const mails = (lista || []).map((t) => String(t).trim()).filter(Boolean);
  return mails.length ? mails.join(EMAIL_STORE_SEP) : null;
}

/** Texto legible en tablas (admin). */
export function textoEmails(raw) {
  const mails = parseEmails(raw);
  return mails.length ? mails.join(' · ') : '';
}
