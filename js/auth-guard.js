// =====================================================================
//  GUARDIA DE SESIÓN
// =====================================================================
//  Llama a `requireAuth()` al inicio de cualquier página protegida.
//  Si no hay sesión, redirige a login. Si requiere rol admin y el
//  usuario no es admin, también redirige.
// =====================================================================

import { supabase, obtenerSesion, obtenerPerfil } from './supabase-client.js';

/** Tras redirigir desde el login, la sesión en disco a veces llega un instante después. */
async function esperarSesion(msTotal = 2800) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < msTotal) {
    const s = await obtenerSesion();
    if (s) return s;
    await supabase.auth.refreshSession().catch(() => {});
    await new Promise(r => setTimeout(r, 70 + i++ * 55));
  }
  return null;
}

async function esperarPerfil(msTotal = 3200) {
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < msTotal) {
    const p = await obtenerPerfil();
    if (p) return p;
    await new Promise(r => setTimeout(r, 90 + i++ * 60));
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
  const session = await esperarSesion();

  if (!session) {
    const destino = encodeURIComponent(window.location.pathname);
    window.location.href = `/index.html?next=${destino}`;
    return new Promise(() => {});
  }

  const perfil = await esperarPerfil();

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
}
