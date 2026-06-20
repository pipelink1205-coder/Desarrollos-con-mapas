// Servidor local: archivos estáticos + /api/* (mismo código que en Vercel).
// Carga variables desde .env.local y .env (igual que los scripts de migración).
// Uso: npm run dev:local  →  http://localhost:3000

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

const PREFERRED_PORT = Number(process.env.PORT) || 3000;

/** Busca un puerto libre desde el preferido (varios intentos si 3000 está ocupado). */
function findFirstFreePort(start) {
  return new Promise((resolve, reject) => {
    let port = start;
    const max = start + 40;
    const probe = () => {
      if (port > max) {
        reject(new Error(`No hay puerto libre entre ${start} y ${max}. Cierra otros servidores o define PORT=3333.`));
        return;
      }
      const t = net.createServer();
      t.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`  ⚠ Puerto ${port} ocupado → probando ${port + 1}…`);
          port++;
          probe();
        } else {
          reject(err);
        }
      });
      t.once('listening', () => {
        t.close(() => resolve(port));
      });
      t.listen(port);
    };
    probe();
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

function resJsonChain(nodeRes) {
  return {
    status(code) {
      nodeRes.statusCode = code;
      return {
        json(body) {
          nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
          nodeRes.end(JSON.stringify(body));
        },
      };
    },
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeFilePath(root, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const rel = p.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel));
  const rootNorm = path.normalize(root + path.sep);
  if (!full.startsWith(rootNorm) && full !== path.normalize(root)) return null;
  return full;
}

async function serveStatic(nodeRes, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    nodeRes.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    nodeRes.end(data);
  } catch {
    nodeRes.statusCode = 404;
    nodeRes.end('Not found');
  }
}

const server = http.createServer(async (req, nodeRes) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.replace(/^\/api\//, '').replace(/\.js$/, '');
    if (!/^[a-z0-9-]+$/i.test(name)) {
      nodeRes.statusCode = 400;
      nodeRes.end('Bad path');
      return;
    }
    const modPath = path.join(ROOT, 'api', `${name}.js`);
    let handler;
    try {
      const mod = await import(pathToFileURL(modPath).href);
      handler = mod.default;
    } catch (e) {
      console.error('[api] No se pudo cargar', modPath, e.message);
      const res = resJsonChain(nodeRes);
      return res.status(500).json({ error: 'Error cargando la función API' });
    }
    const fakeReq = {
      method: req.method,
      headers: req.headers,
      body: await readBody(req),
      query: Object.fromEntries(url.searchParams),
    };
    const fakeRes = resJsonChain(nodeRes);
    try {
      await handler(fakeReq, fakeRes);
    } catch (e) {
      console.error('[api]', e);
      if (!nodeRes.writableEnded) {
        nodeRes.statusCode = 500;
        nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
        nodeRes.end(JSON.stringify({ error: String(e.message || e) }));
      }
    }
    return;
  }

  const filePath = safeFilePath(ROOT, url.pathname);
  if (!filePath) {
    nodeRes.statusCode = 403;
    nodeRes.end('Forbidden');
    return;
  }
  try {
    await fs.access(filePath);
    await serveStatic(nodeRes, filePath);
  } catch {
    await serveStatic(nodeRes, path.join(ROOT, 'index.html'));
  }
});

server.on('error', (err) => {
  console.error('Error del servidor HTTP:', err.message);
  process.exit(1);
});

async function main() {
  let port;
  try {
    port = await findFirstFreePort(PREFERRED_PORT);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  server.listen(port, () => {
    console.log('');
    console.log('  Mapa oferta — local (API + estáticos)');
    console.log(`  → http://localhost:${port}`);
    if (port !== PREFERRED_PORT) {
      console.log(`  (El puerto ${PREFERRED_PORT} estaba ocupado.)`);
    }
    console.log('  Variables: .env.local / .env (SUPABASE_* para /api)');
    console.log('');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
