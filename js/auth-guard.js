// =====================================================================
//  GUARDIA DE SESIÓN
// =====================================================================
//  Llama a `requireAuth()` al inicio de cualquier página protegida.
//  Si no hay sesión, redirige a login. Si requiere rol admin y el
//  usuario no es admin, también redirige.
// =====================================================================

import { obtenerSesion, obtenerPerfil } from './supabase-client.js';

/**
 * Protege la página actual.
 * @param {Object} opciones
 * @param {boolean} opciones.requiereAdmin - Si true, solo deja entrar a admins.
 * @returns {Promise<{session, perfil}>} - Datos del usuario autenticado.
 */
export async function requireAuth({ requiereAdmin = false } = {}) {
  const session = await obtenerSesion();

  if (!session) {
    const destino = encodeURIComponent(window.location.pathname);
    window.location.href = `/index.html?next=${destino}`;
    return new Promise(() => {});
  }

  const perfil = await obtenerPerfil();

  if (!perfil || !perfil.activo) {
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
