// Eventos anónimos (POST). Ver docs/contracts/api-publica.md · Eventos.
// Sin datos personales: solo se guardan los 6 campos del contrato, ya validados con patrones exactos.
// Esta es la ÚNICA escritura del proyecto: una fila nueva en la pestaña `eventos`.

const TIPOS_EVENTO = ['vista', 'whatsapp', 'favorito', 'compartir', 'revista_descarga'];
const ORIGENES_EVENTO = ['web', 'revista_web', 'pdf', 'catalogo_pdf'];
const CLAVES_EVENTO = ['t', 'p', 's', 'o', 'pg', 'ss'];
const PATRON_PRODUCTO = /^prd_[0-9a-f]{8}$/;
const PATRON_TEMPORADA = /^tem_[0-9a-f]{8}$/;
// La ruta empieza con «/», así que nunca empieza con «=»; además la columna es de texto.
const PATRON_PAGINA = /^\/[A-Za-z0-9\/_.?=&%-]{0,199}$/;
const PATRON_SESION = /^[a-z0-9]{8,32}$/;
const MAX_CUERPO = 1000;
const EVENTOS_POR_MINUTO = 120;
const ESPERA_CANDADO_EVENTOS_MS = 3000;
const FORMATOS_EVENTO = ['yyyy-mm-dd hh:mm:ss', '@', '@', '@', '@', '@', '@'];

function ahora_() {
  return new Date();
}

// → evento normalizado { t, p, s, o, pg, ss } o null si no cumple el formato.
function leerEvento_(e) {
  const texto = e && e.postData && e.postData.contents;
  if (typeof texto !== 'string' || texto.trim() === '' || texto.length > MAX_CUERPO) return null;
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (err) {
    return null;
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const claves = Object.keys(datos);
  if (claves.some(function (k) {
    return CLAVES_EVENTO.indexOf(k) === -1;
  })) return null; // ningún dato extra: nada que identifique a la clienta
  const cadena = function (v, patron) {
    return typeof v === 'string' && patron.test(v);
  };
  const opcional = function (v, patron) {
    return v === undefined || v === null || cadena(v, patron);
  };
  if (TIPOS_EVENTO.indexOf(datos.t) === -1 || ORIGENES_EVENTO.indexOf(datos.o) === -1) return null;
  if (!cadena(datos.pg, PATRON_PAGINA) || !cadena(datos.ss, PATRON_SESION)) return null;
  if (!opcional(datos.p, PATRON_PRODUCTO) || !opcional(datos.s, PATRON_TEMPORADA)) return null;
  return { t: datos.t, p: datos.p || null, s: datos.s || null, o: datos.o, pg: datos.pg, ss: datos.ss };
}

// Cuenta del minuto actual en la caché; true si todavía hay cupo (y lo gasta). Debe llamarse con el candado tomado.
function hayCupoEnEsteMinuto_() {
  const cache = CacheService.getScriptCache();
  const clave = 'ev_' + Math.floor(ahora_().getTime() / 60000);
  const usados = Number(cache.get(clave) || 0);
  if (usados >= EVENTOS_POR_MINUTO) return false;
  cache.put(clave, String(usados + 1), 120);
  return true;
}

// → 'ok' | 'descartado' | 'sin_instalacion'
function registrarEvento_(evento) {
  const config = config_(false);
  if (!config || !config.hoja_id) return 'sin_instalacion';
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(ESPERA_CANDADO_EVENTOS_MS)) return 'descartado'; // mejor perder un clic que arriesgar la hoja
  try {
    if (!hayCupoEnEsteMinuto_()) return 'descartado';
    const hoja = SpreadsheetApp.openById(config.hoja_id).getSheetByName('eventos');
    if (!hoja) return 'sin_instalacion';
    const fila = Math.max(hoja.getLastRow(), 1) + 1;
    if (fila > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), 1000);
    const rango = hoja.getRange(fila, 1, 1, 7);
    rango.setNumberFormats([FORMATOS_EVENTO]);
    rango.setValues([[ahora_(), evento.t, evento.p || '', evento.s || '', evento.o, evento.pg, evento.ss]]);
    return 'ok';
  } finally {
    candado.releaseLock();
  }
}
