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
  administracion: 'Como Administración puedes hacer cualquier cambio permitido por el flujo de estados.',
  gerencia: 'Tu rol solo consulta: puedes ver el estado y el historial, pero no cambiarlos.'
};

const estado = {
  datos: null,          // última respuesta de GET /api/habitaciones
  filtroEstado: '',
  filtroPiso: '',
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
    estado.datos = await api(`/habitaciones${qs.size ? `?${qs}` : ''}`);
    pintarFiltros();
    pintarRack();
    $('actualizado').textContent = `Actualizado ${soloHora(estado.datos.generado_en)}`;
    $('rack').hidden = false;
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
    $('rack').innerHTML = '<p class="vacio">Ninguna habitación coincide con este filtro. Prueba con “Todas”.</p>';
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
$('btn-actualizar').addEventListener('click', cargarHabitaciones);
$('rack').addEventListener('click', e => {
  const b = e.target.closest('.hab');
  if (b) abrirDetalle(Number(b.dataset.numero));
});

// ---------- Diálogo de detalle ----------
// Primero se usa el dato de la lista (respuesta inmediata) y luego el detalle fresco de la base
const habitacionAbierta = () =>
  (estado.detalle?.numero === estado.abierta ? estado.detalle : null) ||
  estado.datos?.habitaciones.find(h => h.numero === estado.abierta) || null;

function abrirDetalle(numero) {
  estado.abierta = numero;
  estado.detalle = null;
  estado.elegido = null;
  $('motivo').value = '';
  ocultarAlertaDlg();
  pintarDetalle();
  if (!$('dlg').open) $('dlg').showModal();
  cargarHistorial(numero);
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
    ${h.camarista ? `<div><dt>Camarista</dt><dd>${esc(h.camarista)}</dd></div>` : ''}
    ${h.bloqueo ? `<div class="ancho"><dt>Motivo del bloqueo</dt><dd>${esc(h.bloqueo.motivo)}</dd></div>` : ''}`;

  $('opciones-estado').innerHTML = h.permitidas.map(a => `
    <label class="opcion" style="--color:${ESTADOS[a].color}">
      <input type="radio" name="estado_nuevo" value="${a}" ${estado.elegido === a ? 'checked' : ''} />
      <span><span class="punto"></span>${ESTADOS[a].etiqueta}</span>
    </label>`).join('');
  const sinOpciones = !h.permitidas.length;
  $('sin-opciones').hidden = !sinOpciones;
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

// ---------- Inicio ----------
if (await cargarUsuario()) {
  await cargarHabitaciones();
  // Refresco automático para ver cambios hechos desde otros equipos (pausado con el diálogo abierto)
  setInterval(() => { if (!$('dlg').open && !document.hidden) cargarHabitaciones(); }, 30000);
}
