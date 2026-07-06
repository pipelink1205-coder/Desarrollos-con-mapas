// POST /api/reset-password-usuario — super_admin asigna contraseña temporal
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variables de entorno faltantes en el servidor' });
  }

  const authHeader = req.headers.authorization || '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Falta token de autorización' });
  }

  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supaUser.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const { data: perfil, error: perfilError } = await supaUser
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .single();

  if (perfilError || !perfil || perfil.rol !== 'super_admin' || !perfil.activo) {
    return res.status(403).json({ error: 'Solo el super administrador puede restablecer contraseñas' });
  }

  let { user_id, password } = req.body || {};
  if (!user_id || typeof password !== 'string') {
    return res.status(400).json({ error: 'Faltan user_id y password' });
  }
  password = password.trim();
  if (!password) {
    return res.status(400).json({ error: 'La contraseña temporal no puede estar vacía' });
  }
  if (user_id === user.id) {
    return res.status(400).json({ error: 'Use la pantalla «Cambiar contraseña» para su propia cuenta' });
  }

  const { data: target, error: targetErr } = await supaUser
    .from('perfiles')
    .select('rol')
    .eq('id', user_id)
    .single();

  if (targetErr || !target) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const minLen = target.rol === 'consulta' ? 5 : 8;
  if (password.length < minLen) {
    return res.status(400).json({
      error: target.rol === 'consulta'
        ? 'La contraseña temporal debe tener al menos 5 caracteres'
        : 'La contraseña temporal debe tener al menos 8 caracteres',
    });
  }

  const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: pwErr } = await supaAdmin.auth.admin.updateUserById(user_id, { password });
  if (pwErr) {
    return res.status(400).json({ error: pwErr.message });
  }

  const { error: flagErr } = await supaAdmin
    .from('perfiles')
    .update({ debe_cambiar_password: true })
    .eq('id', user_id);

  if (flagErr) {
    return res.status(500).json({ error: flagErr.message });
  }

  return res.status(200).json({ ok: true });
}
