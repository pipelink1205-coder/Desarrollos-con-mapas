// =====================================================================
//  GEOCODIFICADOR — módulo independiente (Medellín, Colombia)
// =====================================================================
//  1) API oficial Alcaldía de Medellín (Planeación / catastro) vía /api/geocodificar-medellin
//  2) Respaldo: Esri World GeocodeServer
//  3) Respaldo: Nominatim (OSM)
//  Comuna → org_key desde comunas.geojson; barrio oficial desde catastro (Alcaldía).
// =====================================================================

/** @param {unknown} s */
function limpiar(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim();
  return t || null;
}

/** Añade contexto si el usuario no escribió ciudad/país. */
function conContextoMedellin(direccion) {
  const q = direccion.trim();
  if (!q) return '';
  const lower = q.toLowerCase();
  if (lower.includes('medellín') || lower.includes('medellin') || lower.includes('colombia')) {
    return q;
  }
  return `${q}, Medellín, Antioquia, Colombia`;
}

function confianzaDesdeScore(score) {
  if (score >= 90) return 'alta';
  if (score >= 70) return 'media';
  return 'baja';
}

/** @param {number} importance Nominatim 0..~1 */
function confianzaDesdeImportance(imp, cls, typ) {
  if (imp >= 0.62) return 'alta';
  if (imp >= 0.45 || (cls === 'place' && (typ === 'house' || typ === 'residential'))) return 'media';
  return 'baja';
}

// ---------------------------------------------------------------------
//  Catálogo oficial de comunas / corregimientos (comunas.geojson)
// ---------------------------------------------------------------------

/** Igual criterio que `claveComunaComparable` en mapa.html (para cruzar textos). */
function normalizeComparable(s) {
  if (!s) return '';
  let t = String(s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  t = t.replace(/[\u2013\u2014\u2212]/g, '-');
  t = t.replace(/\s*-\s*/g, ' - ');
  t = t.replace(/-/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** @type {{ features: import('geojson').Feature[]; rows: { numero: number, tipo: string, org_key: string, nombre: string, nombre_corto: string }[] } | null} */
let _comunasCache = null;

async function cargarComunasGeoJSON() {
  if (_comunasCache) return _comunasCache;
  try {
    const res = await fetch('/data/comunas.geojson', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const g = await res.json();
    const feats = g.features || [];
    const rows = feats.map((f) => {
      const p = f.properties || {};
      return {
        numero: Number(p.numero),
        tipo: String(p.tipo || ''),
        org_key: String(p.org_key || p.nombre || ''),
        nombre: String(p.nombre || ''),
        nombre_corto: String(p.nombre_corto || ''),
      };
    });
    _comunasCache = { features: feats, rows };
    return _comunasCache;
  } catch {
    return null;
  }
}

/** Punto en anillo GeoJSON [lon, lat]. */
function ringContains(lat, lon, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const denom = (yj - yi) || 1e-12;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < ((xj - xi) * (lat - yi)) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function geoContainsPoint(lat, lon, geometry) {
  if (!geometry || lat == null || lon == null) return false;
  const { type, coordinates } = geometry;
  if (type === 'Polygon') {
    if (!ringContains(lat, lon, coordinates[0])) return false;
    for (let h = 1; h < coordinates.length; h++) {
      if (ringContains(lat, lon, coordinates[h])) return false;
    }
    return true;
  }
  if (type === 'MultiPolygon') {
    return coordinates.some((poly) => {
      if (!ringContains(lat, lon, poly[0])) return false;
      for (let h = 1; h < poly.length; h++) {
        if (ringContains(lat, lon, poly[h])) return false;
      }
      return true;
    });
  }
  return false;
}

/**
 * Comuna/corregimiento oficial (org_key del GeoJSON) que contiene el punto.
 * @param {number} lat
 * @param {number} lon
 * @param {import('geojson').Feature[]} features
 */
function comunaPorPoligono(lat, lon, features) {
  if (!features?.length) return null;
  for (const f of features) {
    if (f.geometry && geoContainsPoint(lat, lon, f.geometry)) {
      const p = f.properties || {};
      return String(p.org_key || p.nombre || '') || null;
    }
  }
  return null;
}

/**
 * Número de comuna o corregimiento extraído del texto del geocodificador.
 * @param {string} texto
 */
function parseNumeroComunaOCorregimiento(texto) {
  const t = (texto || '').trim();
  if (!t) return null;
  let m = t.match(/(?:comuna|corregimiento)\s*0*(\d{1,3})\s*[-–]\s*/i);
  if (m) return parseInt(m[1], 10);
  m = t.match(/(?:comuna|corregimiento)\s+0*(\d{1,3})\b/i);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^0*(\d{1,3})\s*[-–]\s*/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^0*(\d{1,3})\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/**
 * Alinea texto del geocoder al `org_key` del GeoJSON (MAYÚSCULAS, "01 - POPULAR", etc.).
 * @param {string|null|undefined} raw
 * @param {{ numero: number, tipo: string, org_key: string, nombre: string, nombre_corto: string }[]} rows
 */
function normalizarComunaAlCatalogo(raw, rows) {
  const t = limpiar(raw);
  if (!t || !rows?.length) return null;

  const nk = normalizeComparable(t);
  for (const r of rows) {
    if (normalizeComparable(r.org_key) === nk) return r.org_key;
    if (normalizeComparable(r.nombre) === nk) return r.org_key;
  }

  const num = parseNumeroComunaOCorregimiento(t);
  if (num != null) {
    const hit = rows.find((r) => r.numero === num);
    if (hit) return hit.org_key;
  }

  const nkLoose = nk.replace(/^COMUNA\s+/, '');
  for (const r of rows) {
    if (r.nombre_corto && normalizeComparable(r.nombre_corto) === nkLoose) return r.org_key;
    const partOrg = normalizeComparable(r.org_key).replace(/^\d+\s+/, '');
    if (partOrg && nkLoose.includes(partOrg)) return r.org_key;
  }

  return null;
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {string|null} comunaRaw
 */
async function comunaOficialFinal(lat, lng, comunaRaw) {
  const ref = await cargarComunasGeoJSON();
  if (!ref?.features?.length) return limpiar(comunaRaw);

  const porPol = comunaPorPoligono(lat, lng, ref.features);
  if (porPol) return porPol;

  const cat = normalizarComunaAlCatalogo(comunaRaw, ref.rows);
  if (cat) return cat;

  return limpiar(comunaRaw);
}

// ---------------------------------------------------------------------
//  Nominatim: dirección estructurada
// ---------------------------------------------------------------------

/**
 * Interpreta el objeto `address` de Nominatim (search o reverse).
 * @param {Record<string, string>|null|undefined} addr
 * @returns {{ comuna: string|null, barrio: string|null }}
 */
function deNomAddress(addr) {
  if (!addr || typeof addr !== 'object') return { comuna: null, barrio: null };
  const ciudad = String(addr.city || addr.town || addr.municipality || '').toLowerCase();

  const okBarrio = (/** @type {string|null} */ x) => {
    const v = limpiar(x);
    if (!v) return null;
    const l = v.toLowerCase();
    if (l === ciudad || l === 'medellín' || l === 'medellin') return null;
    return v;
  };

  let barrio = okBarrio(addr.neighbourhood)
    || okBarrio(addr.quarter)
    || okBarrio(addr.hamlet);

  const suburb = limpiar(addr.suburb);
  if (!barrio && suburb) {
    if (!/comuna\s*\d+/i.test(suburb) && !/corregimiento/i.test(suburb)) {
      barrio = okBarrio(suburb);
    }
  }

  let comuna = null;
  const tryComuna = (/** @type {unknown} */ v) => {
    const s = limpiar(v);
    if (!s) return false;
    if (/comuna|corregimiento/i.test(s) || /^\d{1,2}\s*[-–]\s*/.test(s)) {
      comuna = s;
      return true;
    }
    return false;
  };

  if (tryComuna(addr.city_district)) { /* ok */ }
  else if (tryComuna(addr.district)) { /* ok */ }
  else if (tryComuna(addr.borough)) { /* ok */ }
  else if (suburb && (/comuna|corregimiento/i.test(suburb) || /^\d{1,2}\s*[-–]\s*/.test(suburb))) {
    comuna = suburb;
  }
  else {
    const county = limpiar(addr.county);
    if (county && (/comuna|corregimiento/i.test(county))) comuna = county;
  }

  return { comuna, barrio };
}

async function nominatimReverse(lat, lng) {
  const u = new URL('https://nominatim.openstreetmap.org/reverse');
  u.searchParams.set('format', 'json');
  u.searchParams.set('lat', String(lat));
  u.searchParams.set('lon', String(lng));
  u.searchParams.set('zoom', '18');
  u.searchParams.set('addressdetails', '1');

  const res = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'es',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ nominatimForwardAddress?: Record<string, string>|null, arcgisAttrs?: Record<string, unknown>|null }} extras
 */
async function enriquecerZona(lat, lng, extras = {}) {
  let comuna = null;
  let barrio = null;

  try {
    const rev = await nominatimReverse(lat, lng);
    if (rev?.address) {
      const z = deNomAddress(rev.address);
      comuna = z.comuna;
      barrio = z.barrio;
    }
  } catch {
    /* ignorar */
  }

  if (extras.nominatimForwardAddress) {
    const z = deNomAddress(extras.nominatimForwardAddress);
    if (!barrio && z.barrio) barrio = z.barrio;
    if (!comuna && z.comuna) comuna = z.comuna;
  }

  const a = extras.arcgisAttrs;
  if (a && typeof a === 'object') {
    if (!barrio) {
      barrio = limpiar(a.Neighborhood) || limpiar(a.Sublocality) || limpiar(a.Locality);
    }
    if (!comuna) {
      const d = limpiar(a.District);
      const sr = limpiar(a.Subregion);
      const place = limpiar(a.PlaceName);
      if (d && (/comuna|corregimiento/i.test(d) || /^\d{1,2}\s*[-–]\s*/.test(d))) comuna = d;
      else if (sr && /comuna|corregimiento/i.test(sr)) comuna = sr;
      else if (place && /comuna|corregimiento/i.test(place)) comuna = place;
    }
  }

  const comunaFinal = await comunaOficialFinal(lat, lng, comuna);

  const t = barrio ? barrio.trim() : '';
  const barrioMay = t ? t.toLocaleUpperCase('es-CO') : null;
  return { comuna: comunaFinal || null, barrio: barrioMay };
}

/**
 * Barrio oficial (catastro / planeación) desde ítem de la API de Medellín.
 * @param {Record<string, unknown>} item
 */
function barrioDesdeItemAlcaldia(item) {
  const b = limpiar(item.nombre_barrio_cat) || limpiar(item.nombre_barrio_pla);
  return b ? b.toLocaleUpperCase('es-CO') : null;
}

/**
 * org_key del GeoJSON (ej. "16 - BELEN") desde código o nombre de comuna oficial.
 * @param {Record<string, unknown>} item
 * @param {number} lat
 * @param {number} lng
 */
async function comunaDesdeItemAlcaldia(item, lat, lng) {
  const ref = await cargarComunasGeoJSON();
  const codRaw = limpiar(item.codigo_comuna_pla) || limpiar(item.codigo_comuna_cat);
  const num = codRaw != null ? parseInt(String(codRaw).replace(/^0+/, '') || codRaw, 10) : NaN;
  if (ref?.rows?.length && Number.isFinite(num)) {
    const hit = ref.rows.find((r) => r.numero === num);
    if (hit?.org_key) return hit.org_key;
  }

  const nombre =
    limpiar(item.nombre_comuna_cat) ||
    limpiar(item.nombre_comuna_pla);
  if (nombre && ref?.rows?.length) {
    const cat = normalizarComunaAlCatalogo(nombre, ref.rows);
    if (cat) return cat;
  }

  return comunaOficialFinal(lat, lng, nombre);
}

/**
 * Geocodifica con la API oficial de la Alcaldía (proxy same-origin).
 * @param {string} direccion
 */
async function geocodificarAlcaldiaMedellin(direccion) {
  const q = String(direccion || '').trim();
  if (q.length < 3) return null;

  try {
    const u = new URL('/api/geocodificar-medellin', window.location.origin);
    u.searchParams.set('direccion', q);
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.status || !Array.isArray(data.item) || !data.item.length) return null;

    const item = data.item[0];
    const lat = Number(item.latitud);
    const lng = Number(item.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const comuna = await comunaDesdeItemAlcaldia(item, lat, lng);
    const barrio = barrioDesdeItemAlcaldia(item);

    return {
      lat,
      lng,
      fuente: 'alcaldia',
      confianza: 'alta',
      comuna,
      barrio,
      dirEncasillada: limpiar(item.dir_encasillada) || limpiar(item.dir),
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} direccion Texto libre (calle, número, etc.)
 * @returns {Promise<{ lat: number, lng: number, fuente: 'alcaldia'|'arcgis'|'osm', confianza: 'alta'|'media'|'baja', comuna: string|null, barrio: string|null, dirEncasillada?: string|null }|null>}
 */
export async function geocodificarDireccion(direccion) {
  const raw = String(direccion || '').trim();
  if (!raw || raw.length < 3) return null;

  const alc = await geocodificarAlcaldiaMedellin(raw);
  if (alc) return alc;

  const singleLine = conContextoMedellin(raw);
  if (!singleLine || singleLine.length < 3) return null;

  try {
    const url = new URL(
      'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates',
    );
    url.searchParams.set('f', 'json');
    url.searchParams.set('SingleLine', singleLine);
    url.searchParams.set('outFields', '*');
    url.searchParams.set('maxLocations', '5');

    const res = await fetch(url.toString(), { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      const cands = data.candidates || [];
      if (cands.length) {
        const best = cands[0];
        const loc = best.location;
        if (loc && typeof loc.x === 'number' && typeof loc.y === 'number') {
          const score = Number(best.score) || 0;
          const lat = loc.y;
          const lng = loc.x;
          const attrs = best.attributes && typeof best.attributes === 'object' ? best.attributes : null;
          const zona = await enriquecerZona(lat, lng, { arcgisAttrs: attrs });
          return {
            lat,
            lng,
            fuente: 'arcgis',
            confianza: confianzaDesdeScore(score),
            comuna: zona.comuna,
            barrio: zona.barrio,
          };
        }
      }
    }
  } catch {
    /* continuar a OSM */
  }

  try {
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('format', 'json');
    u.searchParams.set('limit', '3');
    u.searchParams.set('q', singleLine);

    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'es',
      },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const top = arr[0];
    const lat = parseFloat(top.lat);
    const lng = parseFloat(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const imp = parseFloat(top.importance) || 0;
    const addrFwd = top.address && typeof top.address === 'object' ? top.address : null;
    const zona = await enriquecerZona(lat, lng, { nominatimForwardAddress: addrFwd });
    return {
      lat,
      lng,
      fuente: 'osm',
      confianza: confianzaDesdeImportance(imp, top.class, top.type),
      comuna: zona.comuna,
      barrio: zona.barrio,
    };
  } catch {
    return null;
  }
}
