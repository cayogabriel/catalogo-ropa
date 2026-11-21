import { describe, expect, it } from 'vitest';
import { estiloTokens, urlFuentes } from '../../src/lib/tema.mjs';
import { srcset, srcMayor, ogAbsoluta } from '../../src/lib/imagenes.mjs';
import { crearTextos } from '../../src/lib/textos.mjs';
import { TOKENS } from '@catalogo/contratos';
import paletas from '../../../content/paletas.json' with { type: 'json' };

const lista = Array.isArray(paletas) ? paletas : Object.values(paletas.paletas ?? paletas);
const paleta = lista[0];

describe('estiloTokens', () => {
  it('escribe los 16 tokens, las fuentes y el radio', () => {
    const css = estiloTokens(paleta);
    for (const t of TOKENS) expect(css).toContain(`${t}:${paleta.tokens[t]}`);
    expect(css).toContain(`--fuente-titulos:'Poppins'`);
    expect(css).toContain(`--fuente-texto:'Nunito Sans'`);
    expect(css).toContain('--radio:16px');
  });

  it('descarta valores que no son hex y limpia nombres de fuente', () => {
    const mala = {
      ...paleta,
      tokens: { ...paleta.tokens, '--color-fondo': 'red;}body{display:none', '--color-texto': '#zzz' },
      fuentes: { titulos: "Poppins'</style>", texto: 'Lato;x:y' },
      radio: '16px;color:red',
    };
    const css = estiloTokens(mala);
    expect(css).not.toContain('--color-fondo');
    expect(css).not.toContain('--color-texto:');
    expect(css).not.toMatch(/[<>{}"]|display/);
    expect(css).toContain(`--fuente-titulos:'Poppinsstyle'`);
    expect(css).toContain(`--fuente-texto:'Latoxy'`);
    expect(css).not.toContain('--radio');
  });
});

describe('urlFuentes', () => {
  it('pide títulos 400 y texto 400;700 con display=swap', () => {
    expect(urlFuentes(paleta)).toBe(
      'https://fonts.googleapis.com/css2?family=Poppins:wght@400&family=Nunito+Sans:wght@400;700&display=swap',
    );
  });
  it('una sola familia si coinciden', () => {
    expect(urlFuentes({ fuentes: { titulos: 'Lato', texto: 'Lato' } })).toBe(
      'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
    );
  });
  it('limpia caracteres raros del nombre', () => {
    expect(urlFuentes({ fuentes: { titulos: 'A&b=c', texto: 'Inter' } })).toBe(
      'https://fonts.googleapis.com/css2?family=Abc:wght@400&family=Inter:wght@400;700&display=swap',
    );
  });
});

describe('imágenes', () => {
  const img = { ancho: 1200, alto: 1500, webp: { 480: 'img/a-480.webp', 960: 'img/a-960.webp', 1200: 'img/a-1200.webp' }, og: 'img/og/a.jpg' };
  it('srcset con todas las entradas y la base', () => {
    expect(srcset(img, '/catalogo-ropa/')).toBe('/catalogo-ropa/img/a-480.webp 480w, /catalogo-ropa/img/a-960.webp 960w, /catalogo-ropa/img/a-1200.webp 1200w');
    expect(srcMayor(img, '/x/')).toBe('/x/img/a-1200.webp');
  });
  it('og absoluto', () => {
    expect(ogAbsoluta(img, 'https://a.github.io/catalogo-ropa/')).toBe('https://a.github.io/catalogo-ropa/img/og/a.jpg');
  });
});

describe('textos', () => {
  const t = crearTextos(
    { tienda: { nombre: 'Lúa' }, textos: { 'pie.derechos': '© {anio} {tienda}', vacio: '' } },
    { 'solo.respaldo': 'Respaldo', 'pie.derechos': 'no' },
    () => new Date('2026-11-21T12:00:00-05:00'),
  );
  it('reemplaza {tienda} y {anio}', () => expect(t('pie.derechos')).toBe('© 2026 Lúa'));
  it('usa el respaldo si falta la clave', () => expect(t('solo.respaldo')).toBe('Respaldo'));
  it('un texto vacío queda vacío y una clave desconocida da cadena vacía', () => {
    expect(t('vacio')).toBe('');
    expect(t('no.existe')).toBe('');
  });
  it('variables extra', () => {
    const t2 = crearTextos({ tienda: { nombre: 'X' }, textos: { a: '{cantidad} prendas' } }, {});
    expect(t2('a', { cantidad: 3 })).toBe('3 prendas');
  });
});
