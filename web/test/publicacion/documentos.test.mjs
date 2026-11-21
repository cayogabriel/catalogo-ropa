import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { servirDist } from '../../scripts/lib/servidor.mjs';
import { rutasRevista, RUTA_CATALOGO, armarManifiesto, isoLima, jpgHasta } from '../../scripts/lib/documentos.mjs';

describe('servirDist', () => {
  let servidor;
  afterEach(async () => servidor?.cerrar());

  test('sirve dist/ bajo la base del sitio, con index.html en las carpetas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(dir, 'imprimir', 'catalogo'), { recursive: true });
    writeFileSync(join(dir, 'imprimir', 'catalogo', 'index.html'), '<p>hola</p>');
    servidor = await servirDist(dir, '/catalogo-ropa/');
    const r = await fetch(`${servidor.url}imprimir/catalogo/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    expect(await r.text()).toBe('<p>hola</p>');
    expect(servidor.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/catalogo-ropa\/$/);
  });

  test('fuera de la base, o saliendo de dist/, responde 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    servidor = await servirDist(dir, '/catalogo-ropa/');
    const origen = new URL(servidor.url).origin;
    expect((await fetch(`${origen}/otra/`)).status).toBe(404);
    expect((await fetch(`${origen}/catalogo-ropa/%2e%2e/%2e%2e/package.json`)).status).toBe(404);
    expect((await fetch(`${servidor.url}no-existe.jpg`)).status).toBe(404);
  });
});

describe('manifiesto', () => {
  test('rutas de la revista y su carrusel según el contrato', () => {
    const r = rutasRevista('verano-2027');
    expect(r.pdf).toBe('temporada/verano-2027/revista-verano-2027.pdf');
    expect(r.carrusel(1)).toBe('temporada/verano-2027/carrusel/verano-2027-01.jpg');
    expect(r.carrusel(14)).toBe('temporada/verano-2027/carrusel/verano-2027-14.jpg');
    expect(RUTA_CATALOGO).toBe('catalogo/catalogo.pdf');
  });

  test('isoLima da la hora de Lima con -05:00', () => {
    expect(isoLima(Date.parse('2026-12-01T05:20:00Z'))).toBe('2026-12-01T00:20:00-05:00');
  });

  test('armarManifiesto tiene la forma de documentos.md', () => {
    const m = armarManifiesto({
      ahora: Date.parse('2026-12-01T05:20:00Z'),
      revistas: [{ temporada_id: 'tem_00000001', slug: 'verano-2027', paginas: 2, bytes: 10, carrusel: ['a.jpg', 'b.jpg'] }],
      catalogo: { paginas: 6, bytes: 20 },
    });
    expect(m).toEqual({
      generado_en: '2026-12-01T00:20:00-05:00',
      revistas: [
        {
          temporada_id: 'tem_00000001',
          slug: 'verano-2027',
          pdf: 'temporada/verano-2027/revista-verano-2027.pdf',
          paginas: 2,
          bytes: 10,
          carrusel: ['a.jpg', 'b.jpg'],
        },
      ],
      catalogo: { pdf: 'catalogo/catalogo.pdf', paginas: 6, bytes: 20 },
    });
  });
});

describe('jpgHasta', () => {
  test('baja la calidad hasta que el JPG pese lo pedido', async () => {
    const ruido = await sharp(Buffer.from(Array.from({ length: 400 * 500 * 3 }, () => Math.floor(Math.random() * 256))), {
      raw: { width: 400, height: 500, channels: 3 },
    })
      .png()
      .toBuffer();
    const calidades = [];
    const capturar = async (calidad) => {
      calidades.push(calidad);
      return sharp(ruido).jpeg({ quality: calidad }).toBuffer();
    };
    const limite = (await sharp(ruido).jpeg({ quality: 74 }).toBuffer()).length;
    const jpg = await jpgHasta(capturar, limite);
    expect(jpg.length).toBeLessThanOrEqual(limite);
    expect(calidades[0]).toBe(90);
    expect(calidades.length).toBeGreaterThan(1);
  });

  test('si ni con la calidad mínima entra, falla', async () => {
    await expect(jpgHasta(async () => Buffer.alloc(1000), 10)).rejects.toThrow(/600 KB|pesa/);
  });
});
