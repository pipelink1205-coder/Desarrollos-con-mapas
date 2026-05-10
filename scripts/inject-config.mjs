// Genera js/config.js desde variables de entorno (build en Vercel o npm run build local).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

/** Quita comillas si alguien pegó el valor en Vercel con "..." incluido */
function stripQuotes(s) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

const url = stripQuotes(process.env.SUPABASE_URL);
const anon = stripQuotes(process.env.SUPABASE_ANON_KEY);

if (!url || !anon) {
  console.error('');
  console.error('Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.');
  console.error('  • Local: define .env o .env.local');
  console.error('  • Vercel: Project → Settings → Environment Variables');
  console.error('');
  process.exit(1);
}

try {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('protocolo inválido');
  }
} catch (e) {
  console.error('');
  console.error('SUPABASE_URL no es una URL válida (ej. https://xxxx.supabase.co).');
  console.error('Valor recibido (primeros 80 chars):', url.slice(0, 80));
  console.error('Detalle:', e.message || e);
  console.error('');
  process.exit(1);
}

if (!anon.startsWith('eyJ')) {
  console.warn('Advertencia: SUPABASE_ANON_KEY no parece un JWT de Supabase (debería empezar por eyJ).');
}

const out = path.join(ROOT, 'js', 'config.js');
const content = `/* Generado por scripts/inject-config.mjs — no editar en CI/producción */
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(anon)};
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, content, 'utf8');
console.log('inject-config: escrito', path.relative(ROOT, out));
