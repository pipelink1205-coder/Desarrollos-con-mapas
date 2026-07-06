// =====================================================================
//  FUNCIÓN SERVERLESS: crear / borrar usuarios
// =====================================================================
//  Esta función corre en el backend de Vercel (no en el navegador).
//  Solo aquí podemos usar la SUPABASE_SERVICE_ROLE_KEY de forma segura
//  para crear usuarios desde el panel de administración.
//
//  POST   /api/crear-usuario   → crea un usuario nuevo
//  DELETE /api/crear-usuario   → borra un usuario existente
//
//  Verifica que quien hace la petición sea un admin autenticado.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizarCedula(s) {
  return String(s || '').replace(/\D/g, '');
}

const DOMINIO_EMAIL_INTERNO = 'usuarios.mapa.epi';

function emailInternoDesdeCedula(cedulaDigits) {
  return `${cedulaDigits}@${DOMINIO_EMAIL_INTERNO}`;
}

function validarCedula(digits) {
  return digits && digits.length >= 5 && digits.length <= 12;
}

export default async function handler(req, res) {
  // Solo aceptamos POST y DELETE
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variables de entorno faltantes en el servidor' });
  }

  // ------- 1. Verificar quién está haciendo la petición -------
  const authHeader = req.headers.authorization || '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Falta token de autorización' });
  }

  // Cliente que valida el token contra Supabase Auth
  const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supaUser.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  // ------- 2. Verificar que sea ADMIN -------
  const { data: perfil, error: perfilError } = await supaUser
    .from('perfiles')
    .select('rol, activo')
    .eq('id', user.id)
    .single();

  if (perfilError || !perfil || perfil.rol !== 'super_admin' || !perfil.activo) {
    return res.status(403).json({ error: 'Solo el super administrador puede gestionar usuarios' });
  }

  // ------- 3. Cliente con service_role para acciones admin -------
  const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ============== CREAR USUARIO ==============
  if (req.method === 'POST') {
    let { email, password, nombre_completo, rol, activo, cedula } = req.body || {};

    email           = typeof email === 'string' ? email.trim().toLowerCase() : '';
    nombre_completo = typeof nombre_completo === 'string' ? nombre_completo.trim() : '';
    if (!['admin', 'consulta'].includes(rol)) {
      return res.status(400).json({ error: 'Rol inválido al crear (consulta o administrador editor). Use editar para super administrador.' });
    }
    const cedulaDigits = normalizarCedula(cedula);

    if (!validarCedula(cedulaDigits)) {
      return res.status(400).json({ error: 'La cédula es obligatoria (5 a 12 dígitos). El usuario inicia sesión con ese número.' });
    }

    if (!email) {
      email = emailInternoDesdeCedula(cedulaDigits);
    }

    if (!password || !nombre_completo) {
      return res.status(400).json({ error: 'Faltan campos: password, nombre_completo' });
    }
    const minLen = rol === 'consulta' ? 5 : 8;
    if (password.length < minLen) {
      return res.status(400).json({
        error: rol === 'consulta'
          ? 'La contraseña debe tener al menos 5 caracteres (usuarios consulta)'
          : 'La contraseña debe tener al menos 8 caracteres (administradores)',
      });
    }

    const { data: existe } = await supaAdmin
      .from('perfiles')
      .select('id')
      .eq('cedula', cedulaDigits)
      .maybeSingle();
    if (existe) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese número de documento.' });
    }

    const user_metadata = {
      nombre_completo,
      rol,
      cedula: cedulaDigits,
    };

    const { data, error } = await supaAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // crea como confirmado, sin enviar correo
      user_metadata,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    await supaAdmin.from('perfiles').update({
      debe_cambiar_password: true,
      ...(activo === false ? { activo: false } : {}),
    }).eq('id', data.user.id);

    return res.status(200).json({
      ok: true,
      user_id: data.user.id,
      email: data.user.email,
      cedula: cedulaDigits,
      login_con: 'Use el número de documento y la contraseña temporal en la pantalla de inicio.',
    });
  }

  // ============== BORRAR USUARIO ==============
  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ error: 'Falta user_id' });
    }
    if (user_id === user.id) {
      return res.status(400).json({ error: 'No puedes borrarte a ti mismo' });
    }

    const { error } = await supaAdmin.auth.admin.deleteUser(user_id);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }
}
