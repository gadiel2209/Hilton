// Módulo "Habitaciones": consulta GET /api/habitaciones, cambia estado con PATCH /api/habitaciones/estado
// y vuelve a consultar la base para comprobar que el cambio quedó guardado.
import { api, esc, fechaHora, soloHora, iniciales, ROLES } from './comun.js';

const $ = id => document.getElementById(id);
const irAlLogin = () => window.location.replace('login.html');

const ESTADOS = {
  ocupada: { etiqueta: 'Ocupada', plural: 'Ocupadas', color: 'var(--c-ocupada)' },
  sucia: { etiqueta: 'Sucia', plural: 'Sucias', color: 'var(--c-sucia)' },
  en_limpieza: { etiqueta: 'En limpieza', corta: 'Limpiando', plural: 'En limpieza', color: 'var(--c-limpieza)' },
  lista: { etiqueta: 'Lista', plural: 'Listas', color: 'var(--c-lista)' },
  bloqueada: { etiqueta: 'Bloqueada', plural: 'Bloqueadas', color: 'var(--c-bloqueada)' }
};
const TIPOS = { king: 'King', doble_queen: 'Doble queen', suite: 'Suite', accesible: 'Accesible' };
const AYUDA_ROL = {
  recepcion: 'Como Recepción puedes marcar salidas (ocupada → sucia) y entregar habitaciones listas (lista → ocupada).',
  limpieza: 'Como Limpieza puedes iniciar (sucia → en limpieza) y terminar limpiezas (en limpieza → lista).',
  mantenimiento: 'Como Mantenimiento puedes bloquear habitaciones y liberarlas cuando quedan reparadas (bloqueada → sucia).',
  administracion: 'Como Administración puedes hacer cualquier cambio de estado, buscar, agregar, editar y eliminar habitaciones.',
  gerencia: 'Tu rol solo consulta: puedes ver el estado y el historial, pero no cambiarlos.'
};

const estado = {
  datos: null,          // última respuesta de GET /api/habitaciones
  filtroEstado: '',
  filtroPiso: '',
  filtroTipo: '',
  filtroQ: '',          // número o parte del número (búsqueda)
  edVersion: null,      // versión con la que se llenó el formulario de edición
  abierta: null,        // número de la habitación abierta en el diálogo
  detalle: null,        // detalle de esa habitación leído de la base (GET /historial)
  elegido: null,        // estado elegido en el diálogo
  recienCambiada: null  // para resaltar la habitación que se acaba de guardar
};

// ---------- Usuario y sesión ----------
async function cargarUsuario() {
  try {
    const { usuario } = await api('/auth/me');
    $('avatar').textContent = iniciales(usuario.nombre);
    $('usuario-nombre').textContent = usuario.nombre;
    $('usuario-puesto').textContent = usuario.puesto || 'Sin puesto';
    $('usuario-rol').textContent = ROLES[usuario.rol] || usuario.rol;
    $('usuario-rol').className = `rol rol-${usuario.rol}`;
    $('ayuda-rol').textContent = (AYUDA_ROL[usuario.rol] || '') +
      (usuario.rol === 'gerencia' ? '' : ' El punto azul marca las habitaciones que puedes cambiar ahora.');
    return true;
  } catch (e) {
    if (e.status === 401 || e.codigo === 'NO_BACKEND_URL') irAlLogin();
    else mostrarError(e.message);
    return false;
  }
}

$('btn-salir').addEventListener('click', async () => {
  $('btn-salir').disabled = true;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* aunque falle, se sale */ }
  sessionStorage.removeItem('hgi_token');
  sessionStorage.removeItem('hgi_acceso_anterior');
  irAlLogin();
});

function mostrarError(msg) {
  $('error-mensaje').textContent = msg;
  $('error').hidden = false;
}

// ---------- Consulta (GET) ----------
// Si ya hay una consulta en curso, se espera y se hace otra: así siempre se pinta lo último de la base
let cargaEnCurso = null;
async function cargarHabitaciones() {
  while (cargaEnCurso) await cargaEnCurso;
  cargaEnCurso = consultarHabitaciones();
  try { await cargaEnCurso; } finally { cargaEnCurso = null; }
}

async function consultarHabitaciones() {
  const btn = $('btn-actualizar');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  try {
    const qs = new URLSearchParams();
    if (estado.filtroEstado) qs.set('estado', estado.filtroEstado);
    if (estado.filtroPiso) qs.set('piso', estado.filtroPiso);
    if (estado.filtroTipo) qs.set('tipo', estado.filtroTipo);
    if (estado.filtroQ) qs.set('q', estado.filtroQ);
    estado.datos = await api(`/habitaciones${qs.size ? `?${qs}` : ''}`);
    pintarFiltros();
    pintarRack();
    $('actualizado').textContent = `Actualizado ${soloHora(estado.datos.generado_en)}`;
    $('rack').hidden = false;
    $('btn-agregar').hidden = !estado.datos.puede_administrar;
    $('error').hidden = true;
  } catch (e) {
    if (e.status === 401) return irAlLogin();
    mostrarError(e.message);
  } finally {
    $('cargando').hidden = true;
    btn.disabled = false;
    btn.textContent = '↻ Actualizar';
  }
}

function pintarFiltros() {
  const d = estado.datos;
  const boton = (clave, texto, n, color) => `
    <button type="button" class="filtro-chip" data-estado="${clave}" aria-pressed="${estado.filtroEstado === clave}"
      ${color ? `style="--color:${color}"` : ''}>
      ${color ? '<span class="punto"></span>' : ''}${texto}<span class="filtro-n">${n}</span>
    </button>`;
  $('filtro-estados').innerHTML = boton('', 'Todas', d.total_hotel) +
    Object.entries(ESTADOS).map(([k, e]) => boton(k, e.plural, d.por_estado[k] ?? 0, e.color)).join('');
}

function pintarRack() {
  const lista = estado.datos.habitaciones;
  if (!lista.length) {
    const q = estado.filtroQ;
    const ofrecerAlta = estado.datos.puede_administrar && /^[1-6]\d{2}$/.test(q) && Number(q) % 100 !== 0;
    $('rack').innerHTML = `<div class="vacio vacio-busqueda">
      <p>${q ? `No hay ninguna habitación ${esc(q.length === 3 ? q : `que empiece con ${q}`)} con estos filtros.` : 'Ninguna habitación coincide con estos filtros.'}
        Borra la búsqueda o elige “Todas”.</p>
      ${ofrecerAlta ? `<button type="button" class="btn-agregar" data-agregar="${esc(q)}">+ Agregar la habitación ${esc(q)}</button>` : ''}
    </div>`;
    return;
  }
  const porPiso = new Map();
  lista.forEach(h => { if (!porPiso.has(h.piso)) porPiso.set(h.piso, []); porPiso.get(h.piso).push(h); });

  $('rack').innerHTML = [...porPiso.entries()].sort((a, b) => b[0] - a[0]).map(([piso, habs]) => `
    <div class="piso">
      <div class="piso-etiqueta"><strong>${piso}</strong><span>piso</span></div>
      <div class="piso-habitaciones">
        ${habs.map(h => `
          <button type="button" class="hab hab-${h.estado}${h.numero === estado.recienCambiada ? ' hab-guardada' : ''}"
            data-numero="${h.numero}" style="--color:${ESTADOS[h.estado].color}"
            aria-label="Habitación ${h.numero}, ${ESTADOS[h.estado].etiqueta}${h.permitidas.length ? '' : ', sin cambios disponibles para tu rol'}">
            <span class="hab-numero">${h.numero}</span>
            <span class="hab-estado">${ESTADOS[h.estado].corta || ESTADOS[h.estado].etiqueta}</span>
            ${h.permitidas.length ? '<span class="hab-accion" aria-hidden="true"></span>' : ''}
          </button>`).join('')}
      </div>
    </div>`).join('');
  estado.recienCambiada = null; // el resaltado se muestra solo en la primera pintada
}

$('filtro-estados').addEventListener('click', e => {
  const b = e.target.closest('.filtro-chip');
  if (!b) return;
  estado.filtroEstado = b.dataset.estado;
  cargarHabitaciones();
});
$('filtro-piso').addEventListener('change', e => { estado.filtroPiso = e.target.value; cargarHabitaciones(); });
$('filtro-tipo').addEventListener('change', e => { estado.filtroTipo = e.target.value; cargarHabitaciones(); });

// ---------- Búsqueda por número ----------
let temporizadorBusqueda;
$('buscar').addEventListener('input', e => {
  const limpio = e.target.value.replace(/\D/g, '').slice(0, 3);
  if (limpio !== e.target.value) e.target.value = limpio;
  clearTimeout(temporizadorBusqueda);
  if (limpio && !/^[1-6]/.test(limpio)) {
    $('rack').innerHTML = '<p class="vacio">Los números de habitación empiezan con el piso, del 1 al 6.</p>';
    return;
  }
  temporizadorBusqueda = setTimeout(() => { estado.filtroQ = limpio; cargarHabitaciones(); }, 300);
});
// Enter abre la habitación si la búsqueda dejó una sola
$('buscar').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(temporizadorBusqueda);
  estado.filtroQ = e.target.value;
  await cargarHabitaciones();
  const lista = estado.datos?.habitaciones || [];
  if (lista.length === 1) abrirDetalle(lista[0].numero);
});
$('btn-actualizar').addEventListener('click', cargarHabitaciones);
$('rack').addEventListener('click', e => {
  const alta = e.target.closest('[data-agregar]');
  if (alta) return abrirAlta(alta.dataset.agregar);
  const b = e.target.closest('.hab');
  if (b) abrirDetalle(Number(b.dataset.numero));
});

// ---------- Diálogo de detalle ----------
// Primero se usa el dato de la lista (respuesta inmediata) y luego el detalle fresco de la base
const habitacionAbierta = () =>
  (estado.detalle?.numero === estado.abierta ? estado.detalle : null) ||
  estado.datos?.habitaciones.find(h => h.numero === estado.abierta) || null;

function abrirDetalle(numero) {
  estado.edVersion = null;
  $('seccion-editar').open = false;
  $('ed-alerta').hidden = true;
  $('el-confirmar').value = '';
  $('el-alerta').hidden = true;
  estado.abierta = numero;
  estado.detalle = null;
  estado.elegido = null;
  $('motivo').value = '';
  ocultarAlertaDlg();
  pintarDetalle();
  if (!$('dlg').open) $('dlg').showModal();
  return cargarHistorial(numero);
}

function pintarDetalle() {
  const h = habitacionAbierta();
  if (!h) return;
  $('dlg-titulo').textContent = `Habitación ${h.numero}`;
  $('dlg-sub').textContent = `Piso ${h.piso} · ${TIPOS[h.tipo] || h.tipo}${h.capacidad ? ` · ${h.capacidad} personas` : ''}`;
  $('dlg-datos').innerHTML = `
    <div><dt>Estado actual</dt><dd><span class="estado-pill" style="--color:${ESTADOS[h.estado].color}">${ESTADOS[h.estado].etiqueta}</span></dd></div>
    <div><dt>Desde</dt><dd>${esc(fechaHora(h.actualizado_en))}</dd></div>
    <div><dt>Versión</dt><dd><code>v${h.version}</code></dd></div>
    <div><dt>Etiqueta NFC</dt><dd>${h.nfc_uid ? `<code>${esc(h.nfc_uid)}</code>` : '<span class="muted">Sin etiqueta</span>'}</dd></div>
    ${h.camarista ? `<div><dt>Camarista</dt><dd>${esc(h.camarista)}</dd></div>` : ''}
    ${h.bloqueo ? `<div class="ancho"><dt>Motivo del bloqueo</dt><dd>${esc(h.bloqueo.motivo)}</dd></div>` : ''}`;

  $('opciones-estado').innerHTML = h.permitidas.map(a => `
    <label class="opcion" style="--color:${ESTADOS[a].color}">
      <input type="radio" name="estado_nuevo" value="${a}" ${estado.elegido === a ? 'checked' : ''} />
      <span><span class="punto"></span>${ESTADOS[a].etiqueta}</span>
    </label>`).join('');
  const sinOpciones = !h.permitidas.length;
  $('sin-opciones').hidden = !sinOpciones;
  // Edición de datos (solo Administración). Se rellena al abrir y cuando cambia la versión en la base
  $('seccion-editar').hidden = !estado.datos.puede_administrar;
  if (estado.datos.puede_administrar && estado.edVersion !== h.version) {
    $('ed-tipo').value = h.tipo;
    $('ed-capacidad').value = h.capacidad ?? '';
    $('ed-nfc').value = h.nfc_uid || '';
    estado.edVersion = h.version;
  }
  $('el-etiqueta').textContent = `Escribe ${h.numero} para confirmar`;
  $('btn-eliminar').disabled = $('el-confirmar').value.trim() !== String(h.numero);
  $('sin-opciones').textContent = estado.datos.puede_modificar
    ? `Tu rol no tiene cambios disponibles para una habitación ${ESTADOS[h.estado].etiqueta.toLowerCase()}.`
    : 'Tu rol solo puede consultar.';
  $('campo-motivo').hidden = estado.elegido !== 'bloqueada';
  $('btn-guardar').disabled = !estado.elegido;
}

$('opciones-estado').addEventListener('change', e => {
  estado.elegido = e.target.value;
  $('campo-motivo').hidden = estado.elegido !== 'bloqueada';
  $('btn-guardar').disabled = false;
  ocultarAlertaDlg();
  if (estado.elegido === 'bloqueada') $('motivo').focus();
});

async function cargarHistorial(numero, resaltarId = null) {
  $('historial').innerHTML = '<li class="muted">Cargando historial…</li>';
  try {
    const d = await api(`/habitaciones/historial?numero=${encodeURIComponent(numero)}`);
    if (estado.abierta !== numero) return d;
    estado.detalle = d.habitacion;
    pintarDetalle();
    $('historial').innerHTML = d.cambios.length ? d.cambios.map(c => `
      <li class="${String(c.id) === String(resaltarId) ? 'nuevo' : ''}">
        <span class="transicion">${esc(ESTADOS[c.de]?.etiqueta || c.de)} → <strong>${esc(ESTADOS[c.a]?.etiqueta || c.a)}</strong></span>
        <small>${esc(c.usuario || 'Sistema')}${c.rol ? ` (${esc(ROLES[c.rol] || c.rol)})` : ''} · ${esc(fechaHora(c.fecha))}${c.duracion_min != null ? ` · estuvo ${c.duracion_min} min en el estado anterior` : ''}</small>
      </li>`).join('') : '<li class="muted">Esta habitación todavía no tiene cambios registrados.</li>';
    return d;
  } catch (e) {
    if (e.status === 401) return irAlLogin();
    $('historial').innerHTML = `<li class="muted">No se pudo leer el historial: ${esc(e.message)}</li>`;
    return null;
  }
}

function alertaDlg(titulo, mensaje, tipo = 'error') {
  const a = $('dlg-alerta');
  a.className = `alerta alerta-${tipo}`;
  a.querySelector('.alerta-icono').textContent = tipo === 'bloqueo' ? '🔒' : tipo === 'ok' ? '✔' : '⚠';
  $('dlg-alerta-titulo').textContent = titulo;
  $('dlg-alerta-mensaje').textContent = mensaje;
  a.hidden = false;
}
const ocultarAlertaDlg = () => { $('dlg-alerta').hidden = true; };

// ---------- Modificación (PATCH) + verificación ----------
$('form-estado').addEventListener('submit', async e => {
  e.preventDefault();
  const h = habitacionAbierta();
  if (!h || !estado.elegido) return;
  const motivo = $('motivo').value.trim();
  if (estado.elegido === 'bloqueada' && motivo.length < 5) {
    alertaDlg('Falta el motivo', 'Escribe por qué se bloquea la habitación (mínimo 5 caracteres).', 'aviso');
    $('motivo').focus();
    return;
  }

  const btn = $('btn-guardar');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-chico" aria-hidden="true"></span> Guardando…';
  try {
    const r = await api('/habitaciones/estado', {
      method: 'PATCH',
      body: { numero: h.numero, estado_nuevo: estado.elegido, version: h.version, ...(estado.elegido === 'bloqueada' ? { motivo } : {}) }
    });

    // Se vuelve a consultar la base (no se confía en la memoria del navegador)
    estado.recienCambiada = r.numero;
    estado.elegido = null;
    await cargarHabitaciones();
    const hist = await cargarHistorial(r.numero, r.historial_id);
    const enBase = hist?.habitacion;
    const verificado = enBase && enBase.estado === r.a && enBase.version === r.version_nueva;
    pintarDetalle();
    const texto = verificado
      ? `${r.mensaje}. Verificado en MongoDB: versión ${r.version_anterior} → ${r.version_nueva}.`
      : `${r.mensaje}. Se guardó, pero la consulta muestra que la habitación ya cambió otra vez.`;
    alertaDlg('Cambio guardado', texto, 'ok');
    avisar(`✔ ${texto}`);
  } catch (err) {
    if (err.status === 401) return irAlLogin();
    const titulos = {
      VERSION_DESACTUALIZADA: 'Alguien más la cambió primero',
      TRANSICION_INVALIDA: 'Cambio no permitido',
      SIN_PERMISO: 'Sin permiso',
      CONFLICTO_ASIGNACION: 'Conflicto con la asignación',
      DATOS_INVALIDOS: 'Revisa los datos'
    };
    alertaDlg(titulos[err.codigo] || 'No se guardó el cambio', err.message, err.codigo === 'SIN_PERMISO' ? 'bloqueo' : 'error');
    // Si la habitación cambió en la base, se muestra su estado real
    if (['VERSION_DESACTUALIZADA', 'TRANSICION_INVALIDA'].includes(err.codigo)) {
      estado.elegido = null;
      await cargarHabitaciones();
      pintarDetalle();
      cargarHistorial(h.numero);
      $('dlg-alerta').hidden = false;
    }
  } finally {
    btn.textContent = 'Guardar cambio';
    btn.disabled = !estado.elegido;
  }
});

$('dlg').addEventListener('close', () => { estado.abierta = null; estado.detalle = null; });

let temporizadorAviso;
function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { a.hidden = true; }, 6000);
}

// ---------- Editar datos (PATCH /api/habitaciones) ----------
function alertaEd(titulo, mensaje, tipo = 'error') {
  const a = $('ed-alerta');
  a.className = `alerta alerta-${tipo}`;
  a.querySelector('.alerta-icono').textContent = tipo === 'bloqueo' ? '🔒' : tipo === 'ok' ? '✔' : '⚠';
  $('ed-alerta-titulo').textContent = titulo;
  $('ed-alerta-mensaje').textContent = mensaje;
  a.hidden = false;
}

$('form-editar').addEventListener('submit', async e => {
  e.preventDefault();
  const h = habitacionAbierta();
  if (!h) return;
  const nfc = $('ed-nfc').value.trim().toUpperCase();
  if (nfc && !/^[0-9A-F]{8}$/.test(nfc)) {
    alertaEd('Revisa la etiqueta NFC', 'Son 8 caracteres hexadecimales (0-9 y A-F), por ejemplo 04A1B2C3. Déjala vacía para quitarla.', 'aviso');
    return $('ed-nfc').focus();
  }
  const capacidad = Number($('ed-capacidad').value);
  if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 6) {
    alertaEd('Revisa la capacidad', 'Debe ser un número entero del 1 al 6.', 'aviso');
    return $('ed-capacidad').focus();
  }
  $('ed-alerta').hidden = true;
  const btn = $('btn-guardar-datos');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const r = await api('/habitaciones', {
      method: 'PATCH',
      body: { numero: h.numero, version: h.version, tipo: $('ed-tipo').value, capacidad, nfc_uid: nfc }
    });
    if (r.sin_cambios) {
      alertaEd('Sin cambios', 'Los datos ya eran esos; no se modificó nada.', 'aviso');
      return;
    }
    // Se vuelve a leer la habitación de la base y se compara con lo que se envió
    estado.recienCambiada = h.numero;
    estado.edVersion = null;
    await cargarHabitaciones();
    const d = await cargarHistorial(h.numero);
    const b = d?.habitacion;
    const verificado = b && b.version === r.version_nueva &&
      Object.entries(r.cambios).every(([campo, valor]) => (b[campo] ?? null) === valor);
    const texto = verificado
      ? `${r.mensaje}. Verificado en MongoDB: versión ${r.version_anterior} → ${r.version_nueva}.`
      : `${r.mensaje}, pero la consulta muestra otros datos: alguien la volvió a cambiar.`;
    alertaEd('Datos guardados', texto, 'ok');
    avisar(`✔ ${texto}`);
  } catch (err) {
    if (err.status === 401) return irAlLogin();
    const titulos = { VERSION_DESACTUALIZADA: 'Alguien más la cambió primero', NFC_DUPLICADO: 'Etiqueta NFC en uso', SIN_PERMISO: 'Sin permiso' };
    alertaEd(titulos[err.codigo] || 'No se guardaron los datos', err.message, err.codigo === 'SIN_PERMISO' ? 'bloqueo' : 'error');
    if (err.codigo === 'VERSION_DESACTUALIZADA') {
      estado.edVersion = null;
      await cargarHabitaciones();
      await cargarHistorial(h.numero);
      $('ed-alerta').hidden = false;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar datos';
  }
});

// ---------- Eliminar habitación (DELETE /api/habitaciones) ----------
function alertaEl(titulo, mensaje, tipo = 'error') {
  const a = $('el-alerta');
  a.className = `alerta alerta-${tipo}`;
  a.querySelector('.alerta-icono').textContent = tipo === 'bloqueo' ? '🔒' : '⚠';
  $('el-alerta-titulo').textContent = titulo;
  $('el-alerta-mensaje').textContent = mensaje;
  a.hidden = false;
}

$('el-confirmar').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
  const h = habitacionAbierta();
  $('btn-eliminar').disabled = !h || e.target.value !== String(h.numero);
});

$('btn-eliminar').addEventListener('click', async () => {
  const h = habitacionAbierta();
  if (!h || $('el-confirmar').value !== String(h.numero)) return;
  $('el-alerta').hidden = true;
  const btn = $('btn-eliminar');
  btn.disabled = true;
  btn.textContent = 'Eliminando…';
  try {
    const qs = new URLSearchParams({ numero: String(h.numero), version: String(h.version) });
    const r = await api(`/habitaciones?${qs}`, { method: 'DELETE' });

    // Verificación: al consultarla otra vez, la base debe responder que ya no existe (404)
    let verificado = false;
    try { await api(`/habitaciones/historial?numero=${h.numero}`); }
    catch (err) { verificado = err.status === 404; }

    $('dlg').close();
    await cargarHabitaciones();
    const conservado = r.historial_conservado
      ? ` Se conservaron ${r.historial_conservado} registro(s) de su historial.` : '';
    avisar(verificado
      ? `✔ ${r.mensaje}. Verificado en MongoDB: ya no existe.${conservado}`
      : `${r.mensaje}, pero la consulta todavía la encuentra. Actualiza la página.`);
  } catch (err) {
    if (err.status === 401) return irAlLogin();
    const titulos = {
      TIENE_DEPENDENCIAS: 'No se puede eliminar todavía',
      VERSION_DESACTUALIZADA: 'Alguien más la cambió primero',
      NO_EXISTE: 'Ya no existe',
      SIN_PERMISO: 'Sin permiso'
    };
    alertaEl(titulos[err.codigo] || 'No se eliminó la habitación', err.message, err.codigo === 'SIN_PERMISO' ? 'bloqueo' : 'error');
    if (['VERSION_DESACTUALIZADA', 'NO_EXISTE'].includes(err.codigo)) {
      await cargarHabitaciones();
      if (err.codigo === 'VERSION_DESACTUALIZADA') { estado.edVersion = null; await cargarHistorial(h.numero); }
    }
  } finally {
    btn.textContent = 'Eliminar habitación';
    const actual = habitacionAbierta();
    btn.disabled = !actual || $('el-confirmar').value !== String(actual.numero);
  }
});

// ---------- Agregar habitación (POST /api/habitaciones) ----------
const CAPACIDAD_POR_TIPO = { king: 2, doble_queen: 4, suite: 4, accesible: 2 };

function alertaAlta(titulo, mensaje, tipo = 'error') {
  const a = $('alta-alerta');
  a.className = `alerta alerta-${tipo}`;
  a.querySelector('.alerta-icono').textContent = tipo === 'bloqueo' ? '🔒' : '⚠';
  $('alta-alerta-titulo').textContent = titulo;
  $('alta-alerta-mensaje').textContent = mensaje;
  a.hidden = false;
}

function abrirAlta(numero = '') {
  $('form-alta').reset();
  $('al-numero').value = numero;
  $('al-capacidad').value = CAPACIDAD_POR_TIPO[$('al-tipo').value];
  $('al-campo-motivo').hidden = true;
  $('alta-alerta').hidden = true;
  $('dlg-alta').showModal();
  (numero ? $('al-tipo') : $('al-numero')).focus();
}

$('btn-agregar').addEventListener('click', () => abrirAlta(/^[1-6]\d{2}$/.test(estado.filtroQ) ? estado.filtroQ : ''));
$('al-tipo').addEventListener('change', e => { $('al-capacidad').value = CAPACIDAD_POR_TIPO[e.target.value]; });
$('al-estado').addEventListener('change', e => {
  $('al-campo-motivo').hidden = e.target.value !== 'bloqueada';
  if (e.target.value === 'bloqueada') $('al-motivo').focus();
});
$('al-numero').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });

$('form-alta').addEventListener('submit', async e => {
  e.preventDefault();
  $('alta-alerta').hidden = true;
  const numero = $('al-numero').value;
  if (!/^[1-6]\d{2}$/.test(numero) || Number(numero) % 100 === 0) {
    alertaAlta('Revisa el número', 'Escribe piso + habitación, por ejemplo 124 (piso 1) o 615 (piso 6).', 'aviso');
    return $('al-numero').focus();
  }
  const nfc = $('al-nfc').value.trim().toUpperCase();
  if (nfc && !/^[0-9A-F]{8}$/.test(nfc)) {
    alertaAlta('Revisa la etiqueta NFC', 'Son 8 caracteres hexadecimales, por ejemplo 04A1B2C3, o déjala vacía.', 'aviso');
    return $('al-nfc').focus();
  }
  const estadoInicial = $('al-estado').value;
  const motivo = $('al-motivo').value.trim();
  if (estadoInicial === 'bloqueada' && motivo.length < 5) {
    alertaAlta('Falta el motivo', 'Escribe por qué empieza bloqueada (mínimo 5 caracteres).', 'aviso');
    return $('al-motivo').focus();
  }

  const btn = $('btn-alta');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-chico" aria-hidden="true"></span> Agregando…';
  try {
    const r = await api('/habitaciones', {
      method: 'POST',
      body: {
        numero: Number(numero), tipo: $('al-tipo').value, capacidad: Number($('al-capacidad').value),
        ...(nfc ? { nfc_uid: nfc } : {}), estado_inicial: estadoInicial, ...(estadoInicial === 'bloqueada' ? { motivo } : {})
      }
    });
    $('dlg-alta').close();
    // Se muestra la habitación nueva buscándola en la base
    Object.assign(estado, { filtroEstado: '', filtroPiso: '', filtroTipo: '', filtroQ: String(r.habitacion.numero), recienCambiada: r.habitacion.numero });
    $('buscar').value = estado.filtroQ;
    $('filtro-piso').value = '';
    $('filtro-tipo').value = '';
    await cargarHabitaciones();
    const d = await abrirDetalle(r.habitacion.numero);
    const texto = d?.habitacion?.numero === r.habitacion.numero
      ? `${r.mensaje}. Verificado en MongoDB: existe con versión ${d.habitacion.version}.`
      : `${r.mensaje}, pero no aparece al consultarla. Actualiza la página.`;
    alertaDlg('Habitación agregada', texto, 'ok');
    avisar(`✔ ${texto}`);
  } catch (err) {
    if (err.status === 401) return irAlLogin();
    const titulos = { YA_EXISTE: 'Ese número ya existe', NFC_DUPLICADO: 'Etiqueta NFC en uso', SIN_PERMISO: 'Sin permiso', DATOS_INVALIDOS: 'Revisa los datos' };
    alertaAlta(titulos[err.codigo] || 'No se agregó la habitación', err.message, err.codigo === 'SIN_PERMISO' ? 'bloqueo' : 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Agregar habitación';
  }
});

// ---------- Inicio ----------
if (await cargarUsuario()) {
  await cargarHabitaciones();
  // Refresco automático para ver cambios hechos desde otros equipos (pausado con el diálogo abierto)
  setInterval(() => { if (!$('dlg').open && !document.hidden) cargarHabitaciones(); }, 30000);
}
