// instalar(): lo que agregó S2 (encabezados, hoja por defecto, casillas, semillas y activadores).
import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

function preparar() {
  const dobles = crearDobles();
  const gas = cargarGas('panel', { dobles });
  gas.ctx.ahora_ = () => new Date(dobles._reloj.ahora());
  return { ...gas, dobles };
}
const abrir = (dobles, r) => dobles.SpreadsheetApp.openById(r.hojaId);
const encabezados = (h) => h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];

describe('encabezados', () => {
  test('una columna que falta se agrega después de la última con algo, sin pisar datos de la dueña', () => {
    const { ctx, dobles } = preparar();
    const h = abrir(dobles, ctx.instalar()).getSheetByName('categorias');
    // La dueña dejó un hueco (borró el encabezado «slug») y escribió una columna suya más a la derecha, con datos.
    const ancho = h.getLastColumn();
    h.insertColumnsAfter(h.getMaxColumns(), 2);
    h.getRange(1, 3).setValue('');
    h.getRange(1, ancho + 2).setValue('mi_nota');
    h.getRange(2, ancho + 2).setValue('no me borres');
    ctx.instalar();
    const enc = encabezados(h);
    expect(enc[2]).toBe(''); // el hueco sigue siendo hueco: no se escribió encima
    expect(enc[ancho + 1]).toBe('mi_nota');
    expect(h.getRange(2, ancho + 2).getValue()).toBe('no me borres');
    expect(enc[ancho + 2]).toBe('slug'); // se agregó al final de todo
  });

  test('agregar columnas a una pestaña recortada no falla (se amplía la hoja)', () => {
    const { ctx, dobles } = preparar();
    const h = abrir(dobles, ctx.instalar()).getSheetByName('config');
    h.getRange(1, 2).setValue(''); // falta «valor»
    expect(h.getMaxColumns()).toBe(2);
    expect(() => ctx.instalar()).not.toThrow();
    expect(encabezados(h)).toEqual(['clave', '', 'valor']);
  });
});

describe('pestaña por defecto', () => {
  test('se borra en un libro nuevo, pero nunca una pestaña vacía de la dueña después', () => {
    const { ctx, dobles } = preparar();
    const libro = abrir(dobles, ctx.instalar());
    expect(libro.getSheetByName('Hoja 1')).toBe(null);
    libro.insertSheet('Hoja 1');
    libro.insertSheet('Mis apuntes');
    ctx.instalar();
    expect(libro.getSheetByName('Hoja 1')).not.toBe(null);
    expect(libro.getSheetByName('Mis apuntes')).not.toBe(null);
  });

  test('si la primera corrida falló antes de limpiar, la segunda sí la borra', () => {
    const { ctx, dobles } = preparar();
    const crear = dobles.SpreadsheetApp.create;
    let fallar = true;
    dobles.SpreadsheetApp.create = (nombre) => {
      const libro = crear(nombre);
      const insertar = libro.insertSheet;
      libro.insertSheet = (...a) => {
        if (fallar) {
          fallar = false;
          throw new Error('Service error: Spreadsheets');
        }
        return insertar(...a);
      };
      return libro;
    };
    expect(() => ctx.instalar()).toThrow(/Service error/);
    const libro = abrir(dobles, ctx.instalar());
    expect(libro.getSheetByName('Hoja 1')).toBe(null);
    expect(libro.getSheets()).toHaveLength(14);
  });
});

describe('formatos y casillas', () => {
  test('casillas en todas las columnas de sí/no', () => {
    const { ctx, dobles, valor } = preparar();
    const libro = abrir(dobles, ctx.instalar());
    let n = 0;
    for (const [pestana, tipos] of Object.entries(valor('TIPOS'))) {
      const h = libro.getSheetByName(pestana);
      const enc = encabezados(h);
      for (const [col, tipo] of Object.entries(tipos)) {
        if (tipo !== 'booleano') continue;
        const i = enc.indexOf(col) + 1;
        expect(h.getRange(2, i).getDataValidation(), `${pestana}.${col}`).toEqual({ tipo: 'checkbox' });
        expect(h.getRange(h.getMaxRows(), i).getDataValidation(), `${pestana}.${col} (última fila)`).toEqual({ tipo: 'checkbox' });
        n++;
      }
    }
    expect(n).toBe(11);
  });

  test('las columnas de texto quedan en texto plano y las de fecha con formato legible', () => {
    const { ctx, dobles } = preparar();
    const h = abrir(dobles, ctx.instalar()).getSheetByName('productos');
    const enc = encabezados(h);
    expect(h.getRange(2, enc.indexOf('nombre') + 1).getNumberFormat()).toBe('@');
    expect(h.getRange(2, enc.indexOf('tallas') + 1).getNumberFormat()).toBe('@');
    expect(h.getRange(2, enc.indexOf('creado_en') + 1).getNumberFormat()).toBe('yyyy-mm-dd hh:mm:ss');
    expect(h.getRange(2, enc.indexOf('precio_regular') + 1).getNumberFormat()).toBe('General');
  });
});

describe('semillas', () => {
  test('carga las 12 paletas y los textos de content/, con las plantillas de WhatsApp', () => {
    const { ctx } = preparar();
    ctx.instalar();
    const paletas = ctx.leerTabla_('paletas').filas;
    expect(paletas).toHaveLength(12);
    expect(paletas.find((p) => p.id === 'neutra-minimal')).toMatchObject({ origen: 'predefinida', version: 1 });
    expect(Object.keys(paletas[0].tokens)).toHaveLength(16);
    const textos = Object.fromEntries(ctx.leerTabla_('textos').filas.map((f) => [f.clave, f.valor]));
    expect(textos['whatsapp.producto']).toContain('{producto}');
    expect(textos['whatsapp.lista']).toContain('{lista}');
    expect(textos['whatsapp.revista']).toContain('{enlace}');
    expect(textos['tienda.eslogan']).toBeTruthy();
    expect(Object.keys(textos).some((k) => k.startsWith('_'))).toBe(false);
  });

  test('solo entran en pestañas vacías: lo que la dueña cambió o borró no se pisa', () => {
    const { ctx } = preparar();
    ctx.instalar();
    ctx.guardarTexto('tienda.eslogan', 'Mi eslogan');
    const tabla = ctx.leerTabla_('paletas'); // la dueña borra una fila a mano
    ctx.eliminarFila_(tabla, tabla.filas.find((p) => p.id === 'cyber-wow'));
    const antes = ctx.leerTabla_('textos').filas.length;
    ctx.instalar();
    expect(ctx.leerTabla_('textos').filas.find((f) => f.clave === 'tienda.eslogan').valor).toBe('Mi eslogan');
    expect(ctx.leerTabla_('textos').filas).toHaveLength(antes);
    expect(ctx.leerTabla_('paletas').filas).toHaveLength(11);
  });

  test('la paleta por defecto de la tienda existe entre las sembradas', () => {
    const { ctx } = preparar();
    ctx.instalar();
    expect(ctx.leerTabla_('paletas').filas.some((p) => p.id === ctx.leerConfig_().paleta_defecto)).toBe(true);
  });
});

describe('activadores', () => {
  const nombres = (dobles) => dobles.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()).sort();

  test('instala los tres y repetir instalar() no los duplica', () => {
    const { ctx, dobles } = preparar();
    ctx.instalar();
    expect(nombres(dobles)).toEqual(['tareaDiaria', 'tareaDocumentos', 'tareaReporteMensual']);
    const detalle = Object.fromEntries(dobles.ScriptApp.getProjectTriggers().map((t) => [t.getHandlerFunction(), t._detalle]));
    expect(detalle.tareaDiaria).toMatchObject({ cadaDias: 1, hora: 0 }); // entre 00:00 y 01:00
    expect(detalle.tareaDocumentos).toMatchObject({ cadaHoras: 1 });
    expect(detalle.tareaReporteMensual).toMatchObject({ diaMes: 1 });
    ctx.instalar();
    expect(nombres(dobles)).toHaveLength(3);
  });

  test('repone el que falte y quita los duplicados', () => {
    const { ctx, dobles } = preparar();
    ctx.instalar();
    dobles.ScriptApp.deleteTrigger(dobles.ScriptApp.getProjectTriggers().find((t) => t.getHandlerFunction() === 'tareaDocumentos'));
    dobles.ScriptApp.newTrigger('tareaDiaria').timeBased().everyDays(1).atHour(0).create(); // duplicado a mano
    ctx.instalar();
    expect(nombres(dobles)).toEqual(['tareaDiaria', 'tareaDocumentos', 'tareaReporteMensual']);
  });

  test('apuntan a funciones públicas que existen', () => {
    const { ctx } = preparar();
    for (const f of ['tareaDiaria', 'tareaDocumentos', 'tareaReporteMensual']) expect(typeof ctx[f]).toBe('function');
  });
});
