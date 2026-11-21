// Ajuste de textos largos en las páginas de impresión. Necesita Chromium
// (npx playwright install chromium --only-shell); si no está, se salta.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { ajustarPaginas } from '../../scripts/lib/ajustar.mjs';

const hayChromium = await chromium
  .launch()
  .then(async (b) => (await b.close(), true))
  .catch(() => false);

const estilo = `
  body { margin: 0; font-family: sans-serif; }
  .pagina { width: 1080px; height: 1350px; position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 72px 72px 120px; box-sizing: border-box; }
  .cierre { font-size: 72px; line-height: 1.1; margin: 0; }
  .qr { height: 300px; margin-top: auto; flex: none; background: #ccc; }
  .foto { position: absolute; left: 72px; top: 72px; width: 500px; height: 600px; background: #999; }
  .pie-texto { position: absolute; left: 72px; right: 72px; bottom: 132px; font-size: 80px; line-height: 1.1; margin: 0; }
`;
const html = (cuerpo) => `<!doctype html><html><head><style>${estilo}</style></head><body>${cuerpo}</body></html>`;
const desborda = (pagina) =>
  pagina.evaluate(() => {
    const p = document.querySelector('.pagina');
    return p.scrollHeight > p.clientHeight + 1;
  });

describe.skipIf(!hayChromium)('ajustarPaginas', () => {
  let navegador;
  let pagina;
  beforeAll(async () => {
    navegador = await chromium.launch();
    pagina = await navegador.newPage({ viewport: { width: 1080, height: 1350 } });
  });
  afterAll(async () => navegador?.close());

  test('una página que cabe no cambia', async () => {
    await pagina.setContent(html('<section class="pagina"><p class="cierre" data-ajustar>Corto.</p><div class="qr"></div></section>'));
    expect(await pagina.evaluate(ajustarPaginas)).toEqual([]);
    expect(await pagina.$eval('.cierre', (e) => e.style.fontSize)).toBe('');
  });

  test('un texto largo en el flujo se achica hasta que la página cabe', async () => {
    const largo = 'Escríbenos por WhatsApp y te ayudamos con tu talla. '.repeat(8);
    await pagina.setContent(html(`<section class="pagina"><p class="cierre" data-ajustar>${largo}</p><div class="qr"></div></section>`));
    expect(await desborda(pagina)).toBe(true);
    const avisos = await pagina.evaluate(ajustarPaginas);
    expect(avisos).toEqual([]);
    expect(await desborda(pagina)).toBe(false);
    expect(parseFloat(await pagina.$eval('.cierre', (e) => e.style.fontSize))).toBeLessThan(72);
  });

  test('un bloque que pisa una foto se achica hasta no tocarla', async () => {
    const texto = 'Lino y sol para la costa, todo el verano, con calma. '.repeat(3);
    await pagina.setContent(
      html(`<section class="pagina"><div class="foto" data-bloque></div><p class="pie-texto" data-bloque data-ajustar>${texto}</p></section>`),
    );
    const avisos = await pagina.evaluate(ajustarPaginas);
    expect(avisos).toEqual([]);
    const choca = await pagina.evaluate(() => {
      const a = document.querySelector('.foto').getBoundingClientRect();
      const b = document.querySelector('.pie-texto').getBoundingClientRect();
      return a.bottom > b.top;
    });
    expect(choca).toBe(false);
  });

  test('el texto chico no baja de 26 px', async () => {
    const largo = 'Escríbenos por WhatsApp y te ayudamos con tu talla. '.repeat(14);
    await pagina.setContent(
      html(`<section class="pagina"><p class="cierre" data-ajustar>${largo}</p><p style="font-size:30px;margin:0" class="nota" data-ajustar>Lunes a sábado</p><div class="qr"></div></section>`),
    );
    await pagina.evaluate(ajustarPaginas);
    expect(parseFloat(await pagina.$eval('.nota', (e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(26);
    expect(await desborda(pagina)).toBe(false);
  });

  test('un texto enorme se recorta con aviso que nombra la página y el texto', async () => {
    const enorme = 'Texto muy largo de la dueña. '.repeat(120);
    await pagina.setContent(html(`<section class="pagina"><p class="cierre" data-ajustar>${enorme}</p><div class="qr"></div></section>`));
    const avisos = await pagina.evaluate(ajustarPaginas);
    expect(await desborda(pagina)).toBe(false);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ pagina: 1, recortado: true });
    expect(avisos[0].texto).toMatch(/^Texto muy largo de la dueña/);
  });

  test('si no hay nada que achicar y no cabe, avisa que no cabe', async () => {
    await pagina.setContent(html('<section class="pagina"><div style="height:2000px;flex:none"></div></section>'));
    expect(await pagina.evaluate(ajustarPaginas)).toEqual([{ pagina: 1, recortado: false, texto: '' }]);
  });
});
