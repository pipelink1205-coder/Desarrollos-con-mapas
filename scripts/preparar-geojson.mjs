// =====================================================================
//  Combina los archivos de comunas y corregimientos de la carpeta
//  MAPAS COMUNAS en un solo data/comunas.geojson con las propiedades
//  que el mapa de la app espera.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SRC_DIR = 'C:\\Users\\Diana\\OneDrive\\Documentos antiguos\\Documentos\\02 - EPI\\EPI 2026\\MAPAS COMUNAS';
const OUT     = path.resolve(__dirname, '..', 'data', 'comunas.geojson');

// Mapeo: nombre comuna → org_key que usan los datos en discapacidad
// El CSV usa formato "10 - LA CANDELARIA", debemos coincidir.
const NOMBRE_FORMAL = {
  'Popular':           '01 - POPULAR',
  'Santa Cruz':        '02 - SANTA CRUZ',
  'Manrique':          '03 - MANRIQUE',
  'Aranjuez':          '04 - ARANJUEZ',
  'Castilla':          '05 - CASTILLA',
  'Doce de Octubre':   '06 - DOCE DE OCTUBRE',
  'Robledo':           '07 - ROBLEDO',
  'Villa Hermosa':     '08 - VILLA HERMOSA',
  'Buenos Aires':      '09 - BUENOS AIRES',
  'La Candelaria':     '10 - LA CANDELARIA',
  'Laureles Estadio':  '11 - LAURELES-ESTADIO',
  'La América':        '12 - LA AMERICA',
  'San Javier':        '13 - SAN JAVIER',
  'El Poblado':        '14 - EL POBLADO',
  'Guayabal':          '15 - GUAYABAL',
  'Belén':             '16 - BELEN',
};

// Calcular centroide aproximado promediando coordenadas
function centroide(geom) {
  let sumLat = 0, sumLon = 0, count = 0;

  function recolectar(coords, nivel = 0) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      sumLon += coords[0];
      sumLat += coords[1];
      count++;
    } else {
      coords.forEach(c => recolectar(c, nivel + 1));
    }
  }

  recolectar(geom.coordinates);
  return count ? { clat: sumLat / count, clon: sumLon / count } : { clat: null, clon: null };
}

// ---------------------------------------------------------------------
//  1. Leer comunas (16 features)
// ---------------------------------------------------------------------
const comunasRaw = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'Comunas_Medellin.geojson'), 'utf8'));

const comunasFeatures = comunasRaw.features.map(f => {
  const nombreCorto = f.properties.Nombre_Comuna;
  const numero      = f.properties.Numero_Comuna;
  const nombreFormal = NOMBRE_FORMAL[nombreCorto] || `${String(numero).padStart(2,'0')} - ${nombreCorto.toUpperCase()}`;
  const c = centroide(f.geometry);

  return {
    type: 'Feature',
    properties: {
      nombre:        nombreFormal,
      nombre_corto:  nombreCorto,
      numero:        numero,
      tipo:          'comuna',
      org_key:       nombreFormal,
      clat:          c.clat,
      clon:          c.clon,
      cnt:           0,
    },
    geometry: f.geometry,
  };
});

console.log(`Comunas procesadas: ${comunasFeatures.length}`);

// ---------------------------------------------------------------------
//  2. Leer corregimientos (5 features con propiedades distintas)
// ---------------------------------------------------------------------
const corregRaw = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'Corregimientos.json'), 'utf8'));

const corregFeatures = corregRaw.features.map(f => {
  // f.properties.name viene como "50 Palmitas", "60 San Cristóbal", etc.
  const m = (f.properties.name || '').match(/^(\d+)\s+(.+)$/);
  const numero       = m ? parseInt(m[1], 10) : null;
  const nombreCorto  = m ? m[2] : (f.properties.name || 'Corregimiento');
  const nombreFormal = numero
    ? `${numero} - ${nombreCorto.toUpperCase()}`
    : nombreCorto.toUpperCase();
  const c = centroide(f.geometry);

  return {
    type: 'Feature',
    properties: {
      nombre:        nombreFormal,
      nombre_corto:  nombreCorto,
      numero:        numero,
      tipo:          'corregimiento',
      org_key:       nombreFormal,
      clat:          c.clat,
      clon:          c.clon,
      cnt:           0,
    },
    geometry: f.geometry,
  };
});

console.log(`Corregimientos procesados: ${corregFeatures.length}`);

// ---------------------------------------------------------------------
//  3. Unir y escribir
// ---------------------------------------------------------------------
const out = {
  type: 'FeatureCollection',
  name: 'comunas_y_corregimientos_medellin',
  features: [...comunasFeatures, ...corregFeatures],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

console.log(`\nArchivo generado: ${OUT}`);
console.log(`Total features: ${out.features.length}`);
console.log(`Tamaño: ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
