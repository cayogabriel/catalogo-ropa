// Dobles de los servicios simples de Apps Script.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { crearBlob, aBuffer, bytesConSigno } from './blob.mjs';

export function crearPropiedades() {
  const almacen = new Map();
  const props = {
    getProperty: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setProperty: (k, v) => (almacen.set(k, String(v)), props),
    setProperties: (o) => (Object.entries(o).forEach(([k, v]) => almacen.set(k, String(v))), props),
    getProperties: () => Object.fromEntries(almacen),
    deleteProperty: (k) => (almacen.delete(k), props),
  };
  return { PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props }, almacen };
}

export function crearCache() {
  const almacen = new Map();
  const cache = {
    get: (k) => (almacen.has(k) ? almacen.get(k) : null),
    put: (k, v) => void almacen.set(k, String(v)),
    remove: (k) => void almacen.delete(k),
    getAll: (ks) => Object.fromEntries(ks.filter((k) => almacen.has(k)).map((k) => [k, almacen.get(k)])),
    putAll: (o) => void Object.entries(o).forEach(([k, v]) => almacen.set(k, String(v))),
  };
  return { CacheService: { getScriptCache: () => cache }, almacen };
}

export function crearCandado() {
  let tomado = false;
  const lock = {
    tryLock: () => ((tomado = true), true),
    waitLock: () => void (tomado = true),
    releaseLock: () => void (tomado = false),
    hasLock: () => tomado,
  };
  return { LockService: { getScriptLock: () => lock, getDocumentLock: () => lock } };
}

export function crearUrlFetch() {
  const respuestas = [];
  const llamadas = [];
  const UrlFetchApp = {
    fetch: (url, opciones = {}) => {
      llamadas.push({ url, opciones });
      const r = respuestas.find((x) => x.patron.test(url));
      if (!r) throw new Error(`UrlFetchApp: sin respuesta programada para ${url}`);
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

export function crearUtilidades() {
  return {
    Utilities: {
      base64Encode: (datos) => aBuffer(datos).toString('base64'),
      base64Decode: (texto) => bytesConSigno(Buffer.from(texto, 'base64')),
      newBlob: (datos, tipo, nombre) => crearBlob(datos, tipo, nombre),
      getUuid: () => randomUUID(),
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
