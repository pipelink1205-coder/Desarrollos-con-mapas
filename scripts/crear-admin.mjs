// =====================================================================
//  SCRIPT: crear el primer usuario administrador
// =====================================================================
//  Uso:
//    1. Asegurate de tener tu .env.local lleno con ADMIN_EMAIL,
//       ADMIN_PASSWORD, ADMIN_NOMBRE, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
//    2. Desde la carpeta del proyecto, en la terminal:
//         npm run crear-admin
// =====================================================================

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });

const url     = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email   = process.env.ADMIN_EMAIL;
const pass    = process.env.ADMIN_PASSWORD;
const nombre  = process.env.ADMIN_NOMBRE;

if (!url || !service || !email || !pass || !nombre) {
  console.error('Faltan variables. Revisa tu .env.local:');
  console.error('  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,');
  console.error('  ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE');
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Creando administrador: ${email} (${nombre})…`);

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: pass,
  email_confirm: true,
  user_metadata: {
    nombre_completo: nombre,
    rol: 'admin',
  },
});

if (error) {
  if (error.message.includes('already been registered')) {
    console.log(`El correo ${email} ya existe. Promoviendo a admin…`);

    const { data: existing } = await supabase.auth.admin.listUsers();
    const u = existing.users.find(x => x.email === email);
    if (!u) {
      console.error('No se encontró el usuario para promoverlo.');
      process.exit(1);
    }

    const { error: updErr } = await supabase
      .from('perfiles')
      .update({ rol: 'admin', activo: true, nombre_completo: nombre })
      .eq('id', u.id);

    if (updErr) {
      console.error('Error promoviendo:', updErr.message);
      process.exit(1);
    }
    console.log(`Usuario ${email} ahora es admin.`);
    process.exit(0);
  }

  console.error('Error creando usuario:', error.message);
  process.exit(1);
}

console.log('');
console.log('===================================================');
console.log('Administrador creado correctamente');
console.log('===================================================');
console.log(`  Correo:     ${email}`);
console.log(`  Contraseña: ${pass}`);
console.log(`  Nombre:     ${nombre}`);
console.log(`  ID:         ${data.user.id}`);
console.log('===================================================');
console.log('Ahora puedes ingresar al sistema con esas credenciales.');
