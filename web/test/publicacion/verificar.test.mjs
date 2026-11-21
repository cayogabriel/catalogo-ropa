import { describe, test, expect } from 'vitest';
import sharp from 'sharp';
import { pdfMinimo } from './pdf-minimo.mjs';
import { leerPdf, revisarPdf, revisarJpg, revisarSitioUrl } from '../../scripts/lib/verificar-pdf.mjs';

const SITIO = 'https://tienda.test/catalogo-ropa/';
const NOTA = 'Precios validos hasta el 01/12';
const ir = (c) => `${SITIO}ir/${c}/?o=pdf`;
const plan = {
  nota: NOTA,
  paginas: [{ enlaces: [] }, { enlaces: [ir('ves-001'), ir('ves-002')] }],
};
const paginaOk = (enlaces) => ({ ancho: 810, alto: 1012.5, texto: `Algo ${NOTA}`, enlaces });
const leer = (paginas) => leerPdf(pdfMinimo(paginas));

describe('leerPdf', () => {
  test('da el tamaño, el texto y los enlaces de cada página', async () => {
    const info = await leer([paginaOk([ir('ves-001')])]);
    expect(info.paginas).toHaveLength(1);
    expect(info.paginas[0]).toMatchObject({ ancho: 810, alto: 1012.5, enlaces: [ir('ves-001')] });
    expect(info.paginas[0].texto).toContain(NOTA);
  });
});

describe('revisarPdf', () => {
  const revisar = async (paginas, bytes = 1000) => revisarPdf(await leer(paginas), { bytes, plan, sitio: SITIO, nombre: 'revista' });

  test('un PDF que cumple no tiene errores', async () => {
    expect(await revisar([paginaOk([]), paginaOk([ir('ves-002'), ir('ves-001')])])).toEqual([]);
  });

  test('detecta un tamaño de página distinto de 1080 × 1350 px', async () => {
    const errores = await revisar([{ ...paginaOk([]), ancho: 595, alto: 842 }, paginaOk([ir('ves-001'), ir('ves-002')])]);
    expect(errores.join('\n')).toMatch(/página 1.*595 × 842/);
  });

  test('detecta una cantidad de páginas distinta del plan', async () => {
    expect((await revisar([paginaOk([])])).join('\n')).toMatch(/1 páginas.*esperaba 2/);
  });

  test('detecta enlaces que no van a ir/ ni a la web', async () => {
    const errores = await revisar([paginaOk(['https://wa.me/51999']), paginaOk([ir('ves-001'), ir('ves-002')])]);
    expect(errores.join('\n')).toMatch(/wa\.me/);
  });

  test('detecta un enlace que falta en una página', async () => {
    const errores = await revisar([paginaOk([]), paginaOk([ir('ves-001')])]);
    expect(errores.join('\n')).toMatch(/página 2.*ves-002/);
  });

  test('detecta la nota de vigencia ausente', async () => {
    const errores = await revisar([{ ...paginaOk([]), texto: 'sin nota' }, paginaOk([ir('ves-001'), ir('ves-002')])]);
    expect(errores.join('\n')).toMatch(/página 1.*vigencia/);
  });

  test('detecta un PDF de más de 10 MB', async () => {
    const errores = await revisar([paginaOk([]), paginaOk([ir('ves-001'), ir('ves-002')])], 10_000_001);
    expect(errores.join('\n')).toMatch(/10 MB/);
  });
});

describe('revisarJpg', () => {
  const jpg = (w, h, calidad = 80) => sharp({ create: { width: w, height: h, channels: 3, background: '#88aacc' } }).jpeg({ quality: calidad }).toBuffer();

  test('acepta un JPG de 1080 × 1350 y ≤ 600 KB', async () => {
    expect(await revisarJpg(await jpg(1080, 1350), 'a.jpg')).toEqual([]);
  });

  test('rechaza otras medidas', async () => {
    expect((await revisarJpg(await jpg(1080, 1080), 'a.jpg')).join()).toMatch(/1080 × 1080/);
  });

  test('rechaza un JPG de más de 600 KB', async () => {
    const pesado = Buffer.concat([await jpg(1080, 1350), Buffer.alloc(600_001)]);
    expect((await revisarJpg(pesado, 'a.jpg')).join()).toMatch(/600 KB/);
  });
});

describe('revisarSitioUrl', () => {
  test('exige que tienda.sitio_url sea la URL donde se publica el sitio', () => {
    expect(revisarSitioUrl(SITIO, SITIO)).toEqual([]);
    expect(revisarSitioUrl('https://otra.test/', SITIO).join()).toMatch(/sitio_url.*otra\.test.*tienda\.test/);
  });
});
