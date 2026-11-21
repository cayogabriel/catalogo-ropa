import { describe, expect, it } from 'vitest';
import { presentarPrecio, requisitoCumplido, insignias, restante } from '../../src/lib/vista-precio.mjs';
import { producto, ventana, EN_OFERTA, ANTES_OFERTA, T } from './ayuda.mjs';

const textos = (clave, v = {}) =>
  ({
    'insignia.nuevo': 'Nuevo',
    'insignia.liquidacion': 'Liquidación',
    'insignia.ultimas_unidades': 'Últimas unidades',
    'insignia.mas_consultado': 'Más consultado',
    'precio.descuento': `-${v.porcentaje} %`,
  })[clave];

describe('presentarPrecio', () => {
  it('sin oferta muestra solo el precio regular, sin antes ni %', () => {
    const p = presentarPrecio(producto({}, { oferta: {} }), ANTES_OFERTA);
    expect(p).toMatchObject({ precio: 100, antes: null, pct: null, etiqueta: null, oferta: false });
  });

  it('con oferta vigente da antes, % y etiqueta', () => {
    const p = presentarPrecio(producto({}, { oferta: { etiqueta: 'Verano' } }), EN_OFERTA);
    expect(p).toMatchObject({ precio: 70, antes: 100, pct: 30, etiqueta: 'Verano', oferta: true });
    expect(p.hasta).toBe('2026-12-20T00:00:00-05:00');
  });

  it('la oferta termina a su hora aunque el HTML sea viejo', () => {
    const p = presentarPrecio(producto({}, { oferta: {} }), T('2026-12-20T00:00:00-05:00'));
    expect(p.oferta).toBe(false);
    expect(p.precio).toBe(100);
  });

  it('cuenta regresiva solo con cuenta_regresiva y hasta', () => {
    expect(presentarPrecio(producto({}, { oferta: { cuenta_regresiva: true } }), EN_OFERTA).cuentaRegresiva).toBe(true);
    const sinFin = { precio: { regular: 100, ventanas: [ventana({ precio: 70, antes: 100, descuento_pct: 30, oferta_id: 'ofe_00000001', cuenta_regresiva: true })] } };
    expect(presentarPrecio(sinFin, EN_OFERTA).cuentaRegresiva).toBe(false);
  });

  it('una ventana con antes pero sin oferta_id no muestra antes', () => {
    const raro = { precio: { regular: 100, ventanas: [ventana({ antes: 120, descuento_pct: 10 })] } };
    expect(presentarPrecio(raro, EN_OFERTA)).toMatchObject({ antes: null, pct: null });
  });
});

describe('requisitoCumplido', () => {
  const oferta = ventana({ oferta_id: 'ofe_00000001' });
  const liq = ventana({ oferta_id: 'ofe_00000002', liquidacion: true });
  it('oferta exige oferta_id', () => {
    expect(requisitoCumplido('oferta', oferta)).toBe(true);
    expect(requisitoCumplido('oferta', ventana())).toBe(false);
  });
  it('liquidacion exige oferta_id y liquidacion', () => {
    expect(requisitoCumplido('liquidacion', liq)).toBe(true);
    expect(requisitoCumplido('liquidacion', oferta)).toBe(false);
  });
  it('sin requisito siempre se cumple', () => {
    expect(requisitoCumplido(null, ventana())).toBe(true);
  });
});

describe('insignias (regla 4: ninguna se inventa)', () => {
  it('producto normal no lleva ninguna', () => {
    expect(insignias(producto(), EN_OFERTA, textos)).toEqual([]);
  });

  it('nuevo, descuento y más consultado según los datos', () => {
    const p = producto({ nuevo: true, popularidad: 1 }, { oferta: { etiqueta: '-25%' } });
    expect(insignias(p, EN_OFERTA, textos)).toEqual([
      { tipo: 'nuevo', texto: 'Nuevo' },
      { tipo: 'descuento', texto: '-25%', repitePct: true },
      { tipo: 'consultado', texto: 'Más consultado' },
    ]);
  });

  it('sin etiqueta usa -NN %', () => {
    const p = producto({}, { oferta: {} });
    expect(insignias(p, EN_OFERTA, textos)).toEqual([{ tipo: 'descuento', texto: '-30 %', repitePct: true }]);
  });

  it('marca si la insignia de descuento solo repite el % (para no duplicarla junto al precio)', () => {
    const conPct = insignias(producto({}, { oferta: { etiqueta: '-30%' } }), EN_OFERTA, textos)[0];
    const sinEtiqueta = insignias(producto({}, { oferta: {} }), EN_OFERTA, textos)[0];
    const propia = insignias(producto({}, { oferta: { etiqueta: 'Cyber Wow' } }), EN_OFERTA, textos)[0];
    expect([conPct.repitePct, sinEtiqueta.repitePct, propia.repitePct]).toEqual([true, true, false]);
  });

  it('popularidad 4 o mayor no da «Más consultado»', () => {
    expect(insignias(producto({ popularidad: 4 }), EN_OFERTA, textos)).toEqual([]);
  });

  it('liquidación y últimas unidades', () => {
    const p = producto({ ultimas_unidades: true }, { oferta: { liquidacion: true } });
    expect(insignias(p, EN_OFERTA, textos).map((i) => i.tipo)).toEqual(['descuento', 'liquidacion', 'ultimas']);
  });

  it('fuera de la oferta no hay descuento', () => {
    expect(insignias(producto({}, { oferta: {} }), ANTES_OFERTA, textos)).toEqual([]);
  });
});

describe('restante', () => {
  it('días, horas y minutos hasta el fin', () => {
    expect(restante('2026-12-20T00:00:00-05:00', T('2026-12-18T21:30:00-05:00'))).toEqual({ dias: 1, horas: 2, minutos: 30 });
  });
  it('null si ya terminó o no hay fecha', () => {
    expect(restante('2026-12-20T00:00:00-05:00', T('2026-12-20T00:00:00-05:00'))).toBeNull();
    expect(restante(null, EN_OFERTA)).toBeNull();
  });
});
