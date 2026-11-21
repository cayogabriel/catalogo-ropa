import { describe, test, expect } from 'vitest';
import { crearDobles } from './dobles/index.mjs';

describe('SpreadsheetApp', () => {
  test('setValues y getValues van y vuelven', () => {
    const { SpreadsheetApp } = crearDobles();
    const hoja = SpreadsheetApp.create('Prueba').insertSheet('datos');
    hoja.getRange(1, 1, 2, 2).setValues([[1, 'a'], [2, 'b']]);
    expect(hoja.getRange(1, 1, 2, 2).getValues()).toEqual([[1, 'a'], [2, 'b']]);
    expect(hoja.getLastRow()).toBe(2);
  });

  test('setValues con otras dimensiones lanza error, como en Apps Script', () => {
    const { SpreadsheetApp } = crearDobles();
    const hoja = SpreadsheetApp.create('Prueba').insertSheet('datos');
    expect(() => hoja.getRange(1, 1, 1, 2).setValues([[1, 2, 3]])).toThrow();
  });

  test('appendRow agrega al final y openById devuelve la misma hoja', () => {
    const { SpreadsheetApp } = crearDobles();
    const libro = SpreadsheetApp.create('Prueba');
    const hoja = libro.insertSheet('datos');
    hoja.appendRow(['x', 1]);
    hoja.appendRow(['y', 2]);
    expect(SpreadsheetApp.openById(libro.getId()).getSheetByName('datos').getLastRow()).toBe(2);
    expect(libro.getSheetByName('no-existe')).toBeNull();
  });

  test('un libro nuevo trae una pestaña por defecto y también es un archivo de Drive', () => {
    const { SpreadsheetApp, DriveApp, MimeType } = crearDobles();
    const libro = SpreadsheetApp.create('Prueba');
    expect(libro.getSheets().map((h) => h.getName())).toEqual(['Hoja 1']);
    expect(DriveApp.getFileById(libro.getId()).getMimeType()).toBe(MimeType.GOOGLE_SHEETS);
  });
});

describe('DriveApp', () => {
  test('crea carpetas y archivos y los encuentra por nombre', () => {
    const { DriveApp, Utilities } = crearDobles();
    const carpeta = DriveApp.createFolder('A');
    const archivo = carpeta.createFile(Utilities.newBlob('hola', 'text/plain', 'x.txt'));
    const it = DriveApp.getFilesByName('x.txt');
    expect(it.hasNext()).toBe(true);
    expect(it.next().getId()).toBe(archivo.getId());
    expect(DriveApp.getFileById(archivo.getId()).getBlob().getDataAsString()).toBe('hola');
    expect(archivo.getParents().next().getId()).toBe(carpeta.getId());
  });

  test('getFileById con un id inexistente lanza error y queda registrado', () => {
    const dobles = crearDobles();
    expect(() => dobles.DriveApp.getFileById('no-existe')).toThrow();
    expect(dobles._drive.llamadas.getFileById).toContain('no-existe');
  });

  test('setContent actualiza la fecha de modificación', () => {
    const { DriveApp } = crearDobles();
    const archivo = DriveApp.createFile('n.json', '{}', 'application/json');
    const antes = archivo.getLastUpdated().getTime();
    archivo.setContent('{"a":1}');
    expect(archivo.getLastUpdated().getTime()).toBeGreaterThan(antes);
    expect(archivo.getBlob().getDataAsString()).toBe('{"a":1}');
  });

  test('los archivos en la papelera no aparecen al buscar por nombre', () => {
    const { DriveApp } = crearDobles();
    DriveApp.createFile('borrado.txt', 'x').setTrashed(true);
    expect(DriveApp.getFilesByName('borrado.txt').hasNext()).toBe(false);
  });
});

describe('servicios', () => {
  test('PropertiesService guarda y borra', () => {
    const { PropertiesService } = crearDobles();
    const p = PropertiesService.getScriptProperties();
    p.setProperty('A', '1');
    expect(p.getProperty('A')).toBe('1');
    p.deleteProperty('A');
    expect(p.getProperty('A')).toBeNull();
  });

  test('CacheService guarda y devuelve null si no hay nada', () => {
    const { CacheService } = crearDobles();
    const c = CacheService.getScriptCache();
    c.put('k', 'v', 60);
    expect(c.get('k')).toBe('v');
    expect(c.get('otra')).toBeNull();
  });

  test('LockService entrega el candado', () => {
    const { LockService } = crearDobles();
    const lock = LockService.getScriptLock();
    expect(lock.tryLock(1000)).toBe(true);
    lock.releaseLock();
    expect(lock.hasLock()).toBe(false);
  });

  test('UrlFetchApp devuelve lo programado y registra la llamada', () => {
    const dobles = crearDobles();
    dobles._url.responder(/ejemplo\.com/, { codigo: 200, texto: '{"a":1}' });
    const r = dobles.UrlFetchApp.fetch('https://ejemplo.com/x');
    expect(r.getResponseCode()).toBe(200);
    expect(r.getContentText()).toBe('{"a":1}');
    expect(dobles._url.llamadas.map((l) => l.url)).toEqual(['https://ejemplo.com/x']);
  });

  test('UrlFetchApp sin respuesta programada lanza error', () => {
    const { UrlFetchApp } = crearDobles();
    expect(() => UrlFetchApp.fetch('https://otro.com')).toThrow(/sin respuesta programada/);
  });

  test('Utilities: base64 de ida y vuelta, con bytes con signo como en Apps Script', () => {
    const { Utilities } = crearDobles();
    const bytes = [0, 127, -128, -1, 65];
    expect(Utilities.base64Decode(Utilities.base64Encode(bytes))).toEqual(bytes);
    expect(Utilities.newBlob(bytes, 'image/jpeg', 'a.jpg').getBytes()).toEqual(bytes);
  });

  test('Session distingue a quien entra de la dueña del script', () => {
    const { Session } = crearDobles({ usuario: 'visita@example.com', dueno: 'duena@example.com' });
    expect(Session.getActiveUser().getEmail()).toBe('visita@example.com');
    expect(Session.getEffectiveUser().getEmail()).toBe('duena@example.com');
  });

  test('ContentService arma una salida JSON', () => {
    const { ContentService } = crearDobles();
    const salida = ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
    expect(salida.getContent()).toBe('{"ok":true}');
    expect(salida.getMimeType()).toBe(ContentService.MimeType.JSON);
  });
});
