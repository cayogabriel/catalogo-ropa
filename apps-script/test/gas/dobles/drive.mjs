// Doble de DriveApp en memoria: carpetas, archivos, papelera y búsquedas por nombre.
// Registra las llamadas a getFileById/getFolderById para que los tests puedan
// comprobar qué ids se abrieron.
import { crearBlob } from './blob.mjs';

export const MimeType = {
  FOLDER: 'application/vnd.google-apps.folder',
  GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  PDF: 'application/pdf',
  PLAIN_TEXT: 'text/plain',
  JSON: 'application/json',
};

function iterador(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}

export function crearDrive(reloj) {
  const items = new Map(); // id → { tipo, nombre, padres:Set, papelera, ... }
  const llamadas = { getFileById: [], getFolderById: [] };
  let secuencia = 0;
  const nuevoId = (prefijo) => `${prefijo}${(++secuencia).toString(36).padStart(10, '0')}DRV`;

  function envolverCarpeta(item) {
    const carpeta = {
      getId: () => item.id,
      getName: () => item.nombre,
      setName: (n) => ((item.nombre = n), carpeta),
      getUrl: () => `https://drive.google.com/drive/folders/${item.id}`,
      createFolder: (nombre) => crearCarpeta(nombre, item.id),
      createFile: (a, b, c) => crearArchivo(a, b, c, item.id),
      getFolders: () => iterador(hijos(item.id, 'carpeta').map(envolverCarpeta)),
      getFiles: () => iterador(hijos(item.id, 'archivo').map(envolverArchivo)),
      getFoldersByName: (n) => iterador(hijos(item.id, 'carpeta').filter((x) => x.nombre === n).map(envolverCarpeta)),
      getFilesByName: (n) => iterador(hijos(item.id, 'archivo').filter((x) => x.nombre === n).map(envolverArchivo)),
      getParents: () => iterador([...item.padres].map((p) => envolverCarpeta(items.get(p)))),
      moveTo: (destino) => ((item.padres = new Set([destino.getId()])), carpeta),
      setTrashed: (v) => ((item.papelera = Boolean(v)), carpeta),
      isTrashed: () => item.papelera,
      getLastUpdated: () => new Date(item.actualizado),
    };
    return carpeta;
  }

  function envolverArchivo(item) {
    const tocar = () => (item.actualizado = reloj.avanzar());
    const archivo = {
      getId: () => item.id,
      getName: () => item.nombre,
      setName: (n) => ((item.nombre = n), tocar(), archivo),
      getUrl: () => `https://drive.google.com/file/d/${item.id}/view`,
      getMimeType: () => item.mime,
      getSize: () => item.contenido.length,
      getBlob: () => crearBlob(item.contenido, item.mime, item.nombre),
      setContent: (texto) => ((item.contenido = Buffer.from(texto, 'utf8')), tocar(), archivo),
      getParents: () => iterador([...item.padres].map((p) => envolverCarpeta(items.get(p)))),
      moveTo: (destino) => ((item.padres = new Set([destino.getId()])), tocar(), archivo),
      setTrashed: (v) => ((item.papelera = Boolean(v)), tocar(), archivo),
      isTrashed: () => item.papelera,
      getLastUpdated: () => new Date(item.actualizado),
      getDateCreated: () => new Date(item.creado),
    };
    return archivo;
  }

  function hijos(padreId, tipo) {
    return [...items.values()].filter((x) => x.tipo === tipo && !x.papelera && x.padres.has(padreId));
  }

  const raiz = { id: 'root', tipo: 'carpeta', nombre: 'Mi unidad', padres: new Set(), papelera: false, actualizado: reloj.ahora() };
  items.set('root', raiz);

  function crearCarpeta(nombre, padreId = 'root') {
    const id = nuevoId('fld');
    const item = { id, tipo: 'carpeta', nombre, padres: new Set([padreId]), papelera: false, actualizado: reloj.avanzar() };
    items.set(id, item);
    return envolverCarpeta(item);
  }

  // createFile(blob) o createFile(nombre, contenido, mime), como DriveApp.
  function crearArchivo(a, b, c, padreId = 'root', idFijo = null) {
    const esBlob = a && typeof a.getBytes === 'function';
    const nombre = esBlob ? a.getName() ?? 'Sin título' : a;
    const contenido = esBlob ? a._buffer() : Buffer.from(b ?? '', 'utf8');
    const mime = esBlob ? a.getContentType() : c ?? MimeType.PLAIN_TEXT;
    const id = idFijo ?? nuevoId('fil');
    const momento = reloj.avanzar();
    const item = { id, tipo: 'archivo', nombre, mime, contenido, padres: new Set([padreId]), papelera: false, creado: momento, actualizado: momento };
    items.set(id, item);
    return envolverArchivo(item);
  }

  function buscarPorNombre(nombre, tipo) {
    return [...items.values()].filter((x) => x.tipo === tipo && !x.papelera && x.nombre === nombre);
  }

  const DriveApp = {
    getRootFolder: () => envolverCarpeta(raiz),
    createFolder: (nombre) => crearCarpeta(nombre),
    createFile: (a, b, c) => crearArchivo(a, b, c),
    getFileById: (id) => {
      llamadas.getFileById.push(id);
      const item = items.get(id);
      if (!item || item.tipo !== 'archivo') throw new Error(`Exception: No item with the given ID could be found. (${id})`);
      return envolverArchivo(item);
    },
    getFolderById: (id) => {
      llamadas.getFolderById.push(id);
      const item = items.get(id);
      if (!item || item.tipo !== 'carpeta') throw new Error(`Exception: No item with the given ID could be found. (${id})`);
      return envolverCarpeta(item);
    },
    getFilesByName: (n) => iterador(buscarPorNombre(n, 'archivo').map(envolverArchivo)),
    getFoldersByName: (n) => iterador(buscarPorNombre(n, 'carpeta').map(envolverCarpeta)),
  };

  // Ayudas solo para tests.
  const ayudas = {
    llamadas,
    items,
    registrarArchivo: (id, nombre, mime) => crearArchivo(nombre, '', mime, 'root', id),
    fijarActualizado: (id, fecha) => (items.get(id).actualizado = new Date(fecha).getTime()),
    tocar: (id) => (items.get(id).actualizado = reloj.avanzar()),
    archivosLlamados: (nombre) => buscarPorNombre(nombre, 'archivo').map(envolverArchivo),
  };

  return { DriveApp, ayudas };
}
