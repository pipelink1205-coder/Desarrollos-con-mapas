// =====================================================================
//  PANEL DE ADMINISTRACIÓN / DIRECTORIO (solo lectura para rol consulta)
// =====================================================================
//  Admin: instituciones, productos, usuarios (CRUD).
//  Consulta: instituciones y productos en solo lectura; sin pestaña usuarios.
// =====================================================================

import { requireAuth } from './auth-guard.js';
import { supabase, cerrarSesion, obtenerSesion } from './supabase-client.js';
import { geocodificarDireccion } from './geocodificador.js';
import {
  CODIGO_COMUNA_FUERA_MEDELLIN,
  CODIGO_COMUNA_SIN_SEDE_FISICA,
  DIRECCION_SIN_NOMENCLATURA,
  coordenadasEnMedellin,
  esComunaCodigoReporte,
  esDireccionSinNomenclatura,
} from './codigos-ubicacion.js';
import { parseTelefonos, serializarTelefonos, textoTelefonos } from './telefonos.js';

const { perfil, session } = await requireAuth({ rolesPermitidos: ['admin', 'consulta'] });
const esAdmin = perfil.rol === 'admin';

/** Token JWT actual para llamadas a /api/* (no usar `session` del arranque: puede estar vencido). */
async function bearerToken() {
  const { data: { session: s } } = await supabase.auth.getSession();
  if (!s?.access_token) return null;
  return s.access_token;
}

/** Interpreta respuestas del endpoint serverless (JSON o HTML de error 404). */
async function parseApiError(respuesta) {
  const raw = await respuesta.text();
  try {
    const j = raw ? JSON.parse(raw) : {};
    if (j.error) return j.error;
  } catch { /* no JSON */ }
  if (respuesta.status === 404) {
    return 'No se encontró /api/crear-usuario. En local ejecuta `npm run dev:local` o `npm run dev` (no sirve abrir el HTML con Live Server). En producción, despliega en Vercel con variables de entorno.';
  }
  if (respuesta.status === 401) return 'Sesión inválida o expirada. Cierra sesión y vuelve a entrar.';
  if (respuesta.status === 500 && raw.includes('Variables de entorno')) {
    return 'Faltan variables en el servidor (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).';
  }
  return raw?.slice(0, 200) || `Error HTTP ${respuesta.status}`;
}

document.getElementById('user-nombre').textContent = perfil.nombre_completo;
document.getElementById('user-email').textContent  = perfil.email;
document.getElementById('btn-logout').addEventListener('click', cerrarSesion);

if (!esAdmin) {
  document.title = 'Directorio de instituciones — Mapa de Oferta · EPI';
  const ht = document.getElementById('hdr-titulo');
  const hs = document.getElementById('hdr-sub');
  if (ht) ht.textContent = 'Directorio de instituciones';
  if (hs) hs.textContent = 'Consulta y filtra la oferta registrada (solo lectura)';
  const tabU = document.getElementById('tab-usuarios');
  if (tabU) tabU.style.display = 'none';
  const pageU = document.getElementById('page-usuarios');
  if (pageU) pageU.hidden = true;
  ['btn-nueva-inst', 'btn-nuevo-prod', 'btn-nuevo-user'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ---------------------------------------------------------------------
//  Helpers UI
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

/** Misma lógica que el mapa público: coordenadas válidas en Medellín (no aplica si sin_sede). */
function institucionVisibleEnMapa(i) {
  if (i.sin_sede) return false;
  return coordenadasEnMedellin(i.latitud, i.longitud);
}

function tieneCoordenadasInst(i) {
  return institucionVisibleEnMapa(i);
}

function parseCoordInput(id) {
  const v = parseFloat(String($(id).value || '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Guarda URL con esquema https para enlaces en el mapa. */
function normalizarPaginaWeb(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (t.includes('.') && !t.includes('@')) return `https://${t}`;
  return t;
}

/** Al editar registros viejos con todo en email: separa URL si aún no hay pagina_web. */
function rellenarContactoInstitucion(i) {
  let email = i.email || '';
  let web = i.pagina_web || '';
  if (!web && email) {
    const partes = String(email).split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);
    const urls = partes.filter((p) => /^https?:\/\//i.test(p) || /^www\./i.test(p) || (p.includes('.') && !p.includes('@')));
    const mails = partes.filter((p) => p.includes('@'));
    if (urls.length) {
      web = urls[0];
      email = mails.length ? mails.join(' ') : partes.filter((p) => p !== web).join(' ').trim() || null;
    }
  }
  $('inst-email').value = email || '';
  $('inst-pagina_web').value = web || '';
}

function syncSinSedeCamposInst() {
  const sin = !!$('inst-sin_sede')?.checked;
  const bloqueados = ['inst-latitud', 'inst-longitud'];
  bloqueados.forEach((id) => {
    const el = $(id);
    if (el) el.disabled = sin;
  });
  const geoBtn = $('btn-geocodificar');
  if (geoBtn) geoBtn.disabled = sin;
  const comunaEl = $('inst-comuna');
  if (comunaEl) {
    if (sin) {
      comunaEl.value = CODIGO_COMUNA_SIN_SEDE_FISICA;
      comunaEl.readOnly = true;
    } else {
      comunaEl.readOnly = false;
      if (esComunaCodigoReporte(comunaEl.value)) comunaEl.value = '';
    }
  }
  const dirEl = $('inst-direccion');
  const dirCompEl = $('inst-direccion_complemento');
  if (dirEl) {
    if (sin) {
      dirEl.value = DIRECCION_SIN_NOMENCLATURA;
      dirEl.readOnly = true;
    } else {
      dirEl.readOnly = false;
      if (esDireccionSinNomenclatura(dirEl.value)) dirEl.value = '';
    }
  }
  if (dirCompEl) {
    if (sin) {
      dirCompEl.value = '';
      dirCompEl.disabled = true;
    } else {
      dirCompEl.disabled = false;
    }
  }
  if (sin) {
    $('inst-latitud').value = '';
    $('inst-longitud').value = '';
    const gw = $('geocod-mapa-wrap');
    if (gw) gw.style.display = 'none';
    resetGeocodUI();
  }
}

/** Número de comuna/corregimiento en texto (alineado con mapa.html). */
function numeroComunaEnTexto(s) {
  if (esComunaCodigoReporte(s)) return null;
  const t = String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\b/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/\bCOMUNA\s+(\d{1,2})\b/) || t.match(/\bCOM\s+(\d{1,2})\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

// =====================================================================
//  GEOCODIFICACIÓN AUTOMÁTICA (modal institución)
// =====================================================================

/** Mini-mapa Leaflet de previsualización (instancia única por sesión de modal). */
let _geocodMap        = null;
let _geocodMarker     = null;
let _geocodMapReady   = false;

function resetGeocodUI() {
  _ocultarEstado();
  _mostrarBadgesAuto(false);
  const wrap = $('geocod-mapa-wrap');
  if (wrap) wrap.style.display = 'none';
}

/**
 * Crea o mueve el mini-mapa Leaflet en el div #geocod-mapa.
 * @param {number} lat
 * @param {number} lng
 */
function _inicializarMiniMapa(lat, lng) {
  if (typeof L === 'undefined') {
    console.warn('[Geocod] Leaflet no está cargado.');
    return;
  }
  if (!_geocodMapReady) {
    _geocodMap = L.map('geocod-mapa', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_geocodMap);
    _geocodMapReady = true;
  }

  _geocodMap.setView([lat, lng], 17);

  if (_geocodMarker) {
    _geocodMarker.setLatLng([lat, lng]);
  } else {
    _geocodMarker = L.marker([lat, lng], { draggable: true })
      .addTo(_geocodMap)
      .bindPopup('📍 Arrastra para ajustar la posición exacta')
      .openPopup();

    _geocodMarker.on('dragend', () => {
      const pos = _geocodMarker.getLatLng();
      $('inst-latitud').value  = pos.lat.toFixed(7);
      $('inst-longitud').value = pos.lng.toFixed(7);
      if (!$('inst-sin_sede')?.checked && !coordenadasEnMedellin(pos.lat, pos.lng)) {
        $('inst-comuna').value = CODIGO_COMUNA_FUERA_MEDELLIN;
      }
    });
  }

  setTimeout(() => _geocodMap.invalidateSize(), 150);
}

function _estadoGeocod(tipo, msg) {
  const el = $('geocod-status');
  if (!el) return;
  const bg = {
    cargando: 'background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe',
    ok:       'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0',
    parcial:  'background:#fef3c7;color:#d97706;border:1px solid #fde68a',
    error:    'background:#fee2e2;color:#dc2626;border:1px solid #fecaca',
  }[tipo] || '';
  el.style.cssText = `font-size:10px;margin-top:4px;padding:5px 9px;border-radius:5px;line-height:1.5;display:block;${bg}`;
  el.textContent   = msg;
}

function _ocultarEstado() {
  const el = $('geocod-status');
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function _mostrarBadgesAuto(visible) {
  ['geocod-lat-badge', 'geocod-lng-badge'].forEach((id) => {
    const el = $(id);
    if (el) el.style.display = visible ? 'inline' : 'none';
  });
}

async function _ejecutarGeocod() {
  if (!esAdmin) return;
  const dir = ($('inst-direccion')?.value || '').trim();

  if (!dir || dir.length < 5) {
    _estadoGeocod('error', '⚠ Escribe una dirección válida antes de geocodificar (mínimo 5 caracteres).');
    return;
  }

  const btn = $('btn-geocodificar');
  const txtOrig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Buscando…'; }

  _estadoGeocod('cargando', '🔍 Consultando coordenadas para "' + dir + '" en Medellín…');

  try {
    const r = await geocodificarDireccion(dir);

    if (!r) {
      _estadoGeocod('error',
        '❌ No se encontraron coordenadas. Prueba con un formato más específico: ' +
        '"Calle 50 # 45-30" · "Carrera 80 # 33-12" · "Avenida El Poblado # 10-50"',
      );
      _mostrarBadgesAuto(false);
      return;
    }

    $('inst-latitud').value  = r.lat.toFixed(7);
    $('inst-longitud').value = r.lng.toFixed(7);

    const fueraMed = !coordenadasEnMedellin(r.lat, r.lng);
    const comunaAntes = ($('inst-comuna')?.value || '').trim();
    const numAntes = numeroComunaEnTexto(comunaAntes);
    const numGeo = numeroComunaEnTexto(r.comuna);
    let avisoComuna = '';

    if (fueraMed) {
      $('inst-comuna').value = CODIGO_COMUNA_FUERA_MEDELLIN;
      avisoComuna =
        ` · El punto quedó fuera del área de Medellín: comuna asignada «${CODIGO_COMUNA_FUERA_MEDELLIN}» (código para reportes).`;
    } else if (r.comuna) {
      if (numAntes != null && numGeo != null && numAntes !== numGeo) {
        avisoComuna =
          ` · Atención: el punto quedó en comuna ${numGeo} (${r.comuna}), no en la ${numAntes} que tenías. ` +
          'No cambiamos el campo Comuna: revisa la dirección o arrastra el marcador. Si el punto es correcto, actualiza Comuna a mano.';
      } else {
        $('inst-comuna').value = r.comuna;
      }
    }
    if (r.barrio) $('inst-barrio').value = r.barrio;
    _mostrarBadgesAuto(true);

    const fuenteLabel = r.fuente === 'arcgis' ? 'ArcGIS / Esri' : 'OpenStreetMap';
    const iconoConf   = r.confianza === 'alta' ? '✅' : '⚠️';
    const textoConf   = r.confianza === 'alta' ? 'alta — ubicación confiable'
      : r.confianza === 'media' ? 'media — verifica en el mapa'
        : 'baja — ajusta manualmente el marcador';

    const partesZona = [];
    if (r.comuna) partesZona.push(`Comuna detectada: ${r.comuna}`);
    if (r.barrio) partesZona.push(`Barrio: ${r.barrio}`);
    const extraZona = partesZona.length ? ` · ${partesZona.join(' · ')}` : ' · Comuna/barrio: no detectados (revísalos a mano)';

    _estadoGeocod(
      avisoComuna ? 'parcial' : (r.confianza === 'alta' ? 'ok' : 'parcial'),
      `${iconoConf} Coordenadas guardadas · Fuente: ${fuenteLabel} · Confianza: ${textoConf}${extraZona}${avisoComuna}`,
    );

    const wrap = $('geocod-mapa-wrap');
    if (wrap) wrap.style.display = 'block';
    _inicializarMiniMapa(r.lat, r.lng);
  } catch (err) {
    console.error('[Geocod] Error inesperado:', err);
    _estadoGeocod('error', `❌ Error inesperado: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = txtOrig; }
  }
}

document.addEventListener('click', (e) => {
  if (e.target?.id === 'btn-geocodificar') _ejecutarGeocod();
});

$('inst-sin_sede')?.addEventListener('change', syncSinSedeCamposInst);

document.addEventListener('keydown', (e) => {
  if (e.target?.id === 'inst-direccion' && e.key === 'Enter') {
    e.preventDefault();
    _ejecutarGeocod();
  }
  if (e.target?.id === 'prod-direccion' && e.key === 'Enter') {
    e.preventDefault();
    _ejecutarGeocodProd();
  }
});

// ---------------------------------------------------------------------
//  Geocodificación productos (misma lógica que instituciones)
// ---------------------------------------------------------------------
let _prodGeocodMap      = null;
let _prodGeocodMarker   = null;
let _prodGeocodMapReady = false;
let _prodGeocodTimer    = null;

function resetGeocodProdUI() {
  _ocultarEstadoProd();
  _mostrarBadgesAutoProd(false);
  const wrap = $('prod-geocod-mapa-wrap');
  if (wrap) wrap.style.display = 'none';
}

function _estadoGeocodProd(tipo, msg) {
  const el = $('prod-geocod-status');
  if (!el) return;
  const bg = {
    cargando: 'background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe',
    ok:       'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0',
    parcial:  'background:#fef3c7;color:#d97706;border:1px solid #fde68a',
    error:    'background:#fee2e2;color:#dc2626;border:1px solid #fecaca',
  }[tipo] || '';
  el.style.cssText = `font-size:10px;margin-top:4px;padding:5px 9px;border-radius:5px;line-height:1.5;display:block;${bg}`;
  el.textContent   = msg;
}

function _ocultarEstadoProd() {
  const el = $('prod-geocod-status');
  if (el) {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function _mostrarBadgesAutoProd(visible) {
  ['prod-geocod-lat-badge', 'prod-geocod-lng-badge'].forEach((id) => {
    const el = $(id);
    if (el) el.style.display = visible ? 'inline' : 'none';
  });
}

function _inicializarMiniMapaProd(lat, lng) {
  if (typeof L === 'undefined') return;
  if (!_prodGeocodMapReady) {
    _prodGeocodMap = L.map('prod-geocod-mapa', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(_prodGeocodMap);
    _prodGeocodMapReady = true;
  }
  _prodGeocodMap.setView([lat, lng], 17);
  if (_prodGeocodMarker) {
    _prodGeocodMarker.setLatLng([lat, lng]);
  } else {
    _prodGeocodMarker = L.marker([lat, lng], { draggable: true })
      .addTo(_prodGeocodMap)
      .bindPopup('📍 Arrastra para ajustar')
      .openPopup();
    _prodGeocodMarker.on('dragend', () => {
      const pos = _prodGeocodMarker.getLatLng();
      $('prod-latitud').value  = pos.lat.toFixed(7);
      $('prod-longitud').value = pos.lng.toFixed(7);
    });
  }
  setTimeout(() => _prodGeocodMap.invalidateSize(), 150);
}

async function _ejecutarGeocodProd(opts = {}) {
  if (!esAdmin) return;
  const dir = ($('prod-direccion')?.value || '').trim();
  if (!dir || dir.length < 5) {
    if (!opts.silencioso) {
      _estadoGeocodProd('error', '⚠ Escribe una dirección válida (mínimo 5 caracteres).');
    }
    return;
  }

  const btn = $('btn-geocodificar-prod');
  const txtOrig = btn?.textContent;
  if (btn && !opts.silencioso) { btn.disabled = true; btn.textContent = '⏳ Buscando…'; }
  if (!opts.silencioso) {
    _estadoGeocodProd('cargando', '🔍 Ubicando "' + dir + '" en Medellín…');
  }

  try {
    const r = await geocodificarDireccion(dir);
    if (!r) {
      if (!opts.silencioso) {
        _estadoGeocodProd('error', '❌ No se encontraron coordenadas. Prueba una dirección más específica.');
      }
      _mostrarBadgesAutoProd(false);
      return;
    }

    $('prod-latitud').value  = r.lat.toFixed(7);
    $('prod-longitud').value = r.lng.toFixed(7);
    if (r.comuna) $('prod-comuna').value = r.comuna;
    if (r.barrio) $('prod-barrio').value = r.barrio;
    _mostrarBadgesAutoProd(true);

    if (!opts.silencioso) {
      const extra = [r.comuna && `Comuna: ${r.comuna}`, r.barrio && `Barrio: ${r.barrio}`].filter(Boolean).join(' · ');
      _estadoGeocodProd(
        r.confianza === 'alta' ? 'ok' : 'parcial',
        `✅ Punto listo para el mapa${extra ? ' · ' + extra : ''}`,
      );
    }

    const wrap = $('prod-geocod-mapa-wrap');
    if (wrap) wrap.style.display = 'block';
    _inicializarMiniMapaProd(r.lat, r.lng);
  } catch (err) {
    if (!opts.silencioso) _estadoGeocodProd('error', `❌ ${err.message}`);
  } finally {
    if (btn && !opts.silencioso) { btn.disabled = false; btn.textContent = txtOrig; }
  }
}

document.addEventListener('click', (e) => {
  if (e.target?.id === 'btn-geocodificar-prod') _ejecutarGeocodProd();
});

const prodDirInput = $('prod-direccion');
if (prodDirInput) {
  prodDirInput.addEventListener('input', () => {
    clearTimeout(_prodGeocodTimer);
    const dir = prodDirInput.value.trim();
    if (dir.length < 8) return;
    _prodGeocodTimer = setTimeout(() => _ejecutarGeocodProd({ silencioso: true }), 900);
  });
}

{
  const btnNueva = $('btn-nueva-inst');
  if (btnNueva) {
    btnNueva.addEventListener('click', () => {
      resetGeocodUI();
    }, true);
  }
}

// =====================================================================
//  FIN GEOCODIFICACIÓN
// =====================================================================

function toast(msg, tipo = 'ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className   = `toast ${tipo} show`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

function abrirModal(id)    { $(id).classList.add('open'); }
function cerrarModal(id)   { $(id).classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
});
document.querySelectorAll('.mbg').forEach((bg) => {
  if (bg.dataset.noBackdropClose != null) return;
  bg.addEventListener('click', (e) => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

// ---------------------------------------------------------------------
//  Navegación entre pestañas
// ---------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`page-${tab.dataset.page}`).classList.add('active');

    if (tab.dataset.page === 'instituciones' && !state.instCargadas) cargarInstituciones();
    if (tab.dataset.page === 'productos'     && !state.prodCargados) cargarProductos();
    if (esAdmin && tab.dataset.page === 'usuarios' && !state.usersCargados) cargarUsuarios();
  });
});

// ---------------------------------------------------------------------
//  Estado en memoria
// ---------------------------------------------------------------------
const state = {
  instituciones: [],
  productos:     [],
  usuarios:      [],
  instCargadas:  false,
  prodCargados:  false,
  usersCargados: false,
  /** @type {{ id:string, slug:string, etiqueta:string }[]} */
  servicioCatalogo: [],
  /** @type {{ id:string, slug:string, etiqueta:string }[]} */
  discCatalogo:   [],
};

// =====================================================================
//  INSTITUCIONES
// =====================================================================

/** Pinta casillas desde catálogos cargados en `state`. */
function renderCatalogosAdmin() {
  const ws = $('inst-servicios-cat');
  const wd = $('inst-discapacidad-cat');
  if (!ws || !wd) return;
  const ls = state.servicioCatalogo || [];
  const ld = state.discCatalogo || [];
  if (!ls.length) {
    ws.innerHTML =
      '<span class="hint">Sin catálogo de servicios. Ejecuta en Supabase <code>sql/05-catalogos-oferta.sql</code> y <code>sql/06-rls-catalogos-oferta.sql</code>.</span>';
  }
  else {
    ws.innerHTML = ls.map(s =>
      `<label class="check"><input type="checkbox" name="inst-srv-cat" value="${s.id}"> ${escapar(s.etiqueta)}</label>`,
    ).join('');
  }
  if (!ld.length) {
    wd.innerHTML =
      '<span class="hint">Sin catálogo de discapacidades. Ejecuta las migraciones SQL indicadas.</span>';
  }
  else {
    wd.innerHTML = ld.map(d =>
      `<label class="check"><input type="checkbox" name="inst-disc-cat" value="${d.id}"> ${escapar(d.etiqueta)}</label>`,
    ).join('');
  }
}

function limpiarChecksCatalogos() {
  document.querySelectorAll(
    '#inst-servicios-cat input[type=checkbox],#inst-discapacidad-cat input[type=checkbox]',
  ).forEach((c) => { c.checked = false; });
}

/** Si no hay datos en puente, intenta marcar según texto legado en `tipos_discapacidad`. */
function marcarDiscSegunLegacy(rows) {
  const legacy = Array.isArray(rows) ? rows : [];
  if (!legacy.length) return;
  const norm = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  const byEt = new Map(
    state.discCatalogo.map((d) => [norm(d.etiqueta), d.id]),
  );
  legacy.forEach((lbl) => {
    const id = byEt.get(norm(lbl));
    if (!id) return;
    const inp = document.querySelector(`#inst-discapacidad-cat input[value="${id}"]`);
    if (inp) inp.checked = true;
  });
}

async function cargarInstituciones() {
  const [instRes, srvRes, discRes] = await Promise.all([
    supabase.from('instituciones').select('*').order('nombre', { ascending: true }),
    supabase.from('servicio_oferta').select('id,slug,etiqueta,orden').order('orden', { ascending: true }),
    supabase.from('catalogo_discapacidad').select('id,slug,etiqueta,orden').order('orden', { ascending: true }),
  ]);

  if (srvRes.error) console.warn('[admin] Catálogo servicios:', srvRes.error.message);
  if (discRes.error) console.warn('[admin] Catálogo discapacidad:', discRes.error.message);

  state.servicioCatalogo = srvRes.data || [];
  state.discCatalogo     = discRes.data || [];

  renderCatalogosAdmin();

  if (instRes.error) {
    $('tabla-inst-wrap').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${instRes.error.message}</p></div>`;
    return;
  }
  state.instituciones = instRes.data || [];
  state.instCargadas  = true;
  renderInstituciones();
}

function renderInstituciones() {
  const q   = ($('busc-inst').value || '').toLowerCase();
  const cat = $('filt-cat-inst').value;

  const lista = state.instituciones.filter(i => {
    if (cat && i.categoria !== cat) return false;
    if (!q) return true;
    return [i.nombre, i.direccion, i.direccion_complemento, i.comuna, i.barrio, i.programa]
      .some(v => v && v.toLowerCase().includes(q));
  });

  if (!lista.length) {
    const hint = esAdmin
      ? 'Crea la primera con el botón "Nueva institución"'
      : 'Prueba otro filtro o término de búsqueda.';
    $('tabla-inst-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🏛</div><h3>Sin instituciones</h3><p>${hint}</p></div>`;
    return;
  }

  const badgeMap = { discapacidad:['badge-disc','♿ Disc'], cuidado:['badge-cuid','💚 Cuid'], mesa:['badge-mesa','🤝 Mesa'] };
  const thAcc = esAdmin ? '<th style="width:90px">Acciones</th>' : '';

  $('tabla-inst-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Cat.</th><th>Nombre</th><th>Comuna</th><th>Barrio</th><th>Dirección</th>
          <th>Teléfono</th><th>Geo</th>${thAcc}
        </tr>
      </thead>
      <tbody>
        ${lista.map(i => {
          const [cls, lbl] = badgeMap[i.categoria] || ['',''];
          const geo = i.sin_sede
            ? '<span title="Sin sede física (listado aparte en mapa)">🏛</span>'
            : tieneCoordenadasInst(i)
              ? '<span title="Coordenadas válidas en Medellín (visible en mapa)">📌</span>'
              : (i.latitud != null || i.longitud != null)
                ? '<span title="Tiene lat/lon pero no válidas: edita, geocodifica y guarda">⚠</span>'
                : '—';
          const acc = esAdmin
            ? `<td>
              <div class="tabla-acciones">
                <button class="icon-btn" data-edit-inst="${i.id}" title="Editar">✏️</button>
                <button class="icon-btn danger" data-del-inst="${i.id}" title="Borrar">🗑</button>
              </div>
            </td>`
            : '';
          return `<tr>
            <td><span class="badge ${cls}">${lbl}</span></td>
            <td><strong>${escapar(i.nombre)}</strong>${i.programa ? `<div style="color:var(--txt2);font-size:11px">${escapar(i.programa)}</div>` : ''}</td>
            <td>${escapar(i.comuna || '—')}</td>
            <td>${escapar(i.barrio || '—')}</td>
            <td>${escapar([i.direccion, i.direccion_complemento].filter(Boolean).join(' · ') || '—')}</td>
            <td>${escapar(textoTelefonos(i.telefono) || '—')}</td>
            <td style="text-align:center">${geo}</td>
            ${acc}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  if (esAdmin) {
    document.querySelectorAll('[data-edit-inst]').forEach(b =>
      b.addEventListener('click', () => editarInstitucion(b.dataset.editInst))
    );
    document.querySelectorAll('[data-del-inst]').forEach(b =>
      b.addEventListener('click', () => borrarInstitucion(b.dataset.delInst))
    );
  }
}

$('busc-inst').addEventListener('input', renderInstituciones);
$('filt-cat-inst').addEventListener('change', renderInstituciones);

function actualizarBotonesQuitarTelefonoLista(listId) {
  const rows = document.querySelectorAll(`#${listId} .tel-row`);
  const soloUno = rows.length <= 1;
  rows.forEach((row) => {
    const btn = row.querySelector('.tel-row-del');
    if (btn) {
      btn.disabled = soloUno;
      btn.title = soloUno ? 'Debe quedar al menos un campo' : 'Quitar este teléfono';
    }
  });
}

function agregarFilaTelefonoLista(listId, inputClass, valor = '') {
  const list = $(listId);
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'tel-row';
  row.innerHTML = `
    <input type="tel" class="${inputClass}" placeholder="Ej: 604 123 4567" value="${escapar(valor)}" autocomplete="tel">
    <button type="button" class="tel-row-del" title="Quitar este teléfono" aria-label="Quitar teléfono">×</button>`;
  row.querySelector('.tel-row-del').addEventListener('click', () => {
    row.remove();
    if (!list.querySelector('.tel-row')) agregarFilaTelefonoLista(listId, inputClass, '');
    actualizarBotonesQuitarTelefonoLista(listId);
  });
  list.appendChild(row);
  actualizarBotonesQuitarTelefonoLista(listId);
}

function cargarTelefonosLista(listId, inputClass, raw) {
  const list = $(listId);
  if (!list) return;
  list.innerHTML = '';
  const nums = parseTelefonos(raw);
  if (!nums.length) agregarFilaTelefonoLista(listId, inputClass, '');
  else nums.forEach((n) => agregarFilaTelefonoLista(listId, inputClass, n));
}

function leerTelefonosLista(listId, inputClass) {
  return [...document.querySelectorAll(`#${listId} .${inputClass}`)]
    .map((inp) => inp.value.trim())
    .filter(Boolean);
}

function cargarTelefonosInst(raw) {
  cargarTelefonosLista('inst-telefonos-list', 'inst-tel-input', raw);
}

function leerTelefonosInst() {
  return leerTelefonosLista('inst-telefonos-list', 'inst-tel-input');
}

function cargarTelefonosProd(raw) {
  cargarTelefonosLista('prod-telefonos-list', 'prod-tel-input', raw);
}

function leerTelefonosProd() {
  return leerTelefonosLista('prod-telefonos-list', 'prod-tel-input');
}

/** Resumen para tabla admin (productos). */
function resumenContactoProducto(p) {
  const partes = [];
  if (p.contacto_persona) partes.push(p.contacto_persona);
  const t = textoTelefonos(p.telefono);
  if (t) partes.push(t);
  if (p.email) partes.push(p.email);
  if (p.pagina_web) partes.push(p.pagina_web);
  if (partes.length) return partes.join(' · ');
  return p.contacto || '';
}

/** Rellena formulario producto; separa campo legado contacto si hace falta. */
function rellenarContactoProducto(p) {
  let persona = p.contacto_persona || '';
  let email = p.email || '';
  let web = p.pagina_web || '';
  let telefono = p.telefono || '';

  if (!persona && !email && !web && !telefono && p.contacto) {
    const legacy = String(p.contacto).trim();
    const partes = legacy.split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);
    const mails = partes.filter((x) => x.includes('@'));
    const urls = partes.filter((x) => /^https?:\/\//i.test(x) || /^www\./i.test(x) || (x.includes('.') && !x.includes('@')));
    const sinMailUrl = partes.filter((x) => !mails.includes(x) && !urls.includes(x));
    if (mails.length) email = mails.join(' ');
    if (urls.length) web = urls[0];
    const nums = parseTelefonos(sinMailUrl.join(' ') || legacy);
    if (nums.length && nums[0] !== legacy) telefono = nums.join('\n');
    else if (sinMailUrl.length && /^\d[\d\s\-+()]+$/.test(sinMailUrl.join(''))) {
      telefono = sinMailUrl.join(' ');
    } else if (!mails.length && !urls.length) {
      persona = legacy;
    }
  }

  if (!web && email) {
    const split = String(email).split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);
    const urls = split.filter((x) => /^https?:\/\//i.test(x) || /^www\./i.test(x) || (x.includes('.') && !x.includes('@')));
    const mails = split.filter((x) => x.includes('@'));
    if (urls.length) {
      web = urls[0];
      email = mails.join(' ') || '';
    }
  }

  $('prod-contacto_persona').value = persona;
  $('prod-email').value = email || '';
  $('prod-pagina_web').value = web || '';
  cargarTelefonosProd(telefono);
}

if (esAdmin) {
  $('btn-inst-tel-add')?.addEventListener('click', () => agregarFilaTelefonoLista('inst-telefonos-list', 'inst-tel-input', ''));
  $('btn-prod-tel-add')?.addEventListener('click', () => agregarFilaTelefonoLista('prod-telefonos-list', 'prod-tel-input', ''));

  $('btn-nueva-inst').addEventListener('click', () => {
    $('modal-inst-titulo').textContent = 'Nueva institución';
    $('form-inst').reset();
    $('inst-id').value = '';
    $('inst-sin_sede').checked = false;
    syncSinSedeCamposInst();
    limpiarChecksCatalogos();
    cargarTelefonosInst(null);
    abrirModal('modal-inst');
  });
}

async function editarInstitucion(id) {
  if (!esAdmin) return;
  const i = state.instituciones.find(x => x.id === id);
  if (!i) return;
  resetGeocodUI();
  $('modal-inst-titulo').textContent = 'Editar institución';
  $('inst-id').value = i.id;

  // Llenar todos los campos
  const campos = [
    'categoria','nombre','programa','tipo_organizacion','direccion','direccion_complemento','comuna','barrio',
    'latitud','longitud','contacto_persona','servicios','costo',
    'cupos','cobertura','poblacion_objetivo','requisitos','sector',
    'nivel_relacionamiento_pp','eje_pp_1','dimension_pp',
  ];
  campos.forEach(c => {
    const el = $(`inst-${c}`);
    if (el) el.value = i[c] ?? '';
  });
  rellenarContactoInstitucion(i);
  cargarTelefonosInst(i.telefono);
  if (i.latitud != null) $('inst-latitud').value = i.latitud;
  if (i.longitud != null) $('inst-longitud').value = i.longitud;
  limpiarChecksCatalogos();

  const [{ data: rowsSrv }, { data: rowsDisc }] = await Promise.all([
    supabase.from('institucion_servicio').select('servicio_id').eq('institucion_id', id),
    supabase.from('institucion_discapacidad').select('tipo_discapacidad_id').eq('institucion_id', id),
  ]);
  const sset = new Set((rowsSrv || []).map((r) => r.servicio_id));
  const dset = new Set((rowsDisc || []).map((r) => r.tipo_discapacidad_id));
  document.querySelectorAll('#inst-servicios-cat input[type=checkbox]').forEach(inp => {
    inp.checked = sset.has(inp.value);
  });
  document.querySelectorAll('#inst-discapacidad-cat input[type=checkbox]').forEach(inp => {
    inp.checked = dset.has(inp.value);
  });
  if (!dset.size && (i.tipos_discapacidad || []).length) {
    marcarDiscSegunLegacy(i.tipos_discapacidad);
  }

  $('inst-atiende_persona_discapacidad').checked = !!i.atiende_persona_discapacidad;
  $('inst-atiende_familia').checked              = !!i.atiende_familia;
  $('inst-atiende_publico_general').checked      = !!i.atiende_publico_general;
  $('inst-sin_sede').checked = !!i.sin_sede;
  syncSinSedeCamposInst();

  abrirModal('modal-inst');
  const la = parseFloat(String($('inst-latitud').value || '').replace(',', '.'));
  const lo = parseFloat(String($('inst-longitud').value || '').replace(',', '.'));
  if (!i.sin_sede && Number.isFinite(la) && Number.isFinite(lo)) {
    setTimeout(() => {
      const wrap = $('geocod-mapa-wrap');
      if (wrap) wrap.style.display = 'block';
      _inicializarMiniMapa(la, lo);
    }, 280);
  }
}

$('btn-guardar-inst').addEventListener('click', async () => {
  if (!esAdmin) return;
  const form = $('form-inst');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const id           = $('inst-id').value;
  const srvChecked   = [...document.querySelectorAll('#inst-servicios-cat input:checked')].map((c) => c.value);
  const discChecked  = [...document.querySelectorAll('#inst-discapacidad-cat input:checked')].map((c) => c.value);
  const discEtiquetas = state.discCatalogo
    .filter((d) => discChecked.includes(d.id))
    .map((d) => d.etiqueta);

  const sinSede = $('inst-sin_sede').checked;
  const latGuardar = sinSede ? null : parseCoordInput('inst-latitud');
  const lonGuardar = sinSede ? null : parseCoordInput('inst-longitud');
  let comunaGuardar = sinSede ? CODIGO_COMUNA_SIN_SEDE_FISICA : ($('inst-comuna').value.trim() || null);
  if (!sinSede && latGuardar != null && lonGuardar != null && !coordenadasEnMedellin(latGuardar, lonGuardar)) {
    comunaGuardar = CODIGO_COMUNA_FUERA_MEDELLIN;
  }

  const payload = {
    categoria:                    $('inst-categoria').value,
    nombre:                       $('inst-nombre').value.trim(),
    programa:                     $('inst-programa').value.trim() || null,
    tipo_organizacion:            $('inst-tipo_organizacion').value.trim() || null,
    direccion:                    sinSede ? DIRECCION_SIN_NOMENCLATURA : ($('inst-direccion').value.trim() || null),
    direccion_complemento:        sinSede ? null : ($('inst-direccion_complemento').value.trim() || null),
    comuna:                       comunaGuardar,
    barrio:                       $('inst-barrio').value.trim() || null,
    sin_sede:                     sinSede,
    latitud:                      latGuardar,
    longitud:                     lonGuardar,
    telefono:                     serializarTelefonos(leerTelefonosInst()),
    email:                        $('inst-email').value.trim() || null,
    pagina_web:                   normalizarPaginaWeb($('inst-pagina_web').value),
    contacto_persona:             $('inst-contacto_persona').value.trim() || null,
    servicios:                    $('inst-servicios').value.trim() || null,
    costo:                        $('inst-costo').value.trim() || null,
    cupos:                        $('inst-cupos').value.trim() || null,
    cobertura:                    $('inst-cobertura').value.trim() || null,
    poblacion_objetivo:           $('inst-poblacion_objetivo').value.trim() || null,
    requisitos:                   $('inst-requisitos').value.trim() || null,
    sector:                       $('inst-sector').value.trim() || null,
    nivel_relacionamiento_pp:     $('inst-nivel_relacionamiento_pp').value.trim() || null,
    eje_pp_1:                     $('inst-eje_pp_1').value.trim() || null,
    dimension_pp:                 $('inst-dimension_pp').value.trim() || null,
    tipos_discapacidad:           discEtiquetas.length ? discEtiquetas : null,
    atiende_persona_discapacidad: $('inst-atiende_persona_discapacidad').checked,
    atiende_familia:              $('inst-atiende_familia').checked,
    atiende_publico_general:      $('inst-atiende_publico_general').checked,
    actualizado_por:              session.user.id,
  };

  let instId = id || null;

  if (id) {
    const res = await supabase.from('instituciones').update(payload).eq('id', id);
    if (res.error) { toast(`Error: ${res.error.message}`, 'error'); return; }
  }
  else {
    payload.creado_por = session.user.id;
    const res = await supabase.from('instituciones').insert(payload).select('id').single();
    if (res.error) { toast(`Error: ${res.error.message}`, 'error'); return; }
    instId = res.data.id;
  }

  async function syncJunction(tabla, fkField, ids) {
    const { error: delErr } = await supabase.from(tabla).delete().eq('institucion_id', instId);
    if (delErr) throw delErr;
    if (!ids.length) return;
    const chunk = ids.map((x) => ({
      institucion_id: instId,
      [fkField]:      x,
    }));
    const { error: insErr } = await supabase.from(tabla).insert(chunk);
    if (insErr) throw insErr;
  }

  try {
    await syncJunction('institucion_servicio', 'servicio_id', srvChecked);
    await syncJunction('institucion_discapacidad', 'tipo_discapacidad_id', discChecked);
  }
  catch (e) {
    toast(`Guardado parcial: institución grabada pero no las categorías (${e.message || e}). ¿Migraciones SQL y permisos admin?`, 'error');
    return;
  }

  toast(id ? 'Institución actualizada' : 'Institución creada');
  cerrarModal('modal-inst');
  state.instCargadas = false;
  cargarInstituciones();
});

async function borrarInstitucion(id) {
  if (!esAdmin) return;
  const i = state.instituciones.find(x => x.id === id);
  if (!i) return;
  if (!confirm(`¿Borrar "${i.nombre}"? Esta acción no se puede deshacer.`)) return;

  const { error } = await supabase.from('instituciones').delete().eq('id', id);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast('Institución borrada');
  state.instituciones = state.instituciones.filter(x => x.id !== id);
  renderInstituciones();
}

// =====================================================================
//  PRODUCTOS
// =====================================================================

/** Categorías distintas ya usadas en productos_apoyo.categoria (del CSV / altas previas). */
function categoriasProductosExistentes() {
  const set = new Set();
  for (const p of state.productos || []) {
    const c = String(p.categoria || '').trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

function renderCategoriasProductoDatalist() {
  const dl = $('prod-categorias-list');
  if (!dl) return;
  dl.innerHTML = categoriasProductosExistentes()
    .map((c) => `<option value="${escapar(c)}"></option>`)
    .join('');
}

async function cargarProductos() {
  const prodRes = await supabase.from('productos_apoyo').select('*').order('proveedor', { ascending: true });

  if (prodRes.error) {
    $('tabla-prod-wrap').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${prodRes.error.message}</p></div>`;
    return;
  }
  state.productos = prodRes.data || [];
  state.prodCargados = true;
  renderCategoriasProductoDatalist();
  renderProductos();
}

function renderProductos() {
  const q = ($('busc-prod').value || '').toLowerCase();
  const lista = state.productos.filter(p => {
    if (!q) return true;
    const catLbl = etiquetaProducto(p);
    return [p.proveedor, p.categoria, catLbl, p.oferta, p.direccion, p.comuna, p.barrio]
      .some(v => v && v.toLowerCase().includes(q));
  });

  if (!lista.length) {
    const hint = esAdmin
      ? 'Crea el primero con el botón "Nuevo producto"'
      : 'Prueba otro término de búsqueda.';
    $('tabla-prod-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🦽</div><h3>Sin productos</h3><p>${hint}</p></div>`;
    return;
  }

  const thAccP = esAdmin ? '<th style="width:90px">Acciones</th>' : '';

  $('tabla-prod-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Categoría</th><th>Proveedor</th><th>Comuna</th><th>Barrio</th><th>Oferta</th><th>Contacto</th><th>Geo</th>
          ${thAccP}
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => {
          const acc = esAdmin
            ? `<td>
            <div class="tabla-acciones">
              <button class="icon-btn" data-edit-prod="${p.id}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-del-prod="${p.id}" title="Borrar">🗑</button>
            </div>
          </td>`
            : '';
          const geo = p.latitud != null && p.longitud != null ? '📌' : '—';
          return `<tr>
          <td><span class="badge badge-prod">${escapar(etiquetaProducto(p) || '—')}</span></td>
          <td><strong>${escapar(p.proveedor)}</strong></td>
          <td>${escapar(p.comuna || '—')}</td>
          <td>${escapar(p.barrio || '—')}</td>
          <td style="max-width:280px">${escapar((p.oferta || '').slice(0, 120))}${p.oferta && p.oferta.length > 120 ? '…' : ''}</td>
          <td>${escapar(resumenContactoProducto(p) || '—')}</td>
          <td style="text-align:center">${geo}</td>
          ${acc}
        </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  if (esAdmin) {
    document.querySelectorAll('[data-edit-prod]').forEach(b =>
      b.addEventListener('click', () => editarProducto(b.dataset.editProd))
    );
    document.querySelectorAll('[data-del-prod]').forEach(b =>
      b.addEventListener('click', () => borrarProducto(b.dataset.delProd))
    );
  }
}

$('busc-prod').addEventListener('input', renderProductos);

function etiquetaProducto(p) {
  return String(p?.categoria || '').trim();
}

if (esAdmin) {
  $('btn-nuevo-prod').addEventListener('click', () => {
    $('modal-prod-titulo').textContent = 'Nuevo producto';
    $('form-prod').reset();
    $('prod-id').value = '';
    $('prod-categoria').value = '';
    resetGeocodProdUI();
    renderCategoriasProductoDatalist();
    rellenarContactoProducto({});
    abrirModal('modal-prod');
  });
}

function editarProducto(id) {
  if (!esAdmin) return;
  const p = state.productos.find(x => x.id === id);
  if (!p) return;
  $('modal-prod-titulo').textContent = 'Editar producto';
  $('prod-id').value = p.id;
  renderCategoriasProductoDatalist();
  $('prod-categoria').value = etiquetaProducto(p);
  $('prod-proveedor').value = p.proveedor || '';
  $('prod-oferta').value = p.oferta || '';
  rellenarContactoProducto(p);
  $('prod-direccion').value = p.direccion || '';
  $('prod-direccion_complemento').value = p.direccion_complemento || '';
  $('prod-comuna').value = p.comuna || '';
  $('prod-barrio').value = p.barrio || '';
  $('prod-latitud').value = p.latitud ?? '';
  $('prod-longitud').value = p.longitud ?? '';
  resetGeocodProdUI();
  if (p.latitud != null && p.longitud != null) {
    _mostrarBadgesAutoProd(true);
    const wrap = $('prod-geocod-mapa-wrap');
    if (wrap) wrap.style.display = 'block';
    _inicializarMiniMapaProd(Number(p.latitud), Number(p.longitud));
  }
  abrirModal('modal-prod');
}

$('btn-guardar-prod').addEventListener('click', async () => {
  if (!esAdmin) return;
  const form = $('form-prod');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const id = $('prod-id').value;
  const categoria = $('prod-categoria').value.trim();
  if (!categoria) {
    toast('Indica la categoría del producto', 'error');
    return;
  }
  const latRaw = $('prod-latitud').value;
  const lngRaw = $('prod-longitud').value;

  const payload = {
    catalogo_producto_id: null,
    categoria,
    proveedor: $('prod-proveedor').value.trim(),
    oferta: $('prod-oferta').value.trim() || null,
    contacto_persona: $('prod-contacto_persona').value.trim() || null,
    telefono: serializarTelefonos(leerTelefonosProd()),
    email: $('prod-email').value.trim() || null,
    pagina_web: normalizarPaginaWeb($('prod-pagina_web').value),
    contacto: null,
    direccion: $('prod-direccion').value.trim() || null,
    direccion_complemento: $('prod-direccion_complemento').value.trim() || null,
    comuna: $('prod-comuna').value.trim() || null,
    barrio: $('prod-barrio').value.trim() || null,
    latitud: latRaw !== '' ? Number(latRaw) : null,
    longitud: lngRaw !== '' ? Number(lngRaw) : null,
    actualizado_por: session.user.id,
  };

  let res;
  if (id) {
    res = await supabase.from('productos_apoyo').update(payload).eq('id', id);
  } else {
    payload.creado_por = session.user.id;
    res = await supabase.from('productos_apoyo').insert(payload);
  }
  if (res.error) { toast(`Error: ${res.error.message}`, 'error'); return; }
  toast(id ? 'Producto actualizado' : 'Producto creado');
  cerrarModal('modal-prod');
  state.prodCargados = false;
  cargarProductos();
});

async function borrarProducto(id) {
  if (!esAdmin) return;
  const p = state.productos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Borrar "${p.proveedor}"? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('productos_apoyo').delete().eq('id', id);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast('Producto borrado');
  state.productos = state.productos.filter(x => x.id !== id);
  renderProductos();
}

// =====================================================================
//  USUARIOS
// =====================================================================

async function cargarUsuarios() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, cedula, rol, activo, creado_en')
    .order('creado_en', { ascending: false });

  if (error) {
    $('tabla-user-wrap').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${error.message}</p></div>`;
    return;
  }
  state.usuarios      = data || [];
  state.usersCargados = true;
  renderUsuarios();
}

function renderUsuarios() {
  const q = ($('busc-user').value || '').toLowerCase();
  const lista = state.usuarios.filter(u => {
    if (!q) return true;
    const hay = `${u.nombre_completo || ''} ${u.cedula || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (!lista.length) {
    $('tabla-user-wrap').innerHTML = `<div class="empty"><div class="empty-ico">👥</div><h3>Sin usuarios</h3><p>Crea uno con el botón "Nuevo usuario"</p></div>`;
    return;
  }

  $('tabla-user-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nombre</th><th>Documento</th><th>Rol</th><th>Estado</th><th>Creado</th><th style="width:90px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(u => {
          const fecha = new Date(u.creado_en).toLocaleDateString('es-CO');
          const eres  = u.id === perfil.id;
          return `<tr>
            <td><strong>${escapar(u.nombre_completo)}</strong>${eres ? ' <span style="color:var(--txt2);font-size:10px">(tú)</span>' : ''}</td>
            <td style="font-size:11px;color:var(--txt2)">${escapar(u.cedula || '—')}</td>
            <td><span class="badge badge-${u.rol}">${u.rol === 'admin' ? 'Administrador' : 'Consulta'}</span></td>
            <td><span class="badge badge-${u.activo ? 'activo' : 'inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>${fecha}</td>
            <td>
              <div class="tabla-acciones">
                <button class="icon-btn" data-edit-user="${u.id}" title="Editar">✏️</button>
                ${eres ? '' : `<button class="icon-btn danger" data-del-user="${u.id}" title="Borrar">🗑</button>`}
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('[data-edit-user]').forEach(b =>
    b.addEventListener('click', () => editarUsuario(b.dataset.editUser))
  );
  document.querySelectorAll('[data-del-user]').forEach(b =>
    b.addEventListener('click', () => borrarUsuario(b.dataset.delUser))
  );
}

if (esAdmin) {
  $('busc-user').addEventListener('input', renderUsuarios);
}

function syncPasswordRulesUsuario() {
  const pw = $('user-password-input');
  const hint = $('hint-password-user');
  if (!pw || !hint) return;
  if ($('user-id').value) return;
  if ($('user-rol-input').value === 'consulta') {
    pw.minLength = 5;
    hint.textContent = 'Consulta: mínimo 5 caracteres. Administrador: mínimo 8.';
  } else {
    pw.minLength = 8;
    hint.textContent = 'Administrador: mínimo 8 caracteres.';
  }
}

if (esAdmin) {
  $('user-rol-input').addEventListener('change', syncPasswordRulesUsuario);
}

if (esAdmin) {
  $('btn-nuevo-user').addEventListener('click', () => {
    $('modal-user-titulo').textContent = 'Nuevo usuario';
    $('form-user').reset();
    $('user-id').value = '';
    $('field-email').style.display     = 'block';
    $('field-password').style.display  = 'block';
    $('field-cedula').style.display    = 'block';
    $('user-email-input').required     = true;
    $('user-password-input').required  = true;
    $('user-rol-input').value          = 'consulta';
    $('user-activo-input').value       = 'true';
    $('user-cedula-input').value       = '';
    syncPasswordRulesUsuario();
    abrirModal('modal-user');
  });
}

function editarUsuario(id) {
  if (!esAdmin) return;
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return;
  $('modal-user-titulo').textContent = 'Editar usuario';
  $('user-id').value           = u.id;
  $('user-nombre-input').value = u.nombre_completo;
  $('user-rol-input').value    = u.rol;
  $('user-activo-input').value = String(u.activo);
  $('user-cedula-input').value = u.cedula || '';
  // Email y contraseña no se editan desde aquí (Supabase Auth)
  $('field-email').style.display    = 'none';
  $('field-password').style.display = 'none';
  $('field-cedula').style.display    = 'block';
  $('user-email-input').required    = false;
  $('user-password-input').required = false;
  abrirModal('modal-user');
}

$('btn-guardar-user').addEventListener('click', async () => {
  if (!esAdmin) return;
  const id = $('user-id').value;
  const nombre = $('user-nombre-input').value.trim();
  const rol    = $('user-rol-input').value;
  const activo = $('user-activo-input').value === 'true';

  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }

  const cedulaDigits = ($('user-cedula-input').value || '').replace(/\D/g, '');

  if (id) {
    // EDITAR perfil existente
    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre_completo: nombre,
        rol,
        activo,
        cedula: cedulaDigits || null,
      })
      .eq('id', id);
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }
    toast('Usuario actualizado');
  } else {
    // CREAR usuario nuevo: requiere llamar al endpoint serverless
    const email    = $('user-email-input').value.trim();
    const password = $('user-password-input').value;
    const minPw    = rol === 'consulta' ? 5 : 8;
    if (!email || password.length < minPw) {
      toast(
        rol === 'consulta'
          ? 'Correo y contraseña (mínimo 5 caracteres para consulta) son obligatorios'
          : 'Correo y contraseña (mínimo 8 caracteres para administrador) son obligatorios',
        'error',
      );
      return;
    }

    const token = await bearerToken();
    if (!token) {
      toast('Sesión expirada. Vuelve a iniciar sesión.', 'error');
      return;
    }
    const respuesta = await fetch('/api/crear-usuario', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        email,
        password,
        nombre_completo: nombre,
        rol,
        activo,
        ...(cedulaDigits ? { cedula: cedulaDigits } : {}),
      }),
    });
    if (!respuesta.ok) {
      toast(`Error: ${await parseApiError(respuesta)}`, 'error');
      return;
    }
    toast('Usuario creado');
  }

  cerrarModal('modal-user');
  state.usersCargados = false;
  cargarUsuarios();
});

async function borrarUsuario(id) {
  if (!esAdmin) return;
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return;
  if (u.id === perfil.id) { toast('No puedes borrarte a ti mismo', 'error'); return; }
  if (!confirm(`¿Borrar a "${u.nombre_completo}"? Esta acción no se puede deshacer.`)) return;

  const token = await bearerToken();
  if (!token) {
    toast('Sesión expirada. Vuelve a iniciar sesión.', 'error');
    return;
  }
  const respuesta = await fetch('/api/crear-usuario', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: id }),
  });
  if (!respuesta.ok) {
    toast(`Error: ${await parseApiError(respuesta)}`, 'error');
    return;
  }

  toast('Usuario borrado');
  state.usuarios = state.usuarios.filter(x => x.id !== id);
  renderUsuarios();
}

// ---------------------------------------------------------------------
//  Util
// ---------------------------------------------------------------------
function escapar(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

// Cargar la primera pestaña
cargarInstituciones();
