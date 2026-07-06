// =====================================================================
//  CLIENTE SUPABASE COMPARTIDO
// =====================================================================
//  Importa esto desde cualquier página del frontend.
//  Las variables SUPABASE_URL y SUPABASE_ANON_KEY las inyecta Vercel
//  en /js/config.js durante el build (ver vercel.json + scripts).
//
//  Para desarrollo local, ese mismo archivo se genera con `npm run dev`
//  o se crea manualmente copiando js/config.example.js a js/config.js.
// =====================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  alert('Configuración de Supabase faltante. Revisa js/config.js');
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ---------------------------------------------------------------------
//  Helpers de sesión
// ---------------------------------------------------------------------

export async function obtenerSesion() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function obtenerPerfil() {
  const session = await obtenerSesion();
  if (!session) return null;

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, rol, activo, debe_cambiar_password')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Error cargando perfil:', error);
    return null;
  }
  return { ...data, email: session.user.email };
}

export async function cerrarSesion() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}
