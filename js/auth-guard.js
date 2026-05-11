// =====================================================================
//  GUARDIA DE SESIÓN
// =====================================================================
//  Llama a `requireAuth()` al inicio de cualquier página protegida.
//  Si no hay sesión, redirige a login. Si requiere rol admin y el
//  usuario no es admin, también redirige.
// =====================================================================

import { supabase, obtenerSesion, obtenerPerfil } from './supabase-client.js';

const AUTH_NAV_KEY = 'epi-auth-nav';

/** `index.html` guarda timestamp antes de ir a mapa/admin (login o sesión ya abierta). */
function shouldExtendAuthWait() {
  const raw = sessionStorage.getItem(AUTH_NAV_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || Date.now() - ts > 25000) {
    sessionStorage.removeItem(AUTH_NAV_KEY);
    return false;
  }
  return true;
}

/**
 * Tras redirigir desde el login, la sesión en localStorage puede llegar 1–2 ticks tarde.
 * Evitamos refreshSession() en bucle: con token recién guardado a veces empeora el estado.
 * Una llamada a getUser() puede hidratar la sesión contra el servidor si hace falta.
 */
async function esperarSesion(msTotal) {
  const t0 = Date.now();
  let i = 0;
  let getUserIntentado = false;
  await new Promise((r) => setTimeout(r, 0));
  while (Date.now() - t0 < msTotal) {
    const s = await obtenerSesion();
    if (s) return s;
    const elapsed = Date.now() - t0;
    if (!getUserIntentado && elapsed > 350) {
      getUserIntentado = true;
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        const s2 = await obtenerSesion();
        if (s2) return s2;
      }
    }
    await new Promise((r) => setTimeout(r, 60 + Math.min(i++, 28) * 45));
  }
  return null;
}

async function esperarPerfil(msTotal) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < msTotal) {
    const p = await obtenerPerfil();
    if (p) return p;
    await new Promise((r) => setTimeout(r, 90 + Math.min(i++, 28) * 55));
  }
  return null;
}

/**
 * Protege la página actual.
 * @param {Object} opciones
 * @param {boolean} opciones.requiereAdmin - Si true, solo deja entrar a admins.
 * @returns {Promise<{session, perfil}>} - Datos del usuario autenticado.
 */
export async function requireAuth({ requiereAdmin = false } = {}) {
  const extendido = shouldExtendAuthWait();
  const msSesion = extendido ? 12000 : 5000;
  const msPerfil = extendido ? 12000 : 5000;

  try {
    const session = await esperarSesion(msSesion);

    if (!session) {
      const destino = encodeURIComponent(window.location.pathname);
      window.location.href = `/index.html?next=${destino}`;
      return new Promise(() => {});
    }

    const perfil = await esperarPerfil(msPerfil);

    if (!perfil) {
      alert(
        'La sesión existe pero no se pudo cargar tu perfil.\n\n' +
        'Recarga la página (F5). Si sigue igual, revisa en Supabase que exista tu fila en la tabla «perfiles».'
      );
      window.location.href = '/index.html';
      return new Promise(() => {});
    }

    if (!perfil.activo) {
      alert('Tu cuenta está desactivada. Contacta al administrador.');
      window.location.href = '/index.html';
      return new Promise(() => {});
    }

    if (requiereAdmin && perfil.rol !== 'admin') {
      alert('No tienes permisos para acceder a esta página.');
      window.location.href = '/mapa.html';
      return new Promise(() => {});
    }

    return { session, perfil };
  } finally {
    sessionStorage.removeItem(AUTH_NAV_KEY);
  }
}
