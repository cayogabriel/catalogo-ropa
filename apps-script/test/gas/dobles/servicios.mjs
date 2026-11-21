// Dobles de los servicios simples de Apps Script.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { crearBlob, aBuffer, bytesConSigno } from './blob.mjs';

function crearAlmacenPropiedades() {
  const almacen = new Map();
  const props = {
    getProperty: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setProperty: (k, v) => (almacen.set(k, String(v)), props),
    setProperties: (o) => (Object.entries(o).forEach(([k, v]) => almacen.set(k, String(v))), props),
    getProperties: () => Object.fromEntries(almacen),
    deleteProperty: (k) => (almacen.delete(k), props),
  };
  return { props, almacen };
}

export function crearPropiedades() {
  const script = crearAlmacenPropiedades();
  const usuario = crearAlmacenPropiedades();
  return {
    PropertiesService: { getScriptProperties: () => script.props, getUserProperties: () => usuario.props },
    almacen: script.almacen,
  };
}

// CacheService: vence según el reloj del doble (ttl en segundos, 600 por defecto)
// y, como Google, no acepta valores de más de 100 KB.
export function crearCache(reloj) {
  const almacen = new Map(); // clave → { valor, vence }
  const MAX = 100 * 1024;
  const vigente = (k) => almacen.has(k) && reloj.ahora() < almacen.get(k).vence;
  const guardar = (k, v, ttl = 600) => {
    const valor = String(v);
    if (Buffer.byteLength(valor, 'utf8') > MAX) throw new Error('Exception: Argument too large: value');
    almacen.set(k, { valor, vence: reloj.ahora() + ttl * 1000 });
  };
  const cache = {
    get: (k) => (vigente(k) ? almacen.get(k).valor : null),
    put: (k, v, ttl) => void guardar(k, v, ttl),
    remove: (k) => void almacen.delete(k),
    getAll: (ks) => Object.fromEntries(ks.filter(vigente).map((k) => [k, almacen.get(k).valor])),
    putAll: (o, ttl) => void Object.entries(o).forEach(([k, v]) => guardar(k, v, ttl)),
  };
  return { CacheService: { getScriptCache: () => cache }, almacen };
}

// Un solo hilo en los tests: el candado siempre se concede, pero se cuenta.
export function crearCandado() {
  const estado = { tomado: false, tomas: 0 };
  // estado.fallar = true simula que otra ejecución tiene el candado (en Google puede pasar).
  const lock = {
    tryLock: () => {
      if (estado.fallar) return false;
      estado.tomado = true;
      estado.tomas++;
      return true;
    },
    waitLock: () => {
      if (estado.fallar) throw new Error('Exception: Could not obtain lock after 1 seconds.');
      estado.tomado = true;
      estado.tomas++;
    },
    releaseLock: () => void (estado.tomado = false),
    hasLock: () => estado.tomado,
  };
  return { LockService: { getScriptLock: () => lock, getDocumentLock: () => lock }, estado };
}

// ScriptApp: solo los activadores por reloj que usa el proyecto.
export function crearScriptApp() {
  const activadores = [];
  let secuencia = 0;
  const EventType = { CLOCK: 'CLOCK' };
  const ScriptApp = {
    EventType,
    getProjectTriggers: () => [...activadores],
    deleteTrigger: (t) => void activadores.splice(activadores.indexOf(t), 1),
    newTrigger: (funcion) => {
      const detalle = { funcion };
      const reloj = {
        everyDays: (n) => ((detalle.cadaDias = n), reloj),
        everyHours: (n) => ((detalle.cadaHoras = n), reloj),
        everyMinutes: (n) => ((detalle.cadaMinutos = n), reloj),
        onMonthDay: (d) => ((detalle.diaMes = d), reloj),
        atHour: (h) => ((detalle.hora = h), reloj),
        after: (ms) => ((detalle.despues = ms), reloj),
        create: () => {
          const id = `trigger-${++secuencia}`;
          const t = { getHandlerFunction: () => funcion, getUniqueId: () => id, getEventType: () => EventType.CLOCK, _detalle: detalle };
          activadores.push(t);
          return t;
        },
      };
      return { timeBased: () => reloj };
    },
  };
  return { ScriptApp, activadores };
}

export function crearUrlFetch() {
  const respuestas = [];
  const llamadas = [];
  const UrlFetchApp = {
    fetch: (url, opciones = {}) => {
      llamadas.push({ url, opciones });
      const r = respuestas.find((x) => x.patron.test(url));
      if (!r) throw new Error(`UrlFetchApp: sin respuesta programada para ${url}`);
      if ((r.codigo ?? 200) >= 400 && !opciones.muteHttpExceptions) {
        throw new Error(`Exception: Request failed for ${url} returned code ${r.codigo}.`);
      }
      const cuerpo = r.bytes ? aBuffer(r.bytes) : Buffer.from(r.texto ?? '', 'utf8');
      return {
        getResponseCode: () => r.codigo ?? 200,
        getContentText: () => cuerpo.toString('utf8'),
        getBlob: () => crearBlob(cuerpo, r.tipo ?? 'application/octet-stream', url.split('/').pop()),
        getContent: () => bytesConSigno(cuerpo),
        getHeaders: () => ({ 'Content-Type': r.tipo ?? 'text/plain' }),
      };
    },
  };
  return {
    UrlFetchApp,
    ayudas: { llamadas, responder: (patron, respuesta) => respuestas.push({ patron, ...respuesta }) },
  };
}

// Desfases fijos que el proyecto usa (Lima no tiene horario de verano).
const DESFASES = { 'America/Lima': -5 * 60, UTC: 0, GMT: 0, 'Etc/GMT': 0 };

// Subconjunto de los patrones de SimpleDateFormat: yyyy MM dd HH mm ss XXX y 'literales'.
function formatearFecha(fecha, zona, patron) {
  if (!(zona in DESFASES)) throw new Error(`formatDate: zona no soportada por el doble: ${zona}`);
  const desfase = DESFASES[zona];
  const local = new Date(fecha.getTime() + desfase * 60_000);
  const dos = (n) => String(n).padStart(2, '0');
  const xxx = desfase === 0 ? 'Z' : `${desfase < 0 ? '-' : '+'}${dos(Math.floor(Math.abs(desfase) / 60))}:${dos(Math.abs(desfase) % 60)}`;
  const piezas = {
    yyyy: String(local.getUTCFullYear()),
    MM: dos(local.getUTCMonth() + 1),
    dd: dos(local.getUTCDate()),
    HH: dos(local.getUTCHours()),
    mm: dos(local.getUTCMinutes()),
    ss: dos(local.getUTCSeconds()),
    XXX: xxx,
  };
  return patron.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss|XXX/g, (token, literal) => (literal !== undefined ? literal : piezas[token]));
}

export function crearUtilidades() {
  return {
    Utilities: {
      base64Encode: (datos) => aBuffer(datos).toString('base64'),
      base64Decode: (texto) => bytesConSigno(Buffer.from(texto, 'base64')),
      newBlob: (datos, tipo, nombre) => crearBlob(datos, tipo, nombre),
      getUuid: () => randomUUID(),
      formatDate: formatearFecha,
      sleep: () => {},
    },
  };
}

export function crearSesion({ usuario, dueno }) {
  return {
    Session: {
      getActiveUser: () => ({ getEmail: () => usuario }),
      getEffectiveUser: () => ({ getEmail: () => dueno }),
      getScriptTimeZone: () => 'America/Lima',
    },
  };
}

export function crearContenido() {
  const MimeTypeSalida = { JSON: 'JSON', TEXT: 'TEXT', JAVASCRIPT: 'JAVASCRIPT' };
  return {
    ContentService: {
      MimeType: MimeTypeSalida,
      createTextOutput: (contenido = '') => {
        let texto = contenido;
        let tipo = MimeTypeSalida.TEXT;
        const salida = {
          getContent: () => texto,
          setContent: (t) => ((texto = t), salida),
          setMimeType: (m) => ((tipo = m), salida),
          getMimeType: () => tipo,
        };
        return salida;
      },
    },
  };
}

// HtmlService: lee los .html del proyecto (ui/index → <base>/ui/index.html).
// Las plantillas soportan <?= expr ?> (escapado) y <?!= expr ?> (crudo),
// evaluados en el contexto del código GAS. S4 amplía esto si necesita <? ?>.
export function crearHtml() {
  const estado = { base: null, ctx: null };
  const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const leer = (nombre) => readFileSync(join(estado.base, `${nombre}.html`), 'utf8');

  function salida(html) {
    let contenido = html;
    let titulo = '';
    const metas = [];
    let marcos = 'DEFAULT';
    const o = {
      getContent: () => contenido,
      setContent: (c) => ((contenido = c), o),
      append: (c) => ((contenido += c), o),
      setTitle: (t) => ((titulo = t), o),
      getTitle: () => titulo,
      addMetaTag: (nombre, valor) => (metas.push({ nombre, valor }), o),
      getMetaTags: () => metas,
      setXFrameOptionsMode: (m) => ((marcos = m), o),
      getXFrameOptionsMode: () => marcos,
      setFaviconUrl: () => o,
      setSandboxMode: () => o,
    };
    return o;
  }

  function evaluar(html, variables) {
    const ejecutar = vm.runInContext('(function (__v, __e) { with (__v) { return eval(__e); } })', estado.ctx);
    return html.replace(/<\?(!?)=\s*([\s\S]*?)\s*\?>/g, (_, crudo, expr) => {
      const valor = ejecutar(variables, expr);
      return crudo ? String(valor) : escapar(valor);
    });
  }

  const HtmlService = {
    XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
    SandboxMode: { IFRAME: 'IFRAME' },
    createHtmlOutput: (html = '') => salida(html),
    createHtmlOutputFromFile: (nombre) => salida(leer(nombre)),
    createTemplateFromFile: (nombre) => {
      const plantilla = {};
      Object.defineProperty(plantilla, 'evaluate', {
        enumerable: false,
        value: () => salida(evaluar(leer(nombre), plantilla)),
      });
      return plantilla;
    },
  };
  return { HtmlService, estado };
}
