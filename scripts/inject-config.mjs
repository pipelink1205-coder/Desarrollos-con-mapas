// Genera js/config.js desde variables de entorno (build en Vercel o npm run build local).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

const url = process.env.SUPABASE_URL?.trim();
const anon = process.env.SUPABASE_ANON_KEY?.trim();

if (!url || !anon) {
  console.error('');
  console.error('Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.');
  console.error('  • Local: define .env o .env.local');
  console.error('  • Vercel: Project → Settings → Environment Variables');
  console.error('');
  process.exit(1);
}

const out = path.join(ROOT, 'js', 'config.js');
const content = `/* Generado por scripts/inject-config.mjs — no editar en CI/producción */
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(anon)};
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, content, 'utf8');
console.log('inject-config: escrito', path.relative(ROOT, out));
