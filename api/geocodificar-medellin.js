// =====================================================================
// GET /api/geocodificar-medellin?direccion=...
// POST /api/geocodificar-medellin  { "direccion": "..." }
// Proxy server-side → API oficial Planeación / Innovación Digital (Medellín).
// Evita CORS desde el navegador hacia medellin.gov.co
// =====================================================================

const API_BASE =
  'https://www.medellin.gov.co/statements/api/innovaciondigital/geocodificacion/';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const raw =
    req.method === 'GET'
      ? req.query?.direccion
      : req.body?.direccion;

  const direccion = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
  if (direccion.length < 3) {
    return res.status(400).json({ error: 'Indica una dirección (mínimo 3 caracteres).' });
  }
  if (direccion.length > 220) {
    return res.status(400).json({ error: 'Dirección demasiado larga.' });
  }

  const url = API_BASE + encodeURIComponent(direccion);

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MapaOfertaEPI/1.0',
      },
    });

    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return res.status(502).json({
        error: 'La API de la Alcaldía devolvió una respuesta no válida.',
      });
    }

    if (!resp.ok) {
      return res.status(resp.status >= 400 ? resp.status : 502).json({
        error: 'La API de geocodificación de Medellín no respondió correctamente.',
        status: resp.status,
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      error: `No se pudo contactar la API de Medellín: ${e.message || e}`,
    });
  }
}
