// Doble de DriveApp en memoria: carpetas, archivos, dueños, papelera y búsquedas.
// Imita lo peor que Google permite: las búsquedas por nombre y los listados de
// carpeta TAMBIÉN devuelven lo que está en la papelera y lo compartido por otras
// cuentas; solo searchFiles() filtra (por nombre, «'me' in owners» y «trashed»).
// Registra las llamadas a getFileById/getFolderById para los tests.
import { crearBlob } from './blob.mjs';

// Solo los valores que existen en el enum MimeType de Apps Script.
export const MimeType = {
  FOLDER: 'application/vnd.google-apps.folder',
  GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet',
  GOOGLE_DOCS: 'application/vnd.google-apps.document',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  PDF: 'application/pdf',
  PLAIN_TEXT: 'text/plain',
};

function iterador(lista) {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
}

export function crearDrive(reloj, { dueno }) {
  const items = new Map(); // id → { tipo, nombre, padres:Set, papelera, dueno, ... }
  const llamadas = { getFileById: [], getFolderById: [], searchFiles: [] };
  let secuencia = 0;
  const nuevoId = (prefijo) => `${prefijo}${(++secuencia).toString(36).padStart(10, '0')}DRV`;

  // En la papelera si el propio ítem o alguna carpeta que lo contiene lo está.
  function enPapelera(item) {
    if (item.papelera) return true;
    return [...item.padres].some((p) => items.has(p) && enPapelera(items.get(p)));
  }

  function hijos(padreId, tipo) {
    return [...items.values()].filter((x) => x.tipo === tipo && x.padres.has(padreId));
  }

  const comunes = (item, obj, tocar) => ({
    getId: () => item.id,
    getName: () => item.nombre,
    setName: (n) => ((item.nombre = n), tocar(), obj()),
    getParents: () => iterador([...item.padres].filter((p) => items.has(p)).map((p) => envolverCarpeta(items.get(p)))),
    moveTo: (destino) => ((item.padres = new Set([destino.getId()])), tocar(), obj()),
    setTrashed: (v) => ((item.papelera = Boolean(v)), tocar(), obj()),
    isTrashed: () => enPapelera(item),
    getLastUpdated: () => new Date(item.actualizado),
    getOwner: () => ({ getEmail: () => item.dueno }),
  });

  function envolverCarpeta(item) {
    const carpeta = {
      ...comunes(item, () => carpeta, () => {}),
      getUrl: () => `https://drive.google.com/drive/folders/${item.id}`,
      createFolder: (nombre) => crearCarpeta(nombre, item.id),
      createFile: (a, b, c) => crearArchivo(a, b, c, item.id),
      getFolders: () => iterador(hijos(item.id, 'carpeta').map(envolverCarpeta)),
      getFiles: () => iterador(hijos(item.id, 'archivo').map(envolverArchivo)),
      getFoldersByName: (n) => iterador(hijos(item.id, 'carpeta').filter((x) => x.nombre === n).map(envolverCarpeta)),
      getFilesByName: (n) => iterador(hijos(item.id, 'archivo').filter((x) => x.nombre === n).map(envolverArchivo)),
    };
    return carpeta;
  }

  function envolverArchivo(item) {
    const tocar = () => (item.actualizado = reloj.avanzar());
    const archivo = {
      ...comunes(item, () => archivo, tocar),
      getUrl: () => `https://drive.google.com/file/d/${item.id}/view`,
      getMimeType: () => item.mime,
      getSize: () => item.contenido.length,
      getBlob: () => crearBlob(item.contenido, item.mime, item.nombre),
      setContent: (texto) => ((item.contenido = Buffer.from(texto, 'utf8')), tocar(), archivo),
      getDateCreated: () => new Date(item.creado),
    };
    return archivo;
  }

  const raiz = { id: 'root', tipo: 'carpeta', nombre: 'Mi unidad', padres: new Set(), papelera: false, dueno, actualizado: reloj.ahora() };
  items.set('root', raiz);

  function crearCarpeta(nombre, padreId = 'root') {
    const id = nuevoId('fld');
    const item = { id, tipo: 'carpeta', nombre, padres: new Set([padreId]), papelera: false, dueno, actualizado: reloj.avanzar() };
    items.set(id, item);
    return envolverCarpeta(item);
  }

  // createFile(blob) o createFile(nombre, contenido, mime), como DriveApp.
  function crearArchivo(a, b, c, padreId = 'root', { idFijo = null, propietario = dueno } = {}) {
    const esBlob = a && typeof a.getBytes === 'function';
    const nombre = esBlob ? a.getName() ?? 'Sin título' : a;
    const contenido = esBlob ? a._buffer() : Buffer.from(b ?? '', 'utf8');
    const mime = esBlob ? a.getContentType() : c ?? MimeType.PLAIN_TEXT;
    const id = idFijo ?? nuevoId('fil');
    const momento = reloj.avanzar();
    const padres = padreId === null ? new Set() : new Set([padreId]);
    const item = { id, tipo: 'archivo', nombre, mime, contenido, padres, papelera: false, dueno: propietario, creado: momento, actualizado: momento };
    items.set(id, item);
    return envolverArchivo(item);
  }

  const porNombre = (nombre, tipo) => [...items.values()].filter((x) => x.tipo === tipo && x.nombre === nombre);

  // Subconjunto del lenguaje de búsqueda de Drive: condiciones unidas con «and».
  function searchFiles(consulta) {
    llamadas.searchFiles.push(consulta);
    const filtros = consulta.split(/\s+and\s+/i).map((condicion) => {
      let m;
      if ((m = /^title\s*=\s*(["'])(.*)\1$/.exec(condicion.trim()))) return (x) => x.nombre === m[2];
      if (/^(["'])me\1\s+in\s+owners$/.test(condicion.trim())) return (x) => x.dueno === dueno;
      if ((m = /^trashed\s*=\s*(true|false)$/.exec(condicion.trim()))) return (x) => enPapelera(x) === (m[1] === 'true');
      if ((m = /^mimeType\s*=\s*(["'])(.*)\1$/.exec(condicion.trim()))) return (x) => x.mime === m[2];
      throw new Error(`searchFiles: condición no soportada por el doble: ${condicion}`);
    });
    const lista = [...items.values()].filter((x) => x.tipo === 'archivo' && filtros.every((f) => f(x)));
    return iterador(lista.map(envolverArchivo));
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
    getFilesByName: (n) => iterador(porNombre(n, 'archivo').map(envolverArchivo)),
    getFoldersByName: (n) => iterador(porNombre(n, 'carpeta').map(envolverCarpeta)),
    searchFiles,
  };

  // Ayudas solo para tests.
  const ayudas = {
    llamadas,
    items,
    registrarArchivo: (id, nombre, mime) => crearArchivo(nombre, '', mime, 'root', { idFijo: id }),
    // Un archivo de otra cuenta compartido con la dueña (aparece en sus búsquedas).
    crearAjeno: (nombre, contenido, mime, propietario) => crearArchivo(nombre, contenido, mime, null, { propietario }),
    fijarActualizado: (id, fecha) => (items.get(id).actualizado = new Date(fecha).getTime()),
    tocar: (id) => (items.get(id).actualizado = reloj.avanzar()),
  };

  return { DriveApp, ayudas };
}
