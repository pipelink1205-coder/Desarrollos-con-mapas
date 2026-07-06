// Identificador de login por cédula (correo interno solo para Supabase Auth).

export const DOMINIO_EMAIL_INTERNO = 'usuarios.mapa.epi';

export function normalizarCedulaUsuario(s) {
  return String(s || '').replace(/\D/g, '');
}

export function validarCedulaUsuario(digits) {
  if (!digits || digits.length < 5 || digits.length > 12) {
    return 'La cédula debe tener entre 5 y 12 dígitos (solo números).';
  }
  return null;
}

export function emailInternoDesdeCedula(cedulaDigits) {
  return `${cedulaDigits}@${DOMINIO_EMAIL_INTERNO}`;
}

export function esEmailInternoUsuario(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DOMINIO_EMAIL_INTERNO}`);
}
