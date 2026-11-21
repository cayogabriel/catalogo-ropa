import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

function preparar(opciones) {
  const dobles = crearDobles(opciones);
  return cargarGas('panel', { dobles });
}

function contar(iterador) {
  let n = 0;
  while (iterador.hasNext()) {
    iterador.next();
    n++;
  }
  return n;
}

function nombres(iterador) {
  const r = [];
  while (iterador.hasNext()) r.push(iterador.next().getName());
  return r.sort();
}

function leerConfig(libro) {
  const h = libro.getSheetByName('config');
  const filas = h.getRange(2, 1, h.getLastRow() - 1, 2).getValues();
  return Object.fromEntries(filas);
}

describe('instalar()', () => {
  test('crea la hoja con las 14 pestañas, sus encabezados y la fila 1 congelada', () => {
    const { ctx, valor, dobles } = preparar();
    const r = ctx.instalar();
    const libro = dobles.SpreadsheetApp.openById(r.hojaId);
    const ESQUEMA = valor('ESQUEMA');
    expect(r.nueva).toBe(true);
    expect(libro.getName()).toBe('Catálogo Ropa — Base de datos');
    expect(libro.getSheets().map((h) => h.getName())).toEqual(Object.keys(ESQUEMA));
    for (const [pestana, columnas] of Object.entries(ESQUEMA)) {
      const h = libro.getSheetByName(pestana);
      expect(h.getRange(1, 1, 1, columnas.length).getValues()[0]).toEqual(columnas);
      expect(h.getFrozenRows()).toBe(1);
    }
    expect(libro.getSpreadsheetTimeZone()).toBe('America/Lima');
  });

  test('crea el árbol de carpetas y guarda la hoja dentro de la carpeta raíz', () => {
    const { ctx, dobles } = preparar();
    const r = ctx.instalar();
    const raiz = dobles.DriveApp.getFolderById(r.carpetaRaizId);
    expect(raiz.getName()).toBe('Catálogo Ropa');
    expect(nombres(raiz.getFolders())).toEqual(['Documentos', 'Fotos', 'Marca', 'Portadas', 'Publicado', 'Temporadas']);
    const documentos = raiz.getFoldersByName('Documentos').next();
    expect(nombres(documentos.getFolders())).toEqual(['Catálogos', 'Reportes', 'Revistas']);
    expect(dobles.DriveApp.getFileById(r.hojaId).getParents().next().getId()).toBe(r.carpetaRaizId);
  });

  test('escribe la configuración por defecto de Perú', () => {
    const { ctx, dobles } = preparar();
    const r = ctx.instalar();
    expect(leerConfig(dobles.SpreadsheetApp.openById(r.hojaId))).toMatchObject({
      moneda_simbolo: 'S/',
      moneda_codigo: 'PEN',
      pais_codigo: '51',
      zona_horaria: 'America/Lima',
      redondeo: 'ninguno',
      inicio_modo: 'temporada',
      umbral_ultimas_unidades: 3,
      dias_nuevo: 30,
      min_clics_mas_consultados: 3,
      vigencia_dias_defecto: 15,
    });
  });

  test('guarda el puntero de configuración y los ids en las propiedades', () => {
    const { ctx, dobles } = preparar();
    const r = ctx.instalar();
    const archivo = dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next();
    const puntero = JSON.parse(archivo.getBlob().getDataAsString());
    expect(puntero).toMatchObject({ version: 1, hoja_id: r.hojaId, publicado_id: null });
    expect(Object.keys(puntero.carpetas).sort()).toEqual(
      ['catalogos', 'documentos', 'fotos', 'marca', 'portadas', 'publicado', 'raiz', 'reportes', 'revistas', 'temporadas'],
    );
    expect(puntero.carpetas.raiz).toBe(r.carpetaRaizId);
    expect(archivo.getParents().next().getId()).toBe(r.carpetaRaizId);
    const props = dobles.PropertiesService.getScriptProperties();
    expect(props.getProperty('CR_HOJA_ID')).toBe(r.hojaId);
    expect(props.getProperty('CR_CARPETA_RAIZ_ID')).toBe(r.carpetaRaizId);
    expect(props.getProperty('CR_PUNTERO_ID')).toBe(archivo.getId());
  });

  test('una segunda llamada no duplica nada y repone una pestaña borrada a mano', () => {
    const { ctx, dobles } = preparar();
    const r1 = ctx.instalar();
    const libro = dobles.SpreadsheetApp.openById(r1.hojaId);
    libro.deleteSheet(libro.getSheetByName('ofertas'));
    const r2 = ctx.instalar();
    expect(r2.nueva).toBe(false);
    expect(r2.hojaId).toBe(r1.hojaId);
    expect(libro.getSheets().map((h) => h.getName()).indexOf('ofertas')).toBe(4);
    expect(contar(dobles.DriveApp.getFilesByName('Catálogo Ropa — Base de datos'))).toBe(1);
    expect(contar(dobles.DriveApp.getFoldersByName('Catálogo Ropa'))).toBe(1);
    expect(contar(dobles.DriveApp.getFilesByName('catalogo-ropa.config.json'))).toBe(1);
  });

  test('no pisa la configuración que la dueña ya cambió', () => {
    const { ctx, dobles } = preparar();
    const r = ctx.instalar();
    const config = dobles.SpreadsheetApp.openById(r.hojaId).getSheetByName('config');
    const filas = config.getRange(2, 1, config.getLastRow() - 1, 2).getValues();
    const fila = filas.findIndex(([clave]) => clave === 'moneda_simbolo') + 2;
    config.getRange(fila, 2).setValue('$');
    ctx.instalar();
    expect(leerConfig(dobles.SpreadsheetApp.openById(r.hojaId)).moneda_simbolo).toBe('$');
  });

  test('si quien llama no es la dueña, lanza no_autorizado y no crea nada', () => {
    const { ctx, dobles } = preparar({ usuario: 'otra@example.com', dueno: 'duena@example.com' });
    expect(() => ctx.instalar()).toThrow(/no_autorizado/);
    expect(dobles.DriveApp.getFoldersByName('Catálogo Ropa').hasNext()).toBe(false);
  });
});
