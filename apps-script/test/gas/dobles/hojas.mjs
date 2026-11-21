// Doble de SpreadsheetApp en memoria. Cada libro también es un archivo de Drive
// (con el mismo id), igual que en Google. Como Sheets, convierte los textos que
// parecen número, fecha, booleano o fórmula, salvo en celdas con formato «@».
import { MimeType } from './drive.mjs';

const FILAS_INICIALES = 1000;
const COLUMNAS_INICIALES = 26;

function convertir(valor) {
  if (typeof valor !== 'string') return valor;
  if (valor.startsWith('=')) return { formula: valor };
  if (/^[-+]?\d+(\.\d+)?$/.test(valor)) return Number(valor);
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(valor)) return new Date(valor);
  if (/^(TRUE|FALSE)$/i.test(valor)) return valor.toUpperCase() === 'TRUE';
  return valor;
}

const leer = (valor) => (valor && typeof valor === 'object' && 'formula' in valor ? '#ERROR!' : valor ?? '');

function crearPestana(nombreInicial, libro) {
  let nombre = nombreInicial;
  let filasCongeladas = 0;
  let maxFilas = FILAS_INICIALES;
  let maxColumnas = COLUMNAS_INICIALES;
  const datos = []; // matriz de filas; '' = vacío
  const formatos = new Map(); // "fila,col" → formato

  const esTexto = (f, c) => formatos.get(`${f},${c}`) === '@';
  const escribir = (f, c, v) => {
    while (datos.length < f) datos.push([]);
    datos[f - 1][c - 1] = esTexto(f, c) ? v : convertir(v);
  };
  const vacia = (v) => v === '' || v === null || v === undefined;

  const ultimaFila = () => {
    for (let f = datos.length - 1; f >= 0; f--) if (datos[f].some((v) => !vacia(v))) return f + 1;
    return 0;
  };
  const ultimaColumna = () =>
    datos.reduce((m, fila) => {
      for (let c = fila.length - 1; c >= 0; c--) if (!vacia(fila[c])) return Math.max(m, c + 1);
      return m;
    }, 0);

  function rango(fila, col, numFilas = 1, numCols = 1) {
    if (fila < 1 || col < 1 || col + numCols - 1 > maxColumnas) {
      throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
    }
    maxFilas = Math.max(maxFilas, fila + numFilas - 1);
    const celdas = (fn) => {
      for (let i = 0; i < numFilas; i++) for (let j = 0; j < numCols; j++) fn(fila + i, col + j, i, j);
    };
    const r = {
      getRow: () => fila,
      getColumn: () => col,
      getNumRows: () => numFilas,
      getNumColumns: () => numCols,
      getValues: () =>
        Array.from({ length: numFilas }, (_, i) => Array.from({ length: numCols }, (_, j) => leer(datos[fila - 1 + i]?.[col - 1 + j]))),
      getFormulas: () =>
        Array.from({ length: numFilas }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => datos[fila - 1 + i]?.[col - 1 + j]?.formula ?? ''),
        ),
      getValue: () => leer(datos[fila - 1]?.[col - 1]),
      setValues: (valores) => {
        if (valores.length !== numFilas || valores.some((f) => f.length !== numCols)) {
          throw new Error(`Exception: The number of rows or columns in the data does not match the range (${numFilas}x${numCols}).`);
        }
        celdas((f, c, i, j) => escribir(f, c, valores[i][j]));
        libro._tocar();
        return r;
      },
      setValue: (v) => r.setValues([[v]]),
      setNumberFormat: (formato) => (celdas((f, c) => formatos.set(`${f},${c}`, formato)), r),
      getNumberFormat: () => formatos.get(`${fila},${col}`) ?? 'General',
      setFontWeight: () => r,
      setBackground: () => r,
      setDataValidation: () => r,
    };
    return r;
  }

  const pestana = {
    getName: () => nombre,
    setName: (n) => ((nombre = n), pestana),
    getRange: rango,
    getDataRange: () => rango(1, 1, Math.max(ultimaFila(), 1), Math.max(ultimaColumna(), 1)),
    getLastRow: ultimaFila,
    getLastColumn: ultimaColumna,
    getMaxRows: () => maxFilas,
    getMaxColumns: () => maxColumnas,
    deleteColumns: (desde, cuantas) => {
      datos.forEach((filaDatos) => filaDatos.splice(desde - 1, cuantas));
      maxColumnas -= cuantas;
      return pestana;
    },
    appendRow: (valores) => {
      const f = ultimaFila() + 1;
      maxColumnas = Math.max(maxColumnas, valores.length);
      maxFilas = Math.max(maxFilas, f);
      valores.forEach((v, j) => escribir(f, j + 1, v));
      libro._tocar();
      return pestana;
    },
    deleteRow: (n) => {
      datos.splice(n - 1, 1);
      libro._tocar();
      return pestana;
    },
    setFrozenRows: (n) => ((filasCongeladas = n), pestana),
    getFrozenRows: () => filasCongeladas,
    clear: () => ((datos.length = 0), pestana),
  };
  return pestana;
}

export function crearHojas(drive) {
  const libros = new Map();

  function crearLibro(nombre) {
    const archivo = drive.ayudas.registrarArchivo(null, nombre, MimeType.GOOGLE_SHEETS);
    const id = archivo.getId();
    const pestanas = [];
    let zona = 'America/Lima';
    const libro = {
      getId: () => id,
      getName: () => archivo.getName(),
      getUrl: () => `https://docs.google.com/spreadsheets/d/${id}/edit`,
      getSheets: () => [...pestanas],
      getSheetByName: (n) => pestanas.find((p) => p.getName() === n) ?? null,
      insertSheet: (n, indice) => {
        if (pestanas.some((p) => p.getName() === n)) throw new Error(`Exception: A sheet with the name "${n}" already exists.`);
        const p = crearPestana(n, libro);
        if (indice === undefined) pestanas.push(p);
        else pestanas.splice(indice, 0, p);
        return p;
      },
      deleteSheet: (p) => {
        if (pestanas.length === 1) throw new Error("Exception: You can't remove all the sheets in a document.");
        pestanas.splice(pestanas.indexOf(p), 1);
      },
      setSpreadsheetTimeZone: (z) => (zona = z),
      getSpreadsheetTimeZone: () => zona,
      _tocar: () => drive.ayudas.tocar(id),
    };
    pestanas.push(crearPestana('Hoja 1', libro));
    libros.set(id, libro);
    return libro;
  }

  const SpreadsheetApp = {
    create: (nombre) => crearLibro(nombre),
    openById: (id) => {
      const libro = libros.get(id);
      if (!libro) throw new Error(`Exception: Unexpected error while getting the method or property openById (${id})`);
      return libro;
    },
  };
  return { SpreadsheetApp, libros };
}
