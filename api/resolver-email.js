// =====================================================================
// POST /api/resolver-email  —  documento (cédula) → correo de auth
// =====================================================================
// Usado solo en el login cuando el usuario no escribe un correo.
// Requiere SUPABASE_SERVICE_ROLE_KEY (solo servidor).
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizarCedula(s) {
  return String(s || '').replace(/\D/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variables de entorno faltantes en el servidor' });
  }

  const identificador = req.body?.identificador;
  const digits        = normalizarCedula(identificador);

  if (digits.length < 5 || digits.length > 12) {
    return res.status(400).json({ error: 'Documento no válido.' });
  }

  const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil, error: qErr } = await supaAdmin
    .from('perfiles')
    .select('id')
    .eq('cedula', digits)
    .eq('activo', true)
    .maybeSingle();

  if (qErr || !perfil) {
    return res.status(404).json({ error: 'Sin cuenta asociada a ese documento.' });
  }

  const { data: authData, error: uErr } = await supaAdmin.auth.admin.getUserById(perfil.id);
  if (uErr || !authData?.user?.email) {
    return res.status(404).json({ error: 'Sin cuenta asociada a ese documento.' });
  }

  return res.status(200).json({ email: authData.user.email });
}
