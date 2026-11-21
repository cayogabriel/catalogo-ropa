import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PARES_CONTRASTE, TOKENS, revisarPaleta } from '../../../contratos/tokens.mjs';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial(['ui/js/util', 'ui/js/validar']);
const V = Panel.validar;
const paletas = JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/paletas.json', import.meta.url)), 'utf8')).paletas;

describe('whatsapp', () => {
  it('pide el código de país', () => {
    expect(V.whatsapp('987654321')).toMatch(/código de país/i);
    expect(V.whatsapp('51987654321')).toBe('');
  });
  it('acepta espacios, guiones y + y los limpia a solo dígitos', () => {
    expect(V.whatsapp('+51 987 654 321')).toBe('');
    expect(V.limpiarWhatsapp('+51 987-654 321')).toBe('51987654321');
  });
  it('vacío o con letras', () => {
    expect(V.whatsapp('')).toMatch(/escribe/i);
    expect(V.whatsapp('51abc')).toMatch(/dígitos|números/i);
  });
});

describe('hex', () => {
  it('#RRGGBB', () => {
    expect(V.hex('#1B2B34')).toBe('');
    expect(V.hex('#1b2b34')).toBe('');
    expect(V.hex('1B2B34')).not.toBe('');
    expect(V.hex('#123')).not.toBe('');
  });
});

describe('producto', () => {
  const base = { nombre: 'Vestido', descripcion: '', precio_regular: 89, tallas: ['S', 'M'], tallas_agotadas: [], estado: 'publicado', fotos: ['a'] };
  it('una fila buena no tiene errores', () => {
    expect(V.producto(base)).toEqual({});
  });
  it('nombre vacío o de más de 80', () => {
    expect(V.producto({ ...base, nombre: '' }).nombre).toBeTruthy();
    expect(V.producto({ ...base, nombre: 'x'.repeat(81) }).nombre).toMatch(/80/);
  });
  it('en borrador el nombre y el precio pueden faltar', () => {
    expect(V.producto({ ...base, estado: 'borrador', nombre: '', precio_regular: null })).toEqual({});
  });
  it('publicado sin precio falla; precio ≤ 0 siempre falla', () => {
    expect(V.producto({ ...base, precio_regular: null }).precio_regular).toBeTruthy();
    expect(V.producto({ ...base, precio_regular: 0, estado: 'borrador' }).precio_regular).toBeTruthy();
    expect(V.producto({ ...base, precio_regular: -5 }).precio_regular).toBeTruthy();
  });
  it('descripción de más de 600', () => {
    expect(V.producto({ ...base, descripcion: 'x'.repeat(601) }).descripcion).toMatch(/600/);
  });
  it('talla agotada que no está en tallas', () => {
    expect(V.producto({ ...base, tallas_agotadas: ['XL'] }).tallas_agotadas).toMatch(/XL/);
  });
  it('para publicar pide foto', () => {
    expect(V.producto({ ...base, fotos: [] }).fotos).toMatch(/foto/i);
  });
});

describe('oferta', () => {
  const base = { nombre: 'Verano', tipo: 'porcentaje', valor: 25, alcance: 'tienda', objetivos: [], desde: null, hasta: null, cuenta_regresiva: false };
  it('porcentaje de 1 a 90', () => {
    expect(V.oferta({ ...base, valor: 0 }).valor).toBeTruthy();
    expect(V.oferta({ ...base, valor: 95 }).valor).toMatch(/90/);
    expect(V.oferta({ ...base, valor: 1 })).toEqual({});
    expect(V.oferta({ ...base, valor: 90 })).toEqual({});
  });
  it('monto y precio final deben ser mayores que 0', () => {
    expect(V.oferta({ ...base, tipo: 'monto', valor: 0 }).valor).toBeTruthy();
    expect(V.oferta({ ...base, tipo: 'precio_final', valor: 59 })).toEqual({});
  });
  it('hasta no puede ser anterior a desde', () => {
    const f = V.oferta({ ...base, desde: '2026-12-10T00:00:00-05:00', hasta: '2026-12-01T00:00:00-05:00' });
    expect(f.hasta).toMatch(/después|posterior/i);
  });
  it('cuenta regresiva sin fecha de fin', () => {
    expect(V.oferta({ ...base, cuenta_regresiva: true }).cuenta_regresiva).toMatch(/fecha de fin/i);
    expect(V.oferta({ ...base, cuenta_regresiva: true, hasta: '2026-12-10T00:00:00-05:00' })).toEqual({});
  });
  it('un alcance distinto de tienda pide objetivos', () => {
    expect(V.oferta({ ...base, alcance: 'categoria', objetivos: [] }).objetivos).toBeTruthy();
    expect(V.oferta({ ...base, alcance: 'categoria', objetivos: ['cat_1'] })).toEqual({});
  });
});

describe('vendedora, temporada, portada, categoría, config', () => {
  it('vendedora', () => {
    expect(V.vendedora({ nombre: 'Ana', whatsapp: '51987654321' })).toEqual({});
    expect(V.vendedora({ nombre: '', whatsapp: '51987654321' }).nombre).toBeTruthy();
    expect(V.vendedora({ nombre: 'Ana', whatsapp: '987' }).whatsapp).toBeTruthy();
  });
  it('temporada: slug con caracteres válidos y no repetido', () => {
    const otras = [{ id: 't1', slug: 'verano-2027' }];
    expect(V.temporada({ id: 't2', nombre: 'Invierno', slug: 'invierno-2027' }, otras)).toEqual({});
    expect(V.temporada({ id: 't2', nombre: 'Invierno', slug: 'Invierno 27' }, otras).slug).toBeTruthy();
    expect(V.temporada({ id: 't2', nombre: 'Invierno', slug: 'verano-2027' }, otras).slug).toMatch(/ya existe|repetid/i);
    expect(V.temporada({ id: 't1', nombre: 'Verano', slug: 'verano-2027' }, otras)).toEqual({});
  });
  it('temporada: fecha de fin posterior al inicio y vigencia entera positiva', () => {
    const t = { id: 't2', nombre: 'X', slug: 'x', desde: '2026-12-10T00:00:00-05:00', hasta: '2026-12-01T00:00:00-05:00', vigencia_dias: 0 };
    const e = V.temporada(t, []);
    expect(e.hasta).toBeTruthy();
    expect(e.vigencia_dias).toBeTruthy();
    expect(V.temporada({ ...t, desde: null, hasta: null, vigencia_dias: null }, [])).toEqual({});
  });
  it('portada: el destino del botón es una ruta interna', () => {
    expect(V.portada({ titulo: 'Hola', boton_destino: '/temporada/verano/' })).toEqual({});
    expect(V.portada({ titulo: 'Hola', boton_destino: 'https://x.com' }).boton_destino).toBeTruthy();
  });
  it('categoría: slug y prefijo', () => {
    expect(V.categoria({ nombre: 'Vestidos', slug: 'vestidos', prefijo_codigo: 'VES' })).toEqual({});
    expect(V.categoria({ nombre: 'Vestidos', slug: 'Vestidos!', prefijo_codigo: 've' })).toMatchObject({ slug: expect.any(String), prefijo_codigo: expect.any(String) });
  });
  it('config: nombre de tienda y números', () => {
    expect(V.config('tienda_nombre', '   ')).toBeTruthy();
    expect(V.config('tienda_nombre', 'Mi tienda')).toBe('');
    expect(V.config('umbral_ultimas_unidades', 'abc')).toBeTruthy();
    expect(V.config('umbral_ultimas_unidades', '3')).toBe('');
    expect(V.config('redondeo', 'raro')).toBeTruthy();
    expect(V.config('redondeo', '90')).toBe('');
    expect(V.config('pais_codigo', '51')).toBe('');
    expect(V.config('pais_codigo', '+51')).toBeTruthy();
  });
});

describe('revisarPaletaLocal', () => {
  it('usa exactamente los mismos pares que @catalogo/contratos', () => {
    expect(V.PARES_CONTRASTE).toEqual(PARES_CONTRASTE);
    expect(V.TOKENS).toEqual(TOKENS);
  });
  it('da el mismo resultado que revisarPaleta en las 12 paletas (todas pasan)', () => {
    expect(paletas).toHaveLength(12);
    for (const p of paletas) {
      const esperado = revisarPaleta(p.tokens);
      const r = V.revisarPaletaLocal(p.tokens);
      expect(r.ok, p.id).toBe(true);
      expect(r).toEqual(esperado);
    }
  });
  it('y en una paleta rota o incompleta', () => {
    const buena = paletas[0].tokens;
    const rota = { ...buena, '--color-texto': buena['--color-fondo'], '--color-control': '#EEEEEE' };
    expect(V.revisarPaletaLocal(rota)).toEqual(revisarPaleta(rota));
    expect(V.revisarPaletaLocal(rota).ok).toBe(false);
    const incompleta = { '--color-fondo': '#FFFFFF' };
    expect(V.revisarPaletaLocal(incompleta)).toEqual(revisarPaleta(incompleta));
  });
  it('describe cada fallo en palabras', () => {
    const buena = paletas[0].tokens;
    const rota = { ...buena, '--color-sobre-primario': buena['--color-primario'] };
    const r = V.revisarPaletaLocal(rota);
    const frases = V.describirFallos(r);
    expect(frases[0]).toMatch(/texto sobre el botón/i);
    expect(frases[0]).toMatch(/1\.0|1,0|1:1/);
  });
});
