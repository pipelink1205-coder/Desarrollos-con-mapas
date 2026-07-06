/** Favoritos del mapa por usuario (localStorage, por pestaña disc/cuid/mesa). */

const STORAGE_PREFIX = 'epi_mapa_favoritos_';
const TABS = ['disc', 'cuid', 'mesa'];

let userKey = 'anon';
/** @type {Map<string, Set<string>>} */
const porTab = new Map(TABS.map((t) => [t, new Set()]));

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    TABS.forEach((t) => {
      const ids = Array.isArray(data?.[t]) ? data[t] : [];
      porTab.set(t, new Set(ids.map(String)));
    });
  } catch { /* */ }
}

function save() {
  try {
    const data = {};
    TABS.forEach((t) => { data[t] = [...(porTab.get(t) || [])]; });
    localStorage.setItem(STORAGE_PREFIX + userKey, JSON.stringify(data));
  } catch { /* */ }
}

export function initFavoritos(userId) {
  userKey = userId ? String(userId) : 'anon';
  load();
}

export function esFavorito(tab, orgId) {
  if (!orgId) return false;
  return porTab.get(tab)?.has(String(orgId)) ?? false;
}

export function toggleFavorito(tab, orgId) {
  if (!orgId) return false;
  const set = porTab.get(tab) || new Set();
  const id = String(orgId);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  porTab.set(tab, set);
  save();
  return set.has(id);
}

export function idsFavoritos(tab) {
  return [...(porTab.get(tab) || [])];
}

export function contarFavoritos(tab) {
  return porTab.get(tab)?.size ?? 0;
}

export function htmlBtnFavorito(tab, orgId, orgNombre, extraClass = '') {
  const on = esFavorito(tab, orgId);
  const nom = escAttr(orgNombre || 'Institución');
  const label = on ? `Quitar ${nom} de favoritos` : `Guardar ${nom} en favoritos`;
  return `<button type="button" class="ocard-fav-btn${on ? ' on' : ''}${extraClass ? ` ${extraClass}` : ''}" data-fav-id="${escAttr(orgId)}" data-fav-tab="${escAttr(tab)}" aria-pressed="${on ? 'true' : 'false'}" title="${label}" aria-label="${label}">${on ? '★' : '☆'}</button>`;
}

export function syncEstadoBtnFavorito(btn, on, orgNombre) {
  if (!btn) return;
  const nom = escAttr(orgNombre || 'Institución');
  const label = on ? `Quitar ${nom} de favoritos` : `Guardar ${nom} en favoritos`;
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.textContent = on ? '★' : '☆';
}
