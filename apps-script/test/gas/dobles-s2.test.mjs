// Ampliaciones de los dobles que necesita S2 (hojas, activadores, miniaturas, candado).
import { describe, test, expect } from 'vitest';
import { crearDobles } from './dobles/index.mjs';

describe('hojas: formatos, validaciones y filas', () => {
  const libro = () => crearDobles().SpreadsheetApp.create('x');

  test('setNumberFormats pone un formato por celda y las celdas de texto no se convierten', () => {
    const h = libro().getSheets()[0];
    const r = h.getRange(2, 1, 1, 2);
    r.setNumberFormats([['@', 'General']]).setValues([['51', '51']]);
    expect(h.getRange(2, 1, 1, 2).getValues()[0]).toEqual(['51', 51]);
  });

  test('setNumberFormats exige la misma forma que el rango', () => {
    const h = libro().getSheets()[0];
    expect(() => h.getRange(1, 1, 1, 2).setNumberFormats([['@']])).toThrow();
  });

  test('clearContent vacía las celdas', () => {
    const h = libro().getSheets()[0];
    h.getRange(1, 1, 1, 2).setValues([['a', 'b']]);
    h.getRange(1, 1, 1, 2).clearContent();
    expect(h.getLastRow()).toBe(0);
  });

  test('setDataValidation guarda la regla de casilla y getDataValidation la devuelve', () => {
    const { SpreadsheetApp } = crearDobles();
    const h = SpreadsheetApp.create('x').getSheets()[0];
    const regla = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    h.getRange(2, 3, 5, 1).setDataValidation(regla);
    expect(h.getRange(4, 3).getDataValidation()).toEqual({ tipo: 'checkbox' });
    expect(h.getRange(4, 4).getDataValidation()).toBe(null);
  });

  test('getSheetId es único por pestaña', () => {
    const l = libro();
    const b = l.insertSheet('b');
    expect(new Set([l.getSheets()[0].getSheetId(), b.getSheetId()]).size).toBe(2);
  });

  test('deleteRows quita filas, pero no todas las que no están congeladas', () => {
    const h = libro().getSheets()[0];
    h.getRange(1, 1, 3, 1).setValues([['a'], ['b'], ['c']]);
    h.setFrozenRows(1);
    h.deleteRows(2, 1);
    expect(h.getRange(1, 1, 2, 1).getValues()).toEqual([['a'], ['c']]);
    expect(() => h.deleteRows(2, h.getMaxRows() - 1)).toThrow(/non-frozen/);
  });

  test('insertColumnsAfter agrega columnas y sin ellas no se puede escribir más allá del final', () => {
    const h = libro().getSheets()[0];
    const n = h.getMaxColumns();
    expect(() => h.getRange(1, n + 1).setValue('x')).toThrow(/outside the dimensions/);
    h.insertColumnsAfter(n, 2);
    h.getRange(1, n + 1).setValue('x');
    expect(h.getMaxColumns()).toBe(n + 2);
  });

  test('insertRowsAfter agrega filas al final de la hoja', () => {
    const h = libro().getSheets()[0];
    const antes = h.getMaxRows();
    h.insertRowsAfter(antes, 5);
    expect(h.getMaxRows()).toBe(antes + 5);
  });
});

describe('Drive: miniaturas', () => {
  test('getThumbnail devuelve un blob de imagen pequeño', () => {
    const { DriveApp, Utilities } = crearDobles();
    const f = DriveApp.createFile(Utilities.newBlob([1, 2, 3], 'image/jpeg', 'a.jpg'));
    const miniatura = f.getThumbnail();
    expect(miniatura.getContentType()).toMatch(/^image\//);
    expect(miniatura.getBytes().length).toBeGreaterThan(0);
  });
});

describe('ScriptApp: activadores', () => {
  test('crea, lista y borra activadores por reloj', () => {
    const { ScriptApp } = crearDobles();
    ScriptApp.newTrigger('tareaDiaria').timeBased().everyDays(1).atHour(0).create();
    ScriptApp.newTrigger('tareaDocumentos').timeBased().everyHours(1).create();
    ScriptApp.newTrigger('tareaReporteMensual').timeBased().onMonthDay(1).atHour(2).create();
    const lista = ScriptApp.getProjectTriggers();
    expect(lista.map((t) => t.getHandlerFunction())).toEqual(['tareaDiaria', 'tareaDocumentos', 'tareaReporteMensual']);
    expect(lista[0].getEventType()).toBe(ScriptApp.EventType.CLOCK);
    ScriptApp.deleteTrigger(lista[1]);
    expect(ScriptApp.getProjectTriggers()).toHaveLength(2);
  });
});

describe('candado que puede fallar', () => {
  test('con _candado.fallar, tryLock devuelve false y no lo toma', () => {
    const dobles = crearDobles();
    dobles._candado.fallar = true;
    const lock = dobles.LockService.getScriptLock();
    expect(lock.tryLock(1000)).toBe(false);
    expect(dobles._candado.tomado).toBe(false);
    expect(() => lock.waitLock(1000)).toThrow(/lock/i);
  });
});

describe('UrlFetch: reiniciar', () => {
  test('borra las respuestas programadas y las llamadas anotadas', () => {
    const { UrlFetchApp, _url } = crearDobles();
    _url.responder(/a/, { texto: 'x' });
    UrlFetchApp.fetch('a');
    _url.reiniciar();
    expect(_url.llamadas).toHaveLength(0);
    expect(() => UrlFetchApp.fetch('a')).toThrow(/sin respuesta programada/);
  });
});
