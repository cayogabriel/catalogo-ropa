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
const SEGUNDOS_CACHE_REFERENCIAS = 600;

function ahora_() {
  return new Date();
}

// Tope de filas de `eventos`. El libro (10 millones de celdas) es el mismo de los productos: un abuso
// sostenido no debe poder llenarlo y dejar el Panel sin poder guardar. 100 000 filas × 7 columnas =
// 700 000 celdas, y alcanzan para ~2 800 eventos por día durante los 35 días que se guardan.
function topeFilasEventos_() {
  return 100000;
}

// Ids de prendas y temporadas de la copia publicada, o null si no hay copia. Igual que el índice de
// fotos: la clave incluye la última modificación del archivo, así una publicación nueva la invalida sola.
function referenciasPublicadas_(config) {
  const archivo = abrirArchivo_(config.publicado_id);
  if (!archivo) return null;
  const clave = 'refs_' + archivo.getId() + '_' + archivo.getLastUpdated().getTime();
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(clave);
  if (guardado) {
    try {
      return JSON.parse(guardado);
    } catch (e) {
      // caché dañada: se vuelve a leer
    }
  }
  const publicado = leerJson_(archivo) || {};
  const ids = function (lista) {
    return (Array.isArray(lista) ? lista : [])
      .map(function (x) {
        return x && x.id;
      })
      .filter(Boolean);
  };
  const refs = { productos: ids(publicado.productos), temporadas: ids(publicado.temporadas) };
  try {
    cache.put(clave, JSON.stringify(refs), SEGUNDOS_CACHE_REFERENCIAS);
  } catch (e) {
    // demasiado grande para la caché: se sigue leyendo del archivo
  }
  return refs;
}

// Un evento solo puede nombrar prendas y temporadas publicadas: así nadie llena `estadisticas_diarias`
// con ids inventados (el patrón solo garantiza la forma, no que existan).
function referenciasConocidas_(config, evento) {
  if (!evento.p && !evento.s) return true;
  const refs = referenciasPublicadas_(config);
  if (!refs) return false;
  const prendaOk = !evento.p || refs.productos.indexOf(evento.p) !== -1;
  const temporadaOk = !evento.s || refs.temporadas.indexOf(evento.s) !== -1;
  return prendaOk && temporadaOk;
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
  if (!referenciasConocidas_(config, evento)) return 'descartado'; // antes del candado: puede leer Drive
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(ESPERA_CANDADO_EVENTOS_MS)) return 'descartado'; // mejor perder un clic que arriesgar la hoja
  try {
    if (!hayCupoEnEsteMinuto_()) return 'descartado';
    const hoja = SpreadsheetApp.openById(config.hoja_id).getSheetByName('eventos');
    if (!hoja) return 'sin_instalacion';
    if (hoja.getLastRow() - 1 >= topeFilasEventos_()) return 'descartado'; // hasta que diario_() borre los viejos
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
