import { describe, test, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { obtenerCatalogo } from '../scripts/lib/obtener.mjs';
import { procesarFoto, descargarFotos } from '../scripts/lib/fotos.mjs';

const RUTA_FIXTURE = fileURLToPath(new URL('../../fixtures/catalogo.ejemplo.json', import.meta.url));
const DIR_FIXTURE_IMG = fileURLToPath(new URL('../../fixtures/img/', import.meta.url));
const ejemplo = JSON.parse(readFileSync(RUTA_FIXTURE, 'utf8'));
const API = 'https://api.test/exec';
const tmp = () => mkdtempSync(join(tmpdir(), 'catalogo-'));

function fetchFalso(responder) {
  const llamadas = [];
  const fetch = async (url) => {
    llamadas.push(url);
    const cuerpo = responder(url);
    return { ok: true, status: 200, json: async () => cuerpo };
  };
  fetch.llamadas = llamadas;
  return fetch;
}

const fotoOk = () => ({ ok: true, datos: { mime: 'image/jpeg', nombre: 'x.jpg', base64: Buffer.from([1, 2, 3]).toString('base64') } });

describe('obtenerCatalogo', () => {
  test('con el fixture devuelve el catálogo ya validado', async () => {
    const c = await obtenerCatalogo({ origen: 'fixture', rutaFixture: RUTA_FIXTURE });
    expect(c.productos).toHaveLength(20);
  });

  test('pide el catálogo a la API con ?r=catalogo', async () => {
    const fetch = fetchFalso(() => ({ ok: true, datos: ejemplo }));
    await obtenerCatalogo({ origen: 'api', apiUrl: API, fetch });
    expect(fetch.llamadas).toEqual([`${API}?r=catalogo`]);
  });

  test('si la API responde un error, lo informa tal cual', async () => {
    const fetch = fetchFalso(() => ({ ok: false, error: 'sin_publicacion' }));
    await expect(obtenerCatalogo({ origen: 'api', apiUrl: API, fetch })).rejects.toThrow('API respondió: sin_publicacion');
  });

  test('un catálogo inválido no pasa y el mensaje dice qué falta', async () => {
    const { productos, ...sinProductos } = ejemplo;
    const fetch = fetchFalso(() => ({ ok: true, datos: sinProductos }));
    await expect(obtenerCatalogo({ origen: 'api', apiUrl: API, fetch })).rejects.toThrow(/productos/);
  });

  test('sin URL de la API falla con un mensaje claro', async () => {
    await expect(obtenerCatalogo({ origen: 'api', apiUrl: '' })).rejects.toThrow(/CATALOG_API_URL/);
  });
});

describe('procesarFoto', () => {
  test('una foto de 1200×1500 da WebP de 480 y 960, un og de ≤ 300 KB y una miniatura borrosa', async () => {
    const dir = tmp();
    const r = await procesarFoto(readFileSync(join(DIR_FIXTURE_IMG, 'fx_00000001.jpg')), { id: 'fx_00000001', dirSalida: dir });
    expect(Object.keys(r.webp)).toEqual(['480', '960']);
    expect(r).toMatchObject({ ancho: 1200, alto: 1500, og: 'img/og/fx_00000001.jpg' });
    expect(statSync(join(dir, r.og)).size).toBeLessThanOrEqual(300_000);
    expect((await sharp(join(dir, r.webp['960'])).metadata()).width).toBe(960);
    expect(r.lqip.startsWith('data:image/webp;base64,')).toBe(true);
  });

  test('una foto chica no se agranda', async () => {
    const dir = tmp();
    const chica = await sharp({ create: { width: 600, height: 750, channels: 3, background: '#cc8866' } }).jpeg().toBuffer();
    const r = await procesarFoto(chica, { id: 'fx_chica0001', dirSalida: dir });
    expect(Object.keys(r.webp)).toEqual(['480']);
    expect(r.ancho).toBe(600);
    expect((await sharp(join(dir, r.og)).metadata()).width).toBe(600);
  });
});

describe('descargarFotos', () => {
  test('descarga por la API cada foto que no está en caché', async () => {
    const fetch = fetchFalso(fotoOk);
    const fotos = await descargarFotos(ejemplo, { origen: 'api', apiUrl: API, fetch, dirCache: tmp() });
    expect(fotos.size).toBe(Object.keys(ejemplo.fotos).length);
    expect(fetch.llamadas[0]).toMatch(/\?r=foto&id=fx_[0-9a-f]{8}$/);
  });

  test('con el índice al día y las fotos procesadas en caché, no descarga nada', async () => {
    const dirCache = tmp();
    mkdirSync(join(dirCache, 'img', 'og'), { recursive: true });
    const indice = {};
    for (const [id, f] of Object.entries(ejemplo.fotos)) {
      indice[id] = { actualizado: f.actualizado, meta: { og: `img/og/${id}.jpg` } };
      writeFileSync(join(dirCache, 'img', 'og', `${id}.jpg`), '');
    }
    writeFileSync(join(dirCache, 'indice.json'), JSON.stringify(indice));
    const fetch = fetchFalso(() => {
      throw new Error('no debería descargar');
    });
    const fotos = await descargarFotos(ejemplo, { origen: 'api', apiUrl: API, fetch, dirCache });
    expect(fotos.size).toBe(0);
    expect(fetch.llamadas).toEqual([]);
  });

  test('si una foto falla, el error nombra la foto y el producto que la usa', async () => {
    const id = ejemplo.productos[0].fotos[0].id; // VES-001
    const fetch = fetchFalso((url) => (url.endsWith(id) ? { ok: false, error: 'foto_no_disponible' } : fotoOk()));
    await expect(descargarFotos(ejemplo, { origen: 'api', apiUrl: API, fetch, dirCache: tmp() })).rejects.toThrow(
      new RegExp(`${id}.*VES-001.*foto_no_disponible`),
    );
  });

  test('con origen fixture lee las fotos de la carpeta de ejemplo', async () => {
    const fotos = await descargarFotos(ejemplo, { origen: 'fixture', dirFixture: DIR_FIXTURE_IMG, dirCache: tmp() });
    expect(fotos.size).toBe(Object.keys(ejemplo.fotos).length);
  });
});
