import { describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { contraste, TOKENS, PARES_CONTRASTE, validarCatalogo } from '@catalogo/contratos';
import { catalogoMinimo, ventana } from './ayudas/catalogo-minimo.mjs';

const require = createRequire(import.meta.url);

describe('contraste WCAG', () => {
  test('negro sobre blanco es 21:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  test('gris #777777 sobre blanco es 4.48:1', () => {
    expect(contraste('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  test('el orden de los colores no cambia el resultado', () => {
    expect(contraste('#FFFFFF', '#777777')).toBeCloseTo(contraste('#777777', '#FFFFFF'), 10);
  });
});

describe('tokens de paleta', () => {
  test('son los 16 del diseño, en ese orden', () => {
    expect(TOKENS).toEqual([
      '--color-fondo',
      '--color-superficie',
      '--color-texto',
      '--color-texto-suave',
      '--color-borde',
      '--color-control',
      '--color-primario',
      '--color-sobre-primario',
      '--color-acento',
      '--color-sobre-acento',
      '--color-oferta',
      '--color-sobre-oferta',
      '--color-liquidacion',
      '--color-sobre-liquidacion',
      '--color-exito',
      '--color-foco',
    ]);
  });

  test('los pares de contraste incluyen los mínimos del diseño', () => {
    expect(PARES_CONTRASTE).toContainEqual({ a: '--color-sobre-oferta', b: '--color-oferta', min: 4.5 });
    expect(PARES_CONTRASTE).toContainEqual({ a: '--color-texto-suave', b: '--color-superficie', min: 4.5 });
    expect(PARES_CONTRASTE).toContainEqual({ a: '--color-foco', b: '--color-fondo', min: 3 });
    expect(PARES_CONTRASTE).toContainEqual({ a: '--color-primario', b: '--color-fondo', min: 3 });
  });

  test('el esquema exige exactamente esos 16 tokens', () => {
    const esquema = require('@catalogo/contratos/catalog.schema.json');
    expect(esquema.$defs.paleta.properties.tokens.required).toEqual(TOKENS);
  });
});

describe('validarCatalogo', () => {
  test('un objeto vacío no es válido y el error menciona productos', () => {
    const r = validarCatalogo({});
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('productos');
  });

  test('el catálogo mínimo es válido', () => {
    const r = validarCatalogo(catalogoMinimo());
    expect(r.errores).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test('una foto que no está en el índice da error con su id', () => {
    const c = catalogoMinimo();
    c.productos[0].fotos.push({ id: 'fx_0000beef', alt: 'Espalda' });
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('fx_0000beef');
  });

  test('una foto del índice que nadie usa da error (la lista blanca es exacta)', () => {
    const c = catalogoMinimo();
    c.fotos.fx_0000cafe = { actualizado: '2026-11-30T10:00:00-05:00' };
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('fx_0000cafe');
  });

  test('ventanas de precio solapadas dan error con el código del producto', () => {
    const c = catalogoMinimo();
    c.productos[0].precio.ventanas = [
      ventana(null, '2026-12-10T00:00:00-05:00', 89),
      ventana('2026-12-05T00:00:00-05:00', null, 59, { antes: 89, descuento_pct: 34, oferta_id: 'ofe_00000001' }),
    ];
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('VES-001');
  });

  test('un hueco entre ventanas da error con el código del producto', () => {
    const c = catalogoMinimo();
    c.productos[0].precio.ventanas = [
      ventana(null, '2026-12-05T00:00:00-05:00', 89),
      ventana('2026-12-10T00:00:00-05:00', null, 89),
    ];
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toMatch(/VES-001.*hueco/);
  });

  test('ventanas contiguas con oferta son válidas', () => {
    const c = catalogoMinimo();
    c.productos[0].precio.ventanas = [
      ventana(null, '2026-12-05T00:00:00-05:00', 89),
      ventana('2026-12-05T00:00:00-05:00', '2026-12-15T00:00:00-05:00', 59, {
        antes: 89,
        descuento_pct: 34,
        etiqueta: '-34%',
        cuenta_regresiva: true,
        oferta_id: 'ofe_00000001',
      }),
      ventana('2026-12-15T00:00:00-05:00', null, 89),
    ];
    expect(validarCatalogo(c).errores).toEqual([]);
  });

  test('un precio «antes» que no es mayor que el precio da error', () => {
    const c = catalogoMinimo();
    c.productos[0].precio.ventanas = [ventana(null, null, 89, { antes: 79, oferta_id: 'ofe_00000001' })];
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('VES-001');
  });

  test('dos vendedoras por defecto dan error', () => {
    const c = catalogoMinimo();
    c.vendedoras.push({ id: 'ven_00000002', nombre: 'Bea', whatsapp: '51912345678', por_defecto: true });
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('por_defecto');
  });

  test('una categoría inexistente da error con el código del producto', () => {
    const c = catalogoMinimo();
    c.productos[0].categoria_id = 'cat_0000dead';
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toMatch(/VES-001.*cat_0000dead/);
  });

  test('una talla agotada que no está en tallas da error', () => {
    const c = catalogoMinimo();
    c.productos[0].tallas_agotadas = ['XL'];
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('XL');
  });

  test('códigos de producto repetidos dan error', () => {
    const c = catalogoMinimo();
    c.productos.push({ ...structuredClone(c.productos[0]), id: 'prd_00000002' });
    const r = validarCatalogo(c);
    expect(r.ok).toBe(false);
    expect(r.errores.join('\n')).toContain('VES-001');
  });
});
