import { describe, test, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { obtenerCatalogo } from '../../scripts/lib/obtener.mjs';
import {
  procesarFoto,
  descargarFotos,
  usosDeFoto,
  procesarPendientes,
  leerIndice,
  guardarIndice,
  fotosPendientes,
  VERSION_PROCESO,
} from '../../scripts/lib/fotos.mjs';
import { rutaImpresion } from '../../src/components/imprimir/rutas.mjs';

const RUTA_FIXTURE = fileURLToPath(new URL('../../../fixtures/catalogo.ejemplo.json', import.meta.url));
const DIR_FIXTURE_IMG = fileURLToPath(new URL('../../../fixtures/img/', import.meta.url));
const ejemplo = JSON.parse(readFileSync(RUTA_FIXTURE, 'utf8'));
const API = 'https://api.test/exec';
const tmp = () => mkdtempSync(join(tmpdir(), 'catalogo-'));

function fetchFalso(responder) {
  const llamadas = [];
  const fetch = async (url) => {
    llamadas.push(url);
    const cuerpo = responder(url);
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    return { ok: true, status: 200, text: async () => texto, json: async () => JSON.parse(texto) };
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
  test('una foto de 1200×1500 da WebP de 480, 960 y 1200, un og de ≤ 300 KB y una miniatura borrosa', async () => {
    const dir = tmp();
    const r = await procesarFoto(readFileSync(join(DIR_FIXTURE_IMG, 'fx_00000001.jpg')), { id: 'fx_00000001', dirSalida: dir });
    expect(Object.keys(r.webp)).toEqual(['480', '960', '1200']);
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
    const entradas = {};
    for (const [id, f] of Object.entries(ejemplo.fotos)) {
      entradas[id] = { actualizado: f.actualizado, meta: { og: `img/og/${id}.jpg` } };
      writeFileSync(join(dirCache, 'img', 'og', `${id}.jpg`), '');
    }
    writeFileSync(join(dirCache, 'indice.json'), JSON.stringify({ version: VERSION_PROCESO, fotos: entradas }));
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

const ruido = (ancho, alto) =>
  sharp(Buffer.from(Array.from({ length: ancho * alto * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width: ancho, height: alto, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

describe('mejoras de la revisión de S1', () => {
  test('usosDeFoto también cuenta las fotos de categoría', () => {
    const c = structuredClone(ejemplo);
    c.categorias[0].foto = { id: 'fx_00000001', alt: 'x' };
    expect(usosDeFoto(c, 'fx_00000001')).toContain(`categoría ${c.categorias[0].slug}`);
  });

  test('con un original de 1200 px agrega su ancho al webp', async () => {
    const r = await procesarFoto(readFileSync(join(DIR_FIXTURE_IMG, 'fx_00000001.jpg')), { id: 'fx_00000001', dirSalida: tmp() });
    expect(Object.keys(r.webp)).toEqual(['480', '960', '1200']);
  });

  test('con un original de 2000 px da 480, 960, 1440 y 2000', async () => {
    const grande = await sharp({ create: { width: 2000, height: 2500, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
    const r = await procesarFoto(grande, { id: 'fx_grande001', dirSalida: tmp() });
    expect(Object.keys(r.webp)).toEqual(['480', '960', '1440', '2000']);
  });

  test('una foto de 960 px no repite su ancho', async () => {
    const justa = await sharp({ create: { width: 960, height: 1200, channels: 3, background: '#88aacc' } }).jpeg().toBuffer();
    const r = await procesarFoto(justa, { id: 'fx_justa0001', dirSalida: tmp() });
    expect(Object.keys(r.webp)).toEqual(['480', '960']);
  });

  test('el og de una foto muy pesada queda en ≤ 300 KB', async () => {
    const dir = tmp();
    const r = await procesarFoto(await ruido(2000, 2500), { id: 'fx_ruido0001', dirSalida: dir });
    expect(statSync(join(dir, r.og)).size).toBeLessThanOrEqual(300_000);
  }, 60_000);

  test('un PNG con transparencia sale con fondo blanco', async () => {
    const dir = tmp();
    const png = await sharp({ create: { width: 600, height: 750, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const r = await procesarFoto(png, { id: 'fx_png00001', dirSalida: dir });
    const { data } = await sharp(join(dir, r.og)).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
  });

  test('genera los JPG de impresión de 1080 y 540 sin agrandar', async () => {
    const dir = tmp();
    await procesarFoto(readFileSync(join(DIR_FIXTURE_IMG, 'fx_00000001.jpg')), { id: 'fx_00000001', dirSalida: dir });
    expect((await sharp(join(dir, rutaImpresion('fx_00000001', 1080))).metadata()).width).toBe(1080);
    expect((await sharp(join(dir, rutaImpresion('fx_00000001', 540))).metadata()).width).toBe(540);
    const chica = await sharp({ create: { width: 600, height: 750, channels: 3, background: '#cc8866' } }).jpeg().toBuffer();
    await procesarFoto(chica, { id: 'fx_chica0001', dirSalida: dir });
    expect((await sharp(join(dir, rutaImpresion('fx_chica0001', 1080))).metadata()).width).toBe(600);
  });

  test('si sharp no puede leer una foto, el error nombra la foto y el producto', async () => {
    const id = ejemplo.productos[0].fotos[0].id;
    const nuevas = new Map([[id, Buffer.from('esto no es una imagen')]]);
    await expect(procesarPendientes(ejemplo, nuevas, { dirCache: tmp() })).rejects.toThrow(new RegExp(`${id}.*VES-001`));
  });

  test('un índice de otra versión del proceso deja todas las fotos pendientes', () => {
    const dirCache = tmp();
    mkdirSync(join(dirCache, 'img', 'og'), { recursive: true });
    const fotos = {};
    for (const [id, f] of Object.entries(ejemplo.fotos)) {
      fotos[id] = { actualizado: f.actualizado, meta: {} };
      writeFileSync(join(dirCache, 'img', 'og', `${id}.jpg`), '');
    }
    writeFileSync(join(dirCache, 'indice.json'), JSON.stringify({ version: VERSION_PROCESO - 1, fotos }));
    expect(fotosPendientes(ejemplo, leerIndice(dirCache), dirCache)).toHaveLength(Object.keys(ejemplo.fotos).length);
  });

  test('las fotos que ya no están en el catálogo salen del índice y de la caché', async () => {
    const dirCache = tmp();
    const vieja = await sharp({ create: { width: 500, height: 600, channels: 3, background: '#000' } }).jpeg().toBuffer();
    const meta = await procesarFoto(vieja, { id: 'fx_vieja0001', dirSalida: dirCache });
    guardarIndice(dirCache, { version: VERSION_PROCESO, fotos: { fx_vieja0001: { actualizado: 'x', meta } } });
    const indice = await procesarPendientes(ejemplo, new Map(), { dirCache });
    expect(indice.fotos.fx_vieja0001).toBeUndefined();
    expect(existsSync(join(dirCache, meta.og))).toBe(false);
    expect(existsSync(join(dirCache, rutaImpresion('fx_vieja0001', 540)))).toBe(false);
    expect(leerIndice(dirCache).fotos.fx_vieja0001).toBeUndefined();
  });

  test('descarga en paralelo, pero nunca más de 4 a la vez', async () => {
    let activas = 0;
    let maximo = 0;
    const fetch = async () => {
      activas++;
      maximo = Math.max(maximo, activas);
      await new Promise((r) => setTimeout(r, 5));
      activas--;
      const texto = JSON.stringify(fotoOk());
      return { ok: true, status: 200, text: async () => texto };
    };
    await descargarFotos(ejemplo, { origen: 'api', apiUrl: API, fetch, dirCache: tmp() });
    expect(maximo).toBeGreaterThan(1);
    expect(maximo).toBeLessThanOrEqual(4);
  });

  test('si la API responde HTML (por ejemplo, sin autorizar), el error lo dice claro', async () => {
    const html = '<!DOCTYPE html><html><body>Se necesita autorización</body></html>';
    const fetch = fetchFalso(() => html);
    await expect(obtenerCatalogo({ origen: 'api', apiUrl: API, fetch })).rejects.toThrow(/HTML.*autoriz/i);
    await expect(descargarFotos(ejemplo, { origen: 'api', apiUrl: API, fetch, dirCache: tmp() })).rejects.toThrow(/HTML.*autoriz/i);
  });
});
