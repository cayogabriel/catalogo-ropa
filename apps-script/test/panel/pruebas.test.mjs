import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validarCatalogo } from '@catalogo/contratos';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const RAW = 'https://raw.githubusercontent.com/cayogabriel/catalogo-ropa/main/fixtures/';
const fixture = readFileSync(new URL('../../../fixtures/catalogo.ejemplo.json', import.meta.url), 'utf8');
const imagen = (id) => readFileSync(new URL(`../../../fixtures/img/${id}.jpg`, import.meta.url));

function preparar(opciones) {
  const dobles = crearDobles(opciones);
  dobles._url.responder(/catalogo\.ejemplo\.json$/, { codigo: 200, texto: fixture, tipo: 'application/json' });
  dobles._url.responder(/img\/(fx_[0-9a-f]{8})\.jpg$/, { codigo: 200, bytes: imagen('fx_00000001'), tipo: 'image/jpeg' });
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

describe('publicarPrueba()', () => {
  test('guarda una copia publicada válida con 3 fotos reales de Drive', () => {
    const { ctx, dobles } = preparar();
    ctx.instalar();
    const r = ctx.publicarPrueba();
    const copia = JSON.parse(dobles.DriveApp.getFileById(r.archivoId).getBlob().getDataAsString());
    expect(validarCatalogo(copia).errores).toEqual([]);
    expect(Object.keys(copia.fotos)).toHaveLength(3);
    expect(r).toMatchObject({ productos: 20, fotos: 3 });
    expect(dobles._url.llamadas[0].url).toBe(`${RAW}catalogo.ejemplo.json`);
  });

  test('la fecha de cada foto es su última modificación en Drive, con hora de Lima', () => {
    const { ctx, dobles } = preparar();
    ctx.instalar();
    const r = ctx.publicarPrueba();
    const copia = JSON.parse(dobles.DriveApp.getFileById(r.archivoId).getBlob().getDataAsString());
    for (const [id, foto] of Object.entries(copia.fotos)) {
      const modificada = dobles.DriveApp.getFileById(id).getLastUpdated();
      expect(foto.actualizado).toBe(dobles.Utilities.formatDate(modificada, 'America/Lima', "yyyy-MM-dd'T'HH:mm:ssXXX"));
    }
    expect(copia.generado_en).toMatch(/-05:00$/);
  });

  test('anota la copia en el puntero que lee la API', () => {
    const { ctx, dobles } = preparar();
    ctx.instalar();
    const r = ctx.publicarPrueba();
    const puntero = JSON.parse(dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next().getBlob().getDataAsString());
    expect(puntero.publicado_id).toBe(r.archivoId);
  });

  test('repetirla no duplica fotos ni copias', () => {
    const { ctx, dobles } = preparar();
    const { carpetaRaizId } = ctx.instalar();
    const r1 = ctx.publicarPrueba();
    const r2 = ctx.publicarPrueba();
    expect(r2.archivoId).toBe(r1.archivoId);
    const fotos = dobles.DriveApp.getFolderById(carpetaRaizId).getFoldersByName('Fotos').next();
    expect(contar(fotos.getFiles())).toBe(3);
  });

  test('sin instalar() antes, avisa qué hacer', () => {
    const { ctx } = preparar();
    expect(() => ctx.publicarPrueba()).toThrow(/instalar/);
  });

  test('solo la dueña puede ejecutarla', () => {
    const { ctx } = preparar({ usuario: 'otra@example.com', dueno: 'duena@example.com' });
    expect(() => ctx.publicarPrueba()).toThrow(/no_autorizado/);
  });
});
