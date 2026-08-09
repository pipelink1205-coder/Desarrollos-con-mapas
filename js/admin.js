// =====================================================================
//  PANEL DE ADMINISTRACIÓN / DIRECTORIO (solo lectura para rol consulta)
// =====================================================================
//  Super admin: instituciones, productos y usuarios. Admin editor: CRUD sin usuarios. Consulta: solo lectura.
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
  opcionesMapaValle,
  opcionesTileValle,
} from './codigos-ubicacion.js';
import { parseTelefonos, serializarTelefonos, textoTelefonos } from './telefonos.js';
import { parseEmails, serializarEmails, textoEmails } from './emails.js';
import { normalizarCedulaUsuario, validarCedulaUsuario } from './usuario-auth.js';

const { perfil, session } = await requireAuth({ rolesPermitidos: ['admin', 'super_admin', 'consulta'] });
const esSuperAdmin = perfil.rol === 'super_admin';
const esAdmin = esSuperAdmin || perfil.rol === 'admin';

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
  const tabDes = document.getElementById('tab-inst-desactivadas');
  if (tabDes) tabDes.style.display = 'none';
  const pageDes = document.getElementById('page-inst-desactivadas');
  if (pageDes) pageDes.hidden = true;
  ['btn-nueva-inst', 'btn-nuevo-prod'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
if (!esSuperAdmin) {
  const tabU = document.getElementById('tab-usuarios');
  if (tabU) tabU.style.display = 'none';
  const pageU = document.getElementById('page-usuarios');
  if (pageU) pageU.hidden = true;
  const btnNew = document.getElementById('btn-nuevo-user');
  if (btnNew) btnNew.style.display = 'none';
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

function etiquetaFuenteGeocod(fuente) {
  if (fuente === 'alcaldia') return 'Alcaldía de Medellín (Planeación / catastro)';
  if (fuente === 'arcgis') return 'ArcGIS / Esri (respaldo)';
  return 'OpenStreetMap (respaldo)';
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
  let emailRaw = i.email || '';
  let web = i.pagina_web || '';
  if (!web && emailRaw) {
    const partes = String(emailRaw).split(/[\s,;|]+/).map((x) => x.trim()).filter(Boolean);
    const urls = partes.filter((p) => /^https?:\/\//i.test(p) || /^www\./i.test(p) || (p.includes('.') && !p.includes('@')));
    const mails = partes.filter((p) => p.includes('@'));
    if (urls.length) {
      web = urls[0];
      emailRaw = mails.length ? serializarEmails(mails) : null;
    }
  }
  cargarEmailsInst(emailRaw);
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
    _geocodMap = L.map('geocod-mapa', opcionesMapaValle(L, { zoomControl: true, attributionControl: true }));
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opcionesTileValle(L, {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    })).addTo(_geocodMap);
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
      if (r.fuente === 'alcaldia') {
        $('inst-comuna').value = r.comuna;
      } else if (numAntes != null && numGeo != null && numAntes !== numGeo) {
        avisoComuna =
          ` · Atención: el punto quedó en comuna ${numGeo} (${r.comuna}), no en la ${numAntes} que tenías. ` +
          'No cambiamos el campo Comuna: revisa la dirección o arrastra el marcador. Si el punto es correcto, actualiza Comuna a mano.';
      } else {
        $('inst-comuna').value = r.comuna;
      }
    }
    if (r.barrio) $('inst-barrio').value = r.barrio;
    _mostrarBadgesAuto(true);

    const fuenteLabel = etiquetaFuenteGeocod(r.fuente);
    const iconoConf   = r.confianza === 'alta' ? '✅' : '⚠️';
    const textoConf   = r.confianza === 'alta' ? 'alta — ubicación confiable'
      : r.confianza === 'media' ? 'media — verifica en el mapa'
        : 'baja — ajusta manualmente el marcador';

    const partesZona = [];
    if (r.comuna) partesZona.push(`Comuna: ${r.comuna}`);
    if (r.barrio) partesZona.push(`Barrio: ${r.barrio}`);
    if (r.dirEncasillada) partesZona.push(`Dir. oficial: ${r.dirEncasillada}`);
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
    _prodGeocodMap = L.map('prod-geocod-mapa', opcionesMapaValle(L, { zoomControl: true, attributionControl: true }));
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', opcionesTileValle(L)).addTo(_prodGeocodMap);
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
      const extra = [
        etiquetaFuenteGeocod(r.fuente),
        r.comuna && `Comuna: ${r.comuna}`,
        r.barrio && `Barrio: ${r.barrio}`,
        r.dirEncasillada && `Dir. oficial: ${r.dirEncasillada}`,
      ].filter(Boolean).join(' · ');
      _estadoGeocodProd(
        r.confianza === 'alta' ? 'ok' : 'parcial',
        `✅ Punto listo para el mapa · ${extra}`,
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
//  Ficha completa (solo lectura — admin y consulta)
// ---------------------------------------------------------------------
const CAT_FICHA = {
  discapacidad: ['badge-disc', '♿ Discapacidad'],
  cuidado: ['badge-cuid', '💚 Cuidado'],
  mesa: ['badge-mesa', '🤝 Mesa de cuidado'],
};

let fichaEditHandler = null;

function fichaTexto(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t || null;
}

function fichaEnlace(v) {
  const t = fichaTexto(v);
  if (!t) return '—';
  const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer">${escapar(t)}</a>`;
}

function fichaFila(label, value, opts = {}) {
  const t = opts.html ? value : fichaTexto(value);
  if (!t && !opts.always) return '';
  const val = opts.html ? value : escapar(t || '—');
  return `<div class="ficha-row"><div class="ficha-lbl">${escapar(label)}</div><div class="ficha-val">${val}</div></div>`;
}

function fichaBloque(titulo, filasHtml) {
  const html = filasHtml.filter(Boolean).join('');
  if (!html) return '';
  return `<div class="ficha-seccion"><div class="ficha-seccion-t">${escapar(titulo)}</div>${html}</div>`;
}

function fichaLista(items) {
  const list = (items || []).map(fichaTexto).filter(Boolean);
  if (!list.length) return null;
  return `<ul class="ficha-list">${list.map((x) => `<li>${escapar(x)}</li>`).join('')}</ul>`;
}

function textoGeoInst(i) {
  if (i.sin_sede) return 'Sin sede física (no aparece en el mapa)';
  if (tieneCoordenadasInst(i)) return `Visible en mapa · ${i.latitud}, ${i.longitud}`;
  if (i.latitud != null || i.longitud != null) return 'Coordenadas registradas pero no válidas para el mapa';
  return 'Sin geolocalizar';
}

function abrirFicha(titulo, categoria, bodyHtml, onEdit) {
  const badge = $('ficha-badge');
  const [cls, lbl] = CAT_FICHA[categoria] || ['', ''];
  if (lbl) {
    badge.className = `badge ${cls}`;
    badge.textContent = lbl;
    badge.hidden = false;
  } else if (categoria) {
    badge.className = 'badge badge-prod';
    badge.textContent = categoria;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
  $('ficha-titulo').textContent = titulo;
  $('ficha-body').innerHTML = bodyHtml;
  const btnEdit = $('btn-ficha-editar');
  if (esAdmin && onEdit) {
    btnEdit.style.display = '';
    fichaEditHandler = onEdit;
  } else {
    btnEdit.style.display = 'none';
    fichaEditHandler = null;
  }
  abrirModal('modal-ficha');
  $('modal-ficha')?.querySelector('.modal-x')?.focus();
}

async function verInstitucion(id) {
  const i = state.instituciones.find((x) => x.id === id);
  if (!i) return;

  let srvLabels = [];
  let discLabels = [];
  const [{ data: rowsSrv }, { data: rowsDisc }] = await Promise.all([
    supabase.from('institucion_servicio').select('servicio_id').eq('institucion_id', id),
    supabase.from('institucion_discapacidad').select('tipo_discapacidad_id').eq('institucion_id', id),
  ]);
  const sset = new Set((rowsSrv || []).map((r) => r.servicio_id));
  const dset = new Set((rowsDisc || []).map((r) => r.tipo_discapacidad_id));
  srvLabels = state.servicioCatalogo.filter((s) => sset.has(s.id)).map((s) => s.etiqueta);
  discLabels = state.discCatalogo.filter((d) => dset.has(d.id)).map((d) => d.etiqueta);
  if (!discLabels.length && (i.tipos_discapacidad || []).length) {
    discLabels = [...i.tipos_discapacidad];
  }

  const dir = [i.direccion, i.direccion_complemento].filter(Boolean).join(' · ');
  const audiencia = [];
  if (i.atiende_persona_discapacidad) audiencia.push('Persona con discapacidad');
  if (i.atiende_familia) audiencia.push('Familia');
  if (i.atiende_publico_general) audiencia.push('Público en general');

  const body = [
    !institucionActiva(i)
      ? fichaBloque('Estado del registro', [
          fichaFila('Visible en mapa', 'No — inactiva', { always: true }),
          fichaFila('Inactiva desde', fmtFechaRegistro(i.desactivado_en)),
        ])
      : '',
    fichaBloque('Identificación', [
      fichaFila('Tipo de organización', i.tipo_organizacion),
      fichaFila('Programa / proyecto', i.programa),
    ]),
    fichaBloque('Ubicación', [
      fichaFila('Sede física', i.sin_sede ? 'Sin sede física' : 'Con sede física', { always: true }),
      fichaFila('Dirección', dir),
      fichaFila('Comuna', i.comuna),
      fichaFila('Barrio', i.barrio),
      fichaFila('Geolocalización', textoGeoInst(i), { always: true }),
    ]),
    fichaBloque('Contacto', [
      fichaFila('Teléfonos', textoTelefonos(i.telefono)),
      fichaFila('Correos', textoEmails(i.email)),
      fichaFila('Página web', i.pagina_web ? fichaEnlace(i.pagina_web) : null, { html: !!fichaTexto(i.pagina_web) }),
      fichaFila('Persona de contacto', i.contacto_persona),
    ]),
    fichaBloque('Oferta', [
      srvLabels.length
        ? fichaFila('Servicios', fichaLista(srvLabels), { html: true, always: true })
        : fichaFila('Servicios', i.servicios),
      fichaFila('Costo', i.costo),
      fichaFila('Cupos', i.cupos),
      fichaFila('Cobertura', i.cobertura),
      fichaFila('Población objetivo', i.poblacion_objetivo),
      fichaFila('Requisitos', i.requisitos),
    ]),
    fichaBloque('Política pública', [
      fichaFila('Sector', i.sector),
      fichaFila('Relacionamiento PP', i.nivel_relacionamiento_pp),
      fichaFila('Eje PP', i.eje_pp_1),
      fichaFila('Dimensión PP', i.dimension_pp),
    ]),
    i.categoria === 'discapacidad'
      ? fichaBloque('Discapacidad', [
          discLabels.length
            ? fichaFila('Tipos atendidos', fichaLista(discLabels), { html: true, always: true })
            : '',
          audiencia.length
            ? fichaFila('Población atendida', audiencia.join(' · '), { always: true })
            : '',
        ])
      : '',
  ].join('');

  abrirFicha(i.nombre || 'Institución', i.categoria, body, () => {
    cerrarModal('modal-ficha');
    editarInstitucion(id);
  });
}

function verProducto(id) {
  const p = state.productos.find((x) => x.id === id);
  if (!p) return;

  const dir = [p.direccion, p.direccion_complemento].filter(Boolean).join(' · ');
  const geo = p.latitud != null && p.longitud != null
    ? `Coordenadas: ${p.latitud}, ${p.longitud}`
    : 'Sin geolocalizar';

  const body = [
    fichaBloque('Identificación', [
      fichaFila('Categoría', etiquetaProducto(p)),
      fichaFila('Proveedor', p.proveedor),
      fichaFila('Oferta / descripción', p.oferta),
    ]),
    fichaBloque('Contacto', [
      fichaFila('Persona de contacto', p.contacto_persona),
      fichaFila('Teléfonos', textoTelefonos(p.telefono)),
      fichaFila('Correos', textoEmails(p.email)),
      fichaFila('Página web', p.pagina_web ? fichaEnlace(p.pagina_web) : null, { html: !!fichaTexto(p.pagina_web) }),
      fichaFila('Contacto (legado)', p.contacto),
    ]),
    fichaBloque('Ubicación', [
      fichaFila('Dirección', dir),
      fichaFila('Comuna', p.comuna),
      fichaFila('Barrio', p.barrio),
      fichaFila('Geolocalización', geo, { always: true }),
    ]),
  ].join('');

  abrirFicha(p.proveedor || p.oferta || 'Producto', etiquetaProducto(p), body, () => {
    cerrarModal('modal-ficha');
    editarProducto(id);
  });
}

$('btn-ficha-editar')?.addEventListener('click', () => {
  if (fichaEditHandler) fichaEditHandler();
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
    if (tab.dataset.page === 'inst-desactivadas') {
      if (!state.instCargadas) cargarInstituciones();
      else renderInstDesactivadas();
    }
    if (tab.dataset.page === 'productos'     && !state.prodCargados) cargarProductos();
    if (esSuperAdmin && tab.dataset.page === 'usuarios' && !state.usersCargados) cargarUsuarios();
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
  instSort: { key: 'nombre', dir: 'asc' },
  instDesSort: { key: 'desactivado_en', dir: 'desc' },
  prodSort: { key: 'proveedor', dir: 'asc' },
};

function institucionActiva(i) {
  return i?.activo !== false;
}

function fmtFechaRegistro(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function alternarOrdenTabla(sortState, key) {
  if (sortState.key === key) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.key = key;
    sortState.dir = 'asc';
  }
}

function cmpTextoEs(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base', numeric: true });
}

/** Clave numérica para ordenar comunas 00, 1…16, corregimientos, 17 sin sede, vacías al final. */
function claveOrdenComuna(comuna) {
  const t = String(comuna || '').trim();
  if (!t || t === '—') return 10000;
  const up = t.toUpperCase();
  if (up.startsWith('00 -') || up === CODIGO_COMUNA_FUERA_MEDELLIN.toUpperCase()) return 0;
  if (up.includes('SIN SEDE FISICA') || up === CODIGO_COMUNA_SIN_SEDE_FISICA.toUpperCase()) return 17;
  const num = numeroComunaEnTexto(t);
  if (num != null) return num;
  return 9999;
}

function ordenarFilas(lista, sortState, getters) {
  const mul = sortState.dir === 'asc' ? 1 : -1;
  const get = getters[sortState.key] || getters.nombre;
  return [...lista].sort((a, b) => {
    let c = 0;
    if (sortState.key === 'comuna') {
      c = claveOrdenComuna(get(a)) - claveOrdenComuna(get(b));
      if (c === 0) c = cmpTextoEs(get(a), get(b));
    } else if (sortState.key === 'desactivado_en') {
      const ta = Date.parse(get(a) || '') || 0;
      const tb = Date.parse(get(b) || '') || 0;
      c = ta - tb;
    } else {
      c = cmpTextoEs(get(a), get(b));
    }
    if (c === 0) {
      const tieA = a.nombre || a.proveedor || '';
      const tieB = b.nombre || b.proveedor || '';
      c = cmpTextoEs(tieA, tieB);
    }
    return c * mul;
  });
}

function thOrdenable(label, key, sortState) {
  const activo = sortState.key === key;
  const flecha = activo ? (sortState.dir === 'asc' ? '↑' : '↓') : '↕';
  const aria = activo ? (sortState.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const titulo = activo
    ? `Orden ${sortState.dir === 'asc' ? 'ascendente' : 'descendente'}. Clic para invertir.`
    : `Ordenar por ${label}`;
  return `<th class="th-sort${activo ? ' activo' : ''}" aria-sort="${aria}">
    <button type="button" class="th-sort-btn" data-sort-key="${key}" title="${escapar(titulo)}" aria-label="Ordenar por ${escapar(label)}">
      ${escapar(label)} <span class="th-sort-ind" aria-hidden="true">${flecha}</span>
    </button>
  </th>`;
}

function enlazarOrdenTabla(wrapId, sortState, rerender) {
  const wrap = $(wrapId);
  if (!wrap) return;
  wrap.querySelectorAll('[data-sort-key]').forEach((btn) => {
    btn.addEventListener('click', () => {
      alternarOrdenTabla(sortState, btn.dataset.sortKey);
      rerender();
    });
  });
}

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
  if (document.getElementById('page-inst-desactivadas')?.classList.contains('active')) {
    renderInstDesactivadas();
  }
}

function renderInstituciones() {
  const q   = ($('busc-inst').value || '').toLowerCase();
  const cat = $('filt-cat-inst').value;

  const lista = ordenarFilas(
    state.instituciones.filter(i => {
    if (!institucionActiva(i)) return false;
    if (cat && i.categoria !== cat) return false;
    if (!q) return true;
    return [i.nombre, i.direccion, i.direccion_complemento, i.comuna, i.barrio, i.programa]
      .some(v => v && v.toLowerCase().includes(q));
    }),
    state.instSort,
    { nombre: (i) => i.nombre, comuna: (i) => i.comuna },
  );

  if (!lista.length) {
    const hint = esAdmin
      ? 'Crea la primera con el botón "Nueva institución"'
      : 'Prueba otro filtro o término de búsqueda.';
    $('tabla-inst-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🏛</div><h3>Sin instituciones</h3><p>${hint}</p></div>`;
    return;
  }

  const badgeMap = { discapacidad:['badge-disc','♿ Disc'], cuidado:['badge-cuid','💚 Cuid'], mesa:['badge-mesa','🤝 Mesa'] };
  const thAcc = `<th style="width:${esAdmin ? '132px' : '52px'}">Acciones</th>`;

  $('tabla-inst-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Cat.</th>${thOrdenable('Nombre', 'nombre', state.instSort)}${thOrdenable('Comuna', 'comuna', state.instSort)}<th>Barrio</th><th>Dirección</th>
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
          const acc = `<td>
              <div class="tabla-acciones">
                <button class="icon-btn ver" data-view-inst="${i.id}" title="Ver ficha completa" aria-label="Ver ficha completa de ${escapar(i.nombre)}">👁</button>
                ${esAdmin ? `<button class="icon-btn" data-edit-inst="${i.id}" title="Editar" aria-label="Editar institución ${escapar(i.nombre)}">✏️</button>
                <button class="icon-btn danger" data-desactivar-inst="${i.id}" title="Desactivar" aria-label="Desactivar institución ${escapar(i.nombre)}">🚫</button>` : ''}
              </div>
            </td>`;
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

  enlazarOrdenTabla('tabla-inst-wrap', state.instSort, renderInstituciones);

  document.querySelectorAll('[data-view-inst]').forEach((b) =>
    b.addEventListener('click', () => verInstitucion(b.dataset.viewInst))
  );
  if (esAdmin) {
    document.querySelectorAll('[data-edit-inst]').forEach(b =>
      b.addEventListener('click', () => editarInstitucion(b.dataset.editInst))
    );
    document.querySelectorAll('[data-desactivar-inst]').forEach(b =>
      b.addEventListener('click', () => desactivarInstitucion(b.dataset.desactivarInst))
    );
  }
}

function renderInstDesactivadas() {
  const wrap = $('tabla-inst-des-wrap');
  if (!wrap) return;

  const q   = ($('busc-inst-des')?.value || '').toLowerCase();
  const cat = $('filt-cat-inst-des')?.value || '';

  const lista = ordenarFilas(
    state.instituciones.filter((i) => {
      if (institucionActiva(i)) return false;
      if (cat && i.categoria !== cat) return false;
      if (!q) return true;
      return [i.nombre, i.direccion, i.comuna, i.barrio, i.programa]
        .some((v) => v && v.toLowerCase().includes(q));
    }),
    state.instDesSort,
    {
      nombre: (i) => i.nombre,
      comuna: (i) => i.comuna,
      desactivado_en: (i) => i.desactivado_en || '',
    },
  );

  if (!lista.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-ico">🚫</div><h3>Sin inactivas</h3><p>Las instituciones inactivadas desde el listado activo aparecerán aquí.</p></div>`;
    return;
  }

  const badgeMap = { discapacidad:['badge-disc','♿ Disc'], cuidado:['badge-cuid','💚 Cuid'], mesa:['badge-mesa','🤝 Mesa'] };

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Cat.</th>${thOrdenable('Nombre', 'nombre', state.instDesSort)}${thOrdenable('Comuna', 'comuna', state.instDesSort)}
          ${thOrdenable('Inactiva', 'desactivado_en', state.instDesSort)}<th>Barrio</th><th style="width:148px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((i) => {
          const [cls, lbl] = badgeMap[i.categoria] || ['',''];
          return `<tr style="opacity:.92">
            <td><span class="badge ${cls}">${lbl}</span></td>
            <td><strong>${escapar(i.nombre)}</strong>${i.programa ? `<div style="color:var(--txt2);font-size:11px">${escapar(i.programa)}</div>` : ''}</td>
            <td>${escapar(i.comuna || '—')}</td>
            <td><span class="badge badge-inactivo">${escapar(fmtFechaRegistro(i.desactivado_en))}</span></td>
            <td>${escapar(i.barrio || '—')}</td>
            <td>
              <div class="tabla-acciones">
                <button class="icon-btn ver" data-view-inst="${i.id}" title="Ver ficha" aria-label="Ver ficha de ${escapar(i.nombre)}">👁</button>
                <button class="icon-btn" data-edit-inst="${i.id}" title="Editar" aria-label="Editar ${escapar(i.nombre)}">✏️</button>
                <button class="icon-btn ver" data-reactivar-inst="${i.id}" title="Reactivar" aria-label="Reactivar ${escapar(i.nombre)}">♻️</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  enlazarOrdenTabla('tabla-inst-des-wrap', state.instDesSort, renderInstDesactivadas);

  wrap.querySelectorAll('[data-view-inst]').forEach((b) =>
    b.addEventListener('click', () => verInstitucion(b.dataset.viewInst))
  );
  wrap.querySelectorAll('[data-edit-inst]').forEach((b) =>
    b.addEventListener('click', () => editarInstitucion(b.dataset.editInst))
  );
  wrap.querySelectorAll('[data-reactivar-inst]').forEach((b) =>
    b.addEventListener('click', () => reactivarInstitucion(b.dataset.reactivarInst))
  );
}

$('busc-inst-des')?.addEventListener('input', renderInstDesactivadas);
$('filt-cat-inst-des')?.addEventListener('change', renderInstDesactivadas);

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
  const idx = list.querySelectorAll('.tel-row').length + 1;
  row.innerHTML = `
    <input type="tel" class="${inputClass}" placeholder="Ej: 604 123 4567" value="${escapar(valor)}" autocomplete="tel" aria-label="Teléfono ${idx}">
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

function actualizarBotonesQuitarEmailLista(listId) {
  const rows = document.querySelectorAll(`#${listId} .tel-row`);
  const soloUno = rows.length <= 1;
  rows.forEach((row) => {
    const btn = row.querySelector('.tel-row-del');
    if (btn) {
      btn.disabled = soloUno;
      btn.title = soloUno ? 'Debe quedar al menos un campo' : 'Quitar este correo';
    }
  });
}

function agregarFilaEmailLista(listId, inputClass, valor = '') {
  const list = $(listId);
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'tel-row';
  const idx = list.querySelectorAll('.tel-row').length + 1;
  row.innerHTML = `
    <input type="email" class="${inputClass}" placeholder="contacto@organizacion.org" value="${escapar(valor)}" autocomplete="email" aria-label="Correo ${idx}">
    <button type="button" class="tel-row-del" title="Quitar este correo" aria-label="Quitar correo">×</button>`;
  row.querySelector('.tel-row-del').addEventListener('click', () => {
    row.remove();
    if (!list.querySelector('.tel-row')) agregarFilaEmailLista(listId, inputClass, '');
    actualizarBotonesQuitarEmailLista(listId);
  });
  list.appendChild(row);
  actualizarBotonesQuitarEmailLista(listId);
}

function cargarEmailsLista(listId, inputClass, raw) {
  const list = $(listId);
  if (!list) return;
  list.innerHTML = '';
  const mails = parseEmails(raw);
  if (!mails.length) agregarFilaEmailLista(listId, inputClass, '');
  else mails.forEach((m) => agregarFilaEmailLista(listId, inputClass, m));
}

function leerEmailsLista(listId, inputClass) {
  return [...document.querySelectorAll(`#${listId} .${inputClass}`)]
    .map((inp) => inp.value.trim())
    .filter(Boolean);
}

function cargarEmailsInst(raw) {
  cargarEmailsLista('inst-emails-list', 'inst-email-input', raw);
}

function leerEmailsInst() {
  return leerEmailsLista('inst-emails-list', 'inst-email-input');
}

function cargarEmailsProd(raw) {
  cargarEmailsLista('prod-emails-list', 'prod-email-input', raw);
}

function leerEmailsProd() {
  return leerEmailsLista('prod-emails-list', 'prod-email-input');
}

/** Resumen para tabla admin (productos). */
function resumenContactoProducto(p) {
  const partes = [];
  if (p.contacto_persona) partes.push(p.contacto_persona);
  const t = textoTelefonos(p.telefono);
  if (t) partes.push(t);
  const e = textoEmails(p.email);
  if (e) partes.push(e);
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
    if (mails.length) email = serializarEmails(mails);
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
      email = mails.length ? serializarEmails(mails) : null;
    }
  }

  $('prod-contacto_persona').value = persona;
  cargarEmailsProd(email);
  $('prod-pagina_web').value = web || '';
  cargarTelefonosProd(telefono);
}

if (esAdmin) {
  $('btn-inst-tel-add')?.addEventListener('click', () => agregarFilaTelefonoLista('inst-telefonos-list', 'inst-tel-input', ''));
  $('btn-prod-tel-add')?.addEventListener('click', () => agregarFilaTelefonoLista('prod-telefonos-list', 'prod-tel-input', ''));
  $('btn-inst-email-add')?.addEventListener('click', () => agregarFilaEmailLista('inst-emails-list', 'inst-email-input', ''));
  $('btn-prod-email-add')?.addEventListener('click', () => agregarFilaEmailLista('prod-emails-list', 'prod-email-input', ''));

  $('btn-nueva-inst').addEventListener('click', () => {
    $('modal-inst-titulo').textContent = 'Nueva institución';
    $('form-inst').reset();
    $('inst-id').value = '';
    $('inst-sin_sede').checked = false;
    syncSinSedeCamposInst();
    limpiarChecksCatalogos();
    cargarTelefonosInst(null);
    cargarEmailsInst(null);
    $('inst-pagina_web').value = '';
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
    email:                        serializarEmails(leerEmailsInst()),
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

async function desactivarInstitucion(id) {
  if (!esAdmin) return;
  const i = state.instituciones.find(x => x.id === id);
  if (!i) return;
  if (!confirm(
    `¿Desactivar "${i.nombre}"?\n\nNo se borra el registro: quedará en el módulo Inactivas y saldrá del mapa y del directorio consulta.`,
  )) return;

  const { error } = await supabase.from('instituciones').update({
    activo: false,
    desactivado_en: new Date().toISOString(),
    desactivado_por: session.user.id,
    actualizado_por: session.user.id,
  }).eq('id', id);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast('Institución desactivada');
  state.instCargadas = false;
  cargarInstituciones();
}

async function reactivarInstitucion(id) {
  if (!esAdmin) return;
  const i = state.instituciones.find(x => x.id === id);
  if (!i) return;
  if (!confirm(`¿Reactivar "${i.nombre}"? Volverá al mapa y al directorio.`)) return;

  const { error } = await supabase.from('instituciones').update({
    activo: true,
    desactivado_en: null,
    desactivado_por: null,
    actualizado_por: session.user.id,
  }).eq('id', id);
  if (error) { toast(`Error: ${error.message}`, 'error'); return; }
  toast('Institución reactivada');
  state.instCargadas = false;
  cargarInstituciones();
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
  const lista = ordenarFilas(
    state.productos.filter(p => {
    if (!q) return true;
    const catLbl = etiquetaProducto(p);
    return [p.proveedor, p.categoria, catLbl, p.oferta, p.direccion, p.comuna, p.barrio]
      .some(v => v && v.toLowerCase().includes(q));
    }),
    state.prodSort,
    { proveedor: (p) => p.proveedor, comuna: (p) => p.comuna },
  );

  if (!lista.length) {
    const hint = esAdmin
      ? 'Crea el primero con el botón "Nuevo producto"'
      : 'Prueba otro término de búsqueda.';
    $('tabla-prod-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🦽</div><h3>Sin productos</h3><p>${hint}</p></div>`;
    return;
  }

  const thAccP = `<th style="width:${esAdmin ? '118px' : '52px'}">Acciones</th>`;

  $('tabla-prod-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Categoría</th>${thOrdenable('Proveedor', 'proveedor', state.prodSort)}${thOrdenable('Comuna', 'comuna', state.prodSort)}<th>Barrio</th><th>Oferta</th><th>Contacto</th><th>Geo</th>
          ${thAccP}
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => {
          const acc = `<td>
            <div class="tabla-acciones">
              <button class="icon-btn ver" data-view-prod="${p.id}" title="Ver ficha completa" aria-label="Ver ficha completa de ${escapar(p.proveedor || p.oferta || '')}">👁</button>
              ${esAdmin ? `<button class="icon-btn" data-edit-prod="${p.id}" title="Editar" aria-label="Editar producto ${escapar(p.proveedor || p.oferta || '')}">✏️</button>
              <button class="icon-btn danger" data-del-prod="${p.id}" title="Borrar" aria-label="Borrar producto ${escapar(p.proveedor || p.oferta || '')}">🗑</button>` : ''}
            </div>
          </td>`;
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

  enlazarOrdenTabla('tabla-prod-wrap', state.prodSort, renderProductos);

  document.querySelectorAll('[data-view-prod]').forEach((b) =>
    b.addEventListener('click', () => verProducto(b.dataset.viewProd))
  );
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
    email: serializarEmails(leerEmailsProd()),
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

function etiquetaRol(rol) {
  if (rol === 'super_admin') return 'Super administrador';
  if (rol === 'admin') return 'Administrador editor';
  return 'Consulta';
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
            <td><span class="badge badge-${u.rol}">${etiquetaRol(u.rol)}</span></td>
            <td><span class="badge badge-${u.activo ? 'activo' : 'inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
            <td>${fecha}</td>
            <td>
              <div class="tabla-acciones">
                <button class="icon-btn" data-edit-user="${u.id}" title="Editar" aria-label="Editar usuario ${escapar(u.nombre || u.email || '')}">✏️</button>
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

if (esSuperAdmin) {
  $('busc-user').addEventListener('input', renderUsuarios);
}

function syncPasswordRulesUsuario() {
  const pw = $('user-password-input');
  const hint = $('hint-password-user');
  if (!pw || !hint) return;
  if ($('user-id').value) return;
  const rol = $('user-rol-input').value;
  pw.minLength = rol === 'consulta' ? 5 : 8;
  hint.textContent = 'El usuario deberá cambiarla al primer inicio de sesión.';
}

if (esSuperAdmin) {
  $('user-rol-input').addEventListener('change', syncPasswordRulesUsuario);
}

if (esSuperAdmin) {
  $('btn-nuevo-user').addEventListener('click', () => {
    $('modal-user-titulo').textContent = 'Nuevo usuario';
    $('form-user').reset();
    $('user-id').value = '';
    $('field-email').style.display          = 'none';
    $('field-password').style.display       = 'block';
    $('field-password-reset').style.display = 'none';
    $('field-cedula').style.display         = 'block';
    $('user-email-input').required          = false;
    $('user-password-input').required       = true;
    $('user-cedula-input').required         = true;
    $('user-rol-input').disabled            = false;
    $('user-rol-input').value               = 'consulta';
    const hintRol = $('hint-rol-user');
    if (hintRol) hintRol.textContent = 'Al crear usuarios nuevos use consulta o administrador editor. Puede promover a super administrador al editar.';
    $('user-activo-input').value            = 'true';
    $('user-cedula-input').value            = '';
    $('user-password-reset').value          = '';
    syncPasswordRulesUsuario();
    abrirModal('modal-user');
  });

  $('btn-asignar-temp-pw').addEventListener('click', () => { asignarPasswordTemporal(); });
}

function editarUsuario(id) {
  if (!esSuperAdmin) return;
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return;
  $('modal-user-titulo').textContent = 'Editar usuario';
  $('user-id').value           = u.id;
  $('user-nombre-input').value = u.nombre_completo;
  $('user-rol-input').value    = u.rol;
  $('user-rol-input').disabled = u.id === perfil.id;
  const hintRol = $('hint-rol-user');
  if (hintRol) {
    hintRol.textContent = u.id === perfil.id
      ? 'No puede cambiar su propio rol (evita quedarse sin super administrador).'
      : 'Puede asignar consulta, administrador editor o super administrador.';
  }
  $('user-activo-input').value = String(u.activo);
  $('user-cedula-input').value = u.cedula || '';
  $('field-email').style.display          = 'none';
  $('field-password').style.display       = 'none';
  $('field-password-reset').style.display = u.id === perfil.id ? 'none' : 'block';
  $('field-cedula').style.display         = 'block';
  $('user-email-input').required          = false;
  $('user-password-input').required       = false;
  $('user-cedula-input').required         = true;
  $('user-password-reset').value          = '';
  abrirModal('modal-user');
}

async function asignarPasswordTemporal(opciones = {}) {
  const { silencioso = false } = opciones;
  const id = $('user-id').value;
  if (!id) return false;
  const u = state.usuarios.find(x => x.id === id);
  if (!u) return false;
  const password = ($('user-password-reset').value || '').trim();
  const rolEfectivo = $('user-rol-input').disabled ? u.rol : ($('user-rol-input').value || u.rol);
  const minPw = rolEfectivo === 'consulta' ? 5 : 8;
  if (password.length < minPw) {
    if (!silencioso) {
      toast(
        rolEfectivo === 'consulta'
          ? 'La contraseña temporal debe tener al menos 5 caracteres'
          : 'La contraseña temporal debe tener al menos 8 caracteres (administradores)',
        'error',
      );
    }
    return false;
  }
  const token = await bearerToken();
  if (!token) {
    if (!silencioso) toast('Sesión expirada. Vuelve a iniciar sesión.', 'error');
    return false;
  }
  const respuesta = await fetch('/api/reset-password-usuario', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: id, password }),
  });
  if (!respuesta.ok) {
    if (!silencioso) toast(`Error: ${await parseApiError(respuesta)}`, 'error');
    return false;
  }
  if (!silencioso) {
    toast('Contraseña temporal asignada. El usuario deberá cambiarla al iniciar sesión.');
  }
  $('user-password-reset').value = '';
  return true;
}

$('btn-guardar-user').addEventListener('click', async () => {
  if (!esSuperAdmin) return;
  const id = $('user-id').value;
  const nombre = $('user-nombre-input').value.trim();
  const rol    = $('user-rol-input').value;
  const activo = $('user-activo-input').value === 'true';

  if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }

  const cedulaDigits = normalizarCedulaUsuario($('user-cedula-input').value);
  const errCedula = validarCedulaUsuario(cedulaDigits);

  if (id) {
    const u = state.usuarios.find(x => x.id === id);
    const cedulaFinal = cedulaDigits || u?.cedula || '';
    const errCedulaEdit = validarCedulaUsuario(cedulaFinal);
    if (errCedulaEdit) {
      toast(`${errCedulaEdit} Sin cédula guardada no puede iniciar sesión.`, 'error');
      return;
    }

    const payload = {
      nombre_completo: nombre,
      activo,
      cedula: cedulaFinal,
    };
    if (id !== perfil.id) {
      if (!['consulta', 'admin', 'super_admin'].includes(rol)) {
        toast('Rol inválido', 'error');
        return;
      }
      if (u?.rol === 'super_admin' && rol !== 'super_admin') {
        const otrosSuper = state.usuarios.filter(x => x.rol === 'super_admin' && x.id !== id);
        if (!otrosSuper.length) {
          toast('Debe quedar al menos un super administrador activo.', 'error');
          return;
        }
      }
      payload.rol = rol;
    }

    const { error } = await supabase.from('perfiles').update(payload).eq('id', id);
    if (error) { toast(`Error: ${error.message}`, 'error'); return; }

    const tempPw = ($('user-password-reset').value || '').trim();
    if (tempPw) {
      const okPw = await asignarPasswordTemporal({ silencioso: true });
      if (!okPw) {
        toast('Datos guardados, pero falló la contraseña temporal. Revise longitud (8 para administradores) y pulse «Asignar contraseña temporal».', 'error');
        state.usersCargados = false;
        await cargarUsuarios();
        return;
      }
      toast('Usuario actualizado y contraseña temporal asignada');
    } else {
      toast('Usuario actualizado');
    }
  } else {
    if (!['consulta', 'admin'].includes(rol)) {
      toast('Al crear, elija consulta o administrador editor. Para super administrador, guarde el usuario y edítelo.', 'error');
      return;
    }
    if (errCedula) {
      toast(`${errCedula} Es el dato con el que inicia sesión.`, 'error');
      return;
    }
    const emailOpcional = $('user-email-input').value.trim();
    const password = $('user-password-input').value;
    const minPw    = rol === 'consulta' ? 5 : 8;
    if (password.length < minPw) {
      toast(
        rol === 'consulta'
          ? 'Contraseña temporal obligatoria (mínimo 5 caracteres para consulta)'
          : 'Contraseña temporal obligatoria (mínimo 8 caracteres para administrador)',
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
        ...(emailOpcional ? { email: emailOpcional } : {}),
        password,
        nombre_completo: nombre,
        rol,
        activo,
        cedula: cedulaDigits,
      }),
    });
    if (!respuesta.ok) {
      toast(`Error: ${await parseApiError(respuesta)}`, 'error');
      return;
    }
    toast('Usuario creado. Entra con la cédula y la contraseña temporal.');
  }

  cerrarModal('modal-user');
  state.usersCargados = false;
  cargarUsuarios();
});

async function borrarUsuario(id) {
  if (!esSuperAdmin) return;
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
window.initSileoA11y?.({ variant: 'admin' });
