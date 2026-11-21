// Utilidades comunes del Panel: errores del contrato, ids, fechas de Lima, candado y marcas de cambios.
// Las funciones terminan en _ para que no se puedan llamar desde el navegador.

const PATRON_ISO = "yyyy-MM-dd'T'HH:mm:ssXXX";
const ZONA_LIMA = 'America/Lima';
const ESPERA_CANDADO_MS = 20000;
// Estado del candado en esta ejecución (el candado de Google no se puede pedir dos veces seguidas).
const ESTADO_CANDADO = { nivel: 0 };

// Errores del contrato: Error('<codigo>: <detalle legible>'). Ver docs/contracts/api-panel.md.
function fallar_(codigo, detalle) {
  throw new Error(codigo + ': ' + detalle);
}

function idNuevo_(prefijo) {
  return prefijo + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
}

function ahora_() {
  return new Date();
}

function aIso_(fecha) {
  return Utilities.formatDate(fecha, ZONA_LIMA, PATRON_ISO);
}

// Texto ISO → Date; null si está vacío o no se entiende.
function deIso_(texto) {
  if (texto === null || texto === undefined || texto === '') return null;
  const ms = Date.parse(String(texto));
  return isNaN(ms) ? null : new Date(ms);
}

// Fecha de calendario en Lima, «AAAA-MM-DD».
function diaLima_(fecha) {
  return Utilities.formatDate(fecha, ZONA_LIMA, 'yyyy-MM-dd');
}

// Ejecuta fn con el candado del script. Si otra ejecución lo tiene, lanza `conflicto`
// sin hacer nada (en Google puede pasar; en los dobles de prueba se puede simular).
function conCandado_(fn) {
  if (ESTADO_CANDADO.nivel > 0) return fn();
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(ESPERA_CANDADO_MS)) {
    fallar_('conflicto', 'hay otra operación guardando; vuelve a intentarlo en unos segundos');
  }
  ESTADO_CANDADO.nivel = 1;
  try {
    return fn();
  } finally {
    ESTADO_CANDADO.nivel = 0;
    candado.releaseLock();
  }
}

// Marcas para «hay cambios sin publicar»: se actualizan en cada escritura del Panel y en cada publicación.
function marcarCambio_() {
  PropertiesService.getScriptProperties().setProperty(PROP.ULTIMO_CAMBIO, String(ahora_().getTime()));
}

function marcarPublicacion_() {
  PropertiesService.getScriptProperties().setProperty(PROP.ULTIMA_PUBLICACION, String(ahora_().getTime()));
}

function hayCambiosSinPublicar_() {
  const props = PropertiesService.getScriptProperties();
  const cambio = Number(props.getProperty(PROP.ULTIMO_CAMBIO) || 0);
  const publicacion = Number(props.getProperty(PROP.ULTIMA_PUBLICACION) || 0);
  return cambio > publicacion;
}
