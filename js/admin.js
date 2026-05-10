// =====================================================================
//  PANEL DE ADMINISTRACIÓN
// =====================================================================
//  Lógica de las 3 pestañas: instituciones, productos, usuarios.
//  Solo accesible para usuarios con rol 'admin'.
// =====================================================================

import { requireAuth } from './auth-guard.js';
import { supabase, cerrarSesion, obtenerSesion } from './supabase-client.js';

const { perfil, session } = await requireAuth({ requiereAdmin: true });

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

// ---------------------------------------------------------------------
//  Helpers UI
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

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
document.querySelectorAll('.mbg').forEach(bg => {
  bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
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
    if (tab.dataset.page === 'usuarios'      && !state.usersCargados) cargarUsuarios();
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
};

// =====================================================================
//  INSTITUCIONES
// =====================================================================

async function cargarInstituciones() {
  const { data, error } = await supabase
    .from('instituciones')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    $('tabla-inst-wrap').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${error.message}</p></div>`;
    return;
  }
  state.instituciones = data || [];
  state.instCargadas  = true;
  renderInstituciones();
}

function renderInstituciones() {
  const q   = ($('busc-inst').value || '').toLowerCase();
  const cat = $('filt-cat-inst').value;

  const lista = state.instituciones.filter(i => {
    if (cat && i.categoria !== cat) return false;
    if (!q) return true;
    return [i.nombre, i.direccion, i.comuna, i.barrio, i.programa]
      .some(v => v && v.toLowerCase().includes(q));
  });

  if (!lista.length) {
    $('tabla-inst-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🏛</div><h3>Sin instituciones</h3><p>Crea la primera con el botón "Nueva institución"</p></div>`;
    return;
  }

  const badgeMap = { discapacidad:['badge-disc','♿ Disc'], cuidado:['badge-cuid','💚 Cuid'], mesa:['badge-mesa','🤝 Mesa'] };

  $('tabla-inst-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Cat.</th><th>Nombre</th><th>Comuna</th><th>Dirección</th>
          <th>Teléfono</th><th>Geo</th><th style="width:90px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(i => {
          const [cls, lbl] = badgeMap[i.categoria] || ['',''];
          const geo = (i.latitud || i.latitud_verdadera) ? '📌' : '—';
          return `<tr>
            <td><span class="badge ${cls}">${lbl}</span></td>
            <td><strong>${escapar(i.nombre)}</strong>${i.programa ? `<div style="color:var(--txt2);font-size:11px">${escapar(i.programa)}</div>` : ''}</td>
            <td>${escapar(i.comuna || '—')}</td>
            <td>${escapar(i.direccion || '—')}</td>
            <td>${escapar(i.telefono || '—')}</td>
            <td style="text-align:center">${geo}</td>
            <td>
              <div class="tabla-acciones">
                <button class="icon-btn" data-edit-inst="${i.id}" title="Editar">✏️</button>
                <button class="icon-btn danger" data-del-inst="${i.id}" title="Borrar">🗑</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('[data-edit-inst]').forEach(b =>
    b.addEventListener('click', () => editarInstitucion(b.dataset.editInst))
  );
  document.querySelectorAll('[data-del-inst]').forEach(b =>
    b.addEventListener('click', () => borrarInstitucion(b.dataset.delInst))
  );
}

$('busc-inst').addEventListener('input', renderInstituciones);
$('filt-cat-inst').addEventListener('change', renderInstituciones);

$('btn-nueva-inst').addEventListener('click', () => {
  $('modal-inst-titulo').textContent = 'Nueva institución';
  $('form-inst').reset();
  $('inst-id').value = '';
  abrirModal('modal-inst');
});

function editarInstitucion(id) {
  const i = state.instituciones.find(x => x.id === id);
  if (!i) return;
  $('modal-inst-titulo').textContent = 'Editar institución';
  $('inst-id').value = i.id;

  // Llenar todos los campos
  const campos = [
    'categoria','nombre','programa','tipo_organizacion','direccion','comuna','barrio',
    'latitud','longitud','telefono','email','contacto_persona','servicios','costo',
    'cupos','cobertura','poblacion_objetivo','requisitos','sector',
    'nivel_relacionamiento_pp','eje_pp_1','dimension_pp',
  ];
  campos.forEach(c => {
    const el = $(`inst-${c}`);
    if (el) el.value = i[c] ?? '';
  });
  $('inst-tipos_discapacidad').value = (i.tipos_discapacidad || []).join(', ');
  $('inst-atiende_persona_discapacidad').checked = !!i.atiende_persona_discapacidad;
  $('inst-atiende_familia').checked              = !!i.atiende_familia;
  $('inst-atiende_publico_general').checked      = !!i.atiende_publico_general;

  abrirModal('modal-inst');
}

$('btn-guardar-inst').addEventListener('click', async () => {
  const form = $('form-inst');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const id   = $('inst-id').value;
  const tipo = $('inst-tipos_discapacidad').value.trim();

  const payload = {
    categoria:                    $('inst-categoria').value,
    nombre:                       $('inst-nombre').value.trim(),
    programa:                     $('inst-programa').value.trim() || null,
    tipo_organizacion:            $('inst-tipo_organizacion').value.trim() || null,
    direccion:                    $('inst-direccion').value.trim() || null,
    comuna:                       $('inst-comuna').value.trim() || null,
    barrio:                       $('inst-barrio').value.trim() || null,
    latitud:                      parseFloat($('inst-latitud').value)  || null,
    longitud:                     parseFloat($('inst-longitud').value) || null,
    telefono:                     $('inst-telefono').value.trim() || null,
    email:                        $('inst-email').value.trim() || null,
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
    tipos_discapacidad:           tipo ? tipo.split(',').map(s => s.trim()).filter(Boolean) : null,
    atiende_persona_discapacidad: $('inst-atiende_persona_discapacidad').checked,
    atiende_familia:              $('inst-atiende_familia').checked,
    atiende_publico_general:      $('inst-atiende_publico_general').checked,
    actualizado_por:              session.user.id,
  };

  let res;
  if (id) {
    res = await supabase.from('instituciones').update(payload).eq('id', id);
  } else {
    payload.creado_por = session.user.id;
    res = await supabase.from('instituciones').insert(payload);
  }

  if (res.error) { toast(`Error: ${res.error.message}`, 'error'); return; }

  toast(id ? 'Institución actualizada' : 'Institución creada');
  cerrarModal('modal-inst');
  state.instCargadas = false;
  cargarInstituciones();
});

async function borrarInstitucion(id) {
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

async function cargarProductos() {
  const { data, error } = await supabase
    .from('productos_apoyo')
    .select('*')
    .order('proveedor', { ascending: true });
  if (error) {
    $('tabla-prod-wrap').innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${error.message}</p></div>`;
    return;
  }
  state.productos = data || [];
  state.prodCargados = true;
  renderProductos();
}

function renderProductos() {
  const q = ($('busc-prod').value || '').toLowerCase();
  const lista = state.productos.filter(p => {
    if (!q) return true;
    return [p.proveedor, p.categoria, p.oferta]
      .some(v => v && v.toLowerCase().includes(q));
  });

  if (!lista.length) {
    $('tabla-prod-wrap').innerHTML = `<div class="empty"><div class="empty-ico">🦽</div><h3>Sin productos</h3><p>Crea el primero con el botón "Nuevo producto"</p></div>`;
    return;
  }

  $('tabla-prod-wrap').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Categoría</th><th>Proveedor</th><th>Oferta</th><th>Contacto</th>
          <th style="width:90px">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => `<tr>
          <td><span class="badge badge-prod">${escapar(p.categoria || '—')}</span></td>
          <td><strong>${escapar(p.proveedor)}</strong></td>
          <td style="max-width:340px">${escapar((p.oferta || '').slice(0, 140))}${p.oferta && p.oferta.length > 140 ? '…' : ''}</td>
          <td>${escapar(p.contacto || '—')}</td>
          <td>
            <div class="tabla-acciones">
              <button class="icon-btn" data-edit-prod="${p.id}" title="Editar">✏️</button>
              <button class="icon-btn danger" data-del-prod="${p.id}" title="Borrar">🗑</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  document.querySelectorAll('[data-edit-prod]').forEach(b =>
    b.addEventListener('click', () => editarProducto(b.dataset.editProd))
  );
  document.querySelectorAll('[data-del-prod]').forEach(b =>
    b.addEventListener('click', () => borrarProducto(b.dataset.delProd))
  );
}

$('busc-prod').addEventListener('input', renderProductos);

$('btn-nuevo-prod').addEventListener('click', () => {
  $('modal-prod-titulo').textContent = 'Nuevo producto';
  $('form-prod').reset();
  $('prod-id').value = '';
  abrirModal('modal-prod');
});

function editarProducto(id) {
  const p = state.productos.find(x => x.id === id);
  if (!p) return;
  $('modal-prod-titulo').textContent = 'Editar producto';
  $('prod-id').value         = p.id;
  $('prod-categoria').value  = p.categoria || '';
  $('prod-proveedor').value  = p.proveedor || '';
  $('prod-oferta').value     = p.oferta || '';
  $('prod-contacto').value   = p.contacto || '';
  abrirModal('modal-prod');
}

$('btn-guardar-prod').addEventListener('click', async () => {
  const form = $('form-prod');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const id = $('prod-id').value;
  const payload = {
    categoria: $('prod-categoria').value.trim(),
    proveedor: $('prod-proveedor').value.trim(),
    oferta:    $('prod-oferta').value.trim() || null,
    contacto:  $('prod-contacto').value.trim() || null,
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

$('busc-user').addEventListener('input', renderUsuarios);

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

$('user-rol-input').addEventListener('change', syncPasswordRulesUsuario);

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

function editarUsuario(id) {
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
