// Doble de SpreadsheetApp en memoria. Cada libro también es un archivo de Drive
// (con el mismo id), igual que en Google.
import { MimeType } from './drive.mjs';

function crearPestana(nombreInicial, libro) {
  let nombre = nombreInicial;
  let filasCongeladas = 0;
  const datos = []; // matriz de filas; '' = vacío

  const ultimaFila = () => {
    for (let f = datos.length - 1; f >= 0; f--) if (datos[f].some((v) => v !== '' && v !== null)) return f + 1;
    return 0;
  };
  const ultimaColumna = () => datos.reduce((m, fila) => {
    for (let c = fila.length - 1; c >= 0; c--) if (fila[c] !== '' && fila[c] !== null) return Math.max(m, c + 1);
    return m;
  }, 0);

  function rango(fila, col, numFilas = 1, numCols = 1) {
    if (fila < 1 || col < 1) throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
    const r = {
      getRow: () => fila,
      getColumn: () => col,
      getNumRows: () => numFilas,
      getNumColumns: () => numCols,
      getValues: () => Array.from({ length: numFilas }, (_, i) =>
        Array.from({ length: numCols }, (_, j) => datos[fila - 1 + i]?.[col - 1 + j] ?? '')),
      getValue: () => datos[fila - 1]?.[col - 1] ?? '',
      setValues: (valores) => {
        if (valores.length !== numFilas || valores.some((f) => f.length !== numCols)) {
          throw new Error(`Exception: The number of rows or columns in the data does not match the range (${numFilas}x${numCols}).`);
        }
        valores.forEach((f, i) => f.forEach((v, j) => {
          while (datos.length < fila + i) datos.push([]);
          datos[fila - 1 + i][col - 1 + j] = v;
        }));
        libro._tocar();
        return r;
      },
      setValue: (v) => r.setValues([[v]]),
      setFontWeight: () => r,
      setBackground: () => r,
      setNumberFormat: () => r,
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
    appendRow: (valores) => {
      datos[ultimaFila()] = [...valores];
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
        if (pestanas.length === 1) throw new Error('Exception: You can\'t remove all the sheets in a document.');
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
