// =====================================================================
//  SCRIPT: migrar los CSVs originales a la base de datos Supabase
// =====================================================================
//  Importa los 4 archivos CSV de "INFORMACIONN PARA DESARROLLO WEB":
//    - Discapacidad.csv         → instituciones (categoria='discapacidad')
//    - Oferta cuidados.csv      → instituciones (categoria='cuidado')
//    - Mesas de cuidado.csv     → instituciones (categoria='mesa')
//    - Producto de apoyo.csv    → productos_apoyo
//
//  Uso:  npm run migrar
//
//  Ajusta la ruta CSV_DIR si los archivos están en otra carpeta.
// =====================================================================

import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';

dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Ruta a los CSVs (relativa al proyecto)
const CSV_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'INFORMACIONN PARA DESARROLLO WEB',
  'Archivos csv',
);

const url     = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------

function leerCSV(nombre) {
  const ruta = path.join(CSV_DIR, nombre);
  if (!fs.existsSync(ruta)) {
    console.error(`No se encontró: ${ruta}`);
    return [];
  }
  // Algunos CSV vienen en latin1/cp1252 (acentos rotos); intentamos detectar.
  let buf = fs.readFileSync(ruta);
  let txt = buf.toString('utf8');

  // Si vemos muchos caracteres extraños típicos, releemos como latin1
  const malos = (txt.match(/[\uFFFD\u00F1]/g) || []).length;
  if (malos > 5) {
    txt = buf.toString('latin1');
  }

  const filas = parse(txt, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  return filas;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  // Cambiar coma decimal por punto
  const s = String(v).replace(',', '.').replace(/\s/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Validar coordenadas: solo aceptar lat/lon razonables para Medellín y alrededores
function lat(v) {
  const n = num(v);
  if (n === null) return null;
  if (n < 5 || n > 7) return null; // Medellín está alrededor de 6.2
  return n;
}

function lon(v) {
  const n = num(v);
  if (n === null) return null;
  if (n < -77 || n > -74) return null; // Medellín está alrededor de -75.5
  return n;
}

function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'nan' || s === '-') return null;
  return s;
}

function bool(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  return ['si','sí','yes','true','1','x'].includes(s);
}

function arrTipos(v) {
  const t = txt(v);
  if (!t) return null;
  return t.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

async function insertarLote(tabla, filas) {
  if (!filas.length) return;
  const tam = 100;
  for (let i = 0; i < filas.length; i += tam) {
    const lote = filas.slice(i, i + tam);
    const { error } = await supabase.from(tabla).insert(lote);
    if (error) {
      console.error(`Error en lote ${i}-${i + lote.length} de ${tabla}:`);
      console.error(error.message);
    } else {
      process.stdout.write(`.`);
    }
  }
  console.log('');
}

// ---------------------------------------------------------------------
//  1. DISCAPACIDAD
// ---------------------------------------------------------------------

async function migrarDiscapacidad() {
  console.log('\n► Migrando Discapacidad.csv …');
  const filas = leerCSV('Discapacidad.csv');
  console.log(`  ${filas.length} filas leídas (incluye duplicados por tipo de discapacidad)`);

  // Agrupar por nombre+dirección (cada organización aparece varias veces, una por tipo)
  const grupos = new Map();

  for (const f of filas) {
    const nombre    = txt(f['Nombre']);
    const direccion = txt(f['Dirección'] || f['Direcciףn'] || f['Direccion']);
    if (!nombre) continue;

    const clave = `${nombre.toLowerCase()}|${(direccion || '').toLowerCase()}`;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        categoria:                    'discapacidad',
        nombre,
        direccion,
        direccion_contrastada:        txt(f['Dirección contrastada'] || f['Direcciףn contrastada']),
        latitud_verdadera:            lat(f['Latitud verdadera']),
        longitud_verdadera:           lon(f['Longitud verdadera']),
        latitud:                      lat(f['Latitud']),
        longitud:                     lon(f['Longitud']),
        distrito:                     txt(f['Distrito']),
        otro_municipio:               txt(f['Otro municipio']),
        comuna:                       txt(f['Comuna']),
        barrio:                       txt(f['Barrio']),
        telefono:                     txt(f['Teléfonos'] || f['Telיfonos'] || f['Telefonos']),
        email:                        txt(f['E-mail/Página Web'] || f['E-mail/Pבgina Web']),
        servicios:                    txt(f['Servicios que Ofrece']),
        costo:                        txt(f['Costo']),
        requisitos:                   txt(f['Requisitos']),
        contacto_persona:             txt(f['Persona que Suministra la Información y/o Contacto'] || f['Persona que Suministra la Informaciףn y/o Contacto']),
        observacion_actualizacion:    txt(f['Observación de actualización'] || f['Observaciףn de actualizaciףn']),
        eje_pp_1:                     txt(f['Eje Política Pública 1'] || f['Eje Polםtica Pתblica 1']),
        eje_pp_2:                     txt(f['Eje Política Pública 2'] || f['Eje Polםtica Pתblica 2']),
        eje_pp_3:                     txt(f['Eje Política Pública 3'] || f['Eje Polםtica Pתblica 3']),
        estrategia_pp_1:              txt(f['Estrategias PP 1']),
        estrategia_pp_2:              txt(f['Estrategias PP 2']),
        estrategia_pp_3:              txt(f['Estrategias PP 3']),
        sector:                       txt(f['Sector']),
        nivel_relacionamiento_pp:     txt(f['Nivel de relacionamiento con la Política P'] || f['Nivel de relacionamiento con la Polםtica P']),
        instancias_participacion:     txt(f['instancias de participacion ']),
        tipos_discapacidad:           new Set(),
        atiende_persona_discapacidad: bool(f['Persona con discapacidad']),
        atiende_familia:              bool(f['Familia']),
        atiende_publico_general:      bool(f['Público en general'] || f['Pתblico en general']),
      });
    }

    // Acumular tipo de discapacidad de esta fila
    const tipo = txt(f['Tipo de Discapacidad']);
    if (tipo) {
      tipo.split(/[,;|]/).forEach(t => {
        const t2 = t.trim();
        if (t2) grupos.get(clave).tipos_discapacidad.add(t2);
      });
    }
  }

  // Convertir Sets a arrays
  const registros = [...grupos.values()].map(r => ({
    ...r,
    tipos_discapacidad: r.tipos_discapacidad.size ? [...r.tipos_discapacidad] : null,
  }));

  await insertarLote('instituciones', registros);
  console.log(`  ✓ ${registros.length} organizaciones únicas de discapacidad insertadas`);
}

// ---------------------------------------------------------------------
//  2. CUIDADO
// ---------------------------------------------------------------------

async function migrarCuidado() {
  console.log('\n► Migrando Oferta cuidados.csv …');
  const filas = leerCSV('Oferta cuidados.csv');
  console.log(`  ${filas.length} filas leídas`);

  const registros = filas.map(f => ({
    categoria:          'cuidado',
    nombre:             txt(f['Nombre de la organización'] || f['Nombre de la organizaciуn']),
    direccion:          txt(f['Dirección'] || f['Dirección '] || f['Direcciуn '] || f['Direcciуn']),
    latitud:            lat(f['Latitud']),
    longitud:           lon(f['Longitud']),
    tipo_organizacion:  txt(f['Tipo de organización'] || f['Tipo de organizaciуn']),
    programa:           txt(f['Nombre del programa o proyecto']),
    servicios:          txt(f['Apoyo que ofrece']),
    dimension_pp:       txt(f['Dimensión plan de acción de la PPPC'] || f['Dimensiуn plan de acciуn de la PPPC']),
    costo:              txt(f['Costo']),
    requisitos:         txt(f['Requisitos']),
    cupos:              txt(f['Cupos de atención'] || f['Cupos de atenciуn']),
    cobertura:          txt(f['Cobertura del proyecto']),
    poblacion_objetivo: txt(f['Población Objetivo'] || f['Poblaciуn Objetivo']),
    email:              txt(f['E-mail / Página Web'] || f['E-mail / Pбgina Web']),
    telefono:           txt(f['Télefono'] || f['Tйlefono']),
  }))
  .filter(r => r.nombre);

  await insertarLote('instituciones', registros);
  console.log(`  ✓ ${registros.length} instituciones de cuidado insertadas`);
}

// ---------------------------------------------------------------------
//  3. MESAS DE CUIDADO
// ---------------------------------------------------------------------

async function migrarMesas() {
  console.log('\n► Migrando Mesas de cuidado.csv …');
  const filas = leerCSV('Mesas de cuidado.csv');
  console.log(`  ${filas.length} filas leídas`);

  const registros = filas.map(f => ({
    categoria:          'mesa',
    nombre:             txt(f['Nombre de la organización']),
    direccion:          txt(f['Dirección']),
    latitud:            lat(f['Latitud']),
    longitud:           lon(f['Longitud']),
    tipo_organizacion:  txt(f['Tipo de organización']),
    programa:           txt(f['Nombre del programa o proyecto']),
    servicios:          txt(f['Apoyo que ofrece']),
    dimension_pp:       txt(f['Dimensión plan de acción de la PPPC']),
    costo:              txt(f['Costo']),
    requisitos:         txt(f['Requisitos']),
    cupos:              txt(f['Cupos de atención']),
    cobertura:          txt(f['Cobertura del proyecto']),
    poblacion_objetivo: txt(f['Población Objetivo']),
    email:              txt(f['E-mail / Página Web']),
    telefono:           txt(f['Télefono']),
  }))
  .filter(r => r.nombre);

  await insertarLote('instituciones', registros);
  console.log(`  ✓ ${registros.length} mesas de cuidado insertadas`);
}

// ---------------------------------------------------------------------
//  4. PRODUCTOS DE APOYO
// ---------------------------------------------------------------------

async function migrarProductos() {
  console.log('\n► Migrando Producto de apoyo.csv …');
  const filas = leerCSV('Producto de apoyo.csv');
  console.log(`  ${filas.length} filas leídas`);

  const registros = filas.map(f => ({
    categoria: txt(f['CATEGORIA']),
    proveedor: txt(f['PROVEEDOR']),
    oferta:    txt(f['OFERTA']),
    contacto:  txt(f['CONTACTO']),
  }))
  .filter(r => r.proveedor);

  await insertarLote('productos_apoyo', registros);
  console.log(`  ✓ ${registros.length} productos insertados`);
}

// ---------------------------------------------------------------------
//  EJECUCIÓN
// ---------------------------------------------------------------------

console.log('====================================================');
console.log(' Migración de CSVs → Supabase');
console.log('====================================================');
console.log(` Carpeta CSVs:  ${CSV_DIR}`);

await migrarDiscapacidad();
await migrarCuidado();
await migrarMesas();
await migrarProductos();

console.log('\n====================================================');
console.log(' Migración completa.');
console.log('====================================================');
