import { describe, test, expect } from 'vitest';
import { validarCatalogo } from '@catalogo/contratos';
import { catalogoMinimo } from '../../../test/ayudas/catalogo-minimo.mjs';
import { cargarGas } from '../gas/cargar.mjs';
import { panelInstalado } from './ayudas.mjs';

const { ctx } = cargarGas('panel');

const PRODUCTO = { id: 'prd_00000001', categoria_id: 'cat_00000001', precio_regular: 100 };
const T = (dia, hora = 0) => `2026-12-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:00:00-05:00`;

let n = 0;
function oferta(extra) {
  n++;
  return {
    id: `ofe_${String(n).padStart(8, '0')}`, nombre: 'o', tipo: 'porcentaje', valor: 20, alcance: 'tienda', objetivos: [], desde: null,
    hasta: null, prioridad: 0, etiqueta: '', es_liquidacion: false, cuenta_regresiva: false, activa: true, ...extra,
  };
}

const calcular = (ofertas, contexto = {}, producto = PRODUCTO) =>
  ctx.ventanasDePrecio_(producto, ofertas, { redondeo: 'ninguno', secciones: [], temporadas: [], ahora: null, ...contexto });

// La copia publicada que armaría el Panel con estas ventanas debe cumplir el contrato.
function esValido(resultado, extra = {}) {
  const c = catalogoMinimo();
  c.productos[0].precio = JSON.parse(JSON.stringify(resultado));
  Object.assign(c.productos[0], extra);
  return validarCatalogo(c);
}

describe('sin ofertas', () => {
  test('una sola ventana con el precio regular, sin «antes», % ni insignias', () => {
    const r = calcular([]);
    expect(r).toEqual({
      regular: 100,
      ventanas: [{ desde: null, hasta: null, precio: 100, antes: null, descuento_pct: null, etiqueta: null, liquidacion: false, cuenta_regresiva: false, oferta_id: null }],
    });
    expect(esValido(r)).toEqual({ ok: true, errores: [] });
  });

  test('las ofertas inactivas no cuentan', () => {
    expect(calcular([oferta({ activa: false })]).ventanas).toHaveLength(1);
  });
});

describe('una oferta con fechas', () => {
  test('da tres ventanas contiguas: antes, durante y después, con el % calculado de los precios', () => {
    const o = oferta({ valor: 25, desde: T(1), hasta: T(10), etiqueta: '', cuenta_regresiva: true });
    const r = calcular([o]);
    expect(r.ventanas.map((v) => [v.desde, v.hasta, v.precio, v.oferta_id])).toEqual([
      [null, T(1), 100, null],
      [T(1), T(10), 75, o.id],
      [T(10), null, 100, null],
    ]);
    expect(r.ventanas[1]).toMatchObject({ antes: 100, descuento_pct: 25, etiqueta: null, liquidacion: false, cuenta_regresiva: true });
    expect(esValido(r).errores).toEqual([]);
  });

  test('la etiqueta de la oferta y el atajo de liquidación pasan a la ventana', () => {
    const r = calcular([oferta({ desde: T(1), hasta: T(10), etiqueta: 'Cyber', es_liquidacion: true })]);
    expect(r.ventanas[1]).toMatchObject({ etiqueta: 'Cyber', liquidacion: true });
  });

  test('sin fecha de fin no hay cuenta regresiva aunque se haya pedido', () => {
    const r = calcular([oferta({ desde: T(1), hasta: null, cuenta_regresiva: true })]);
    expect(r.ventanas).toHaveLength(2);
    expect(r.ventanas[1]).toMatchObject({ hasta: null, cuenta_regresiva: false });
    expect(esValido(r).errores).toEqual([]);
  });

  test('una oferta sin fechas dura siempre: una sola ventana', () => {
    const r = calcular([oferta({ valor: 10 })]);
    expect(r.ventanas).toHaveLength(1);
    expect(r.ventanas[0]).toMatchObject({ desde: null, hasta: null, precio: 90, descuento_pct: 10 });
  });
});

describe('tipos de oferta', () => {
  test('porcentaje, monto y precio final', () => {
    expect(calcular([oferta({ tipo: 'porcentaje', valor: 15 })]).ventanas[0].precio).toBe(85);
    expect(calcular([oferta({ tipo: 'monto', valor: 12.5 })]).ventanas[0].precio).toBe(87.5);
    expect(calcular([oferta({ tipo: 'precio_final', valor: 59.9 })]).ventanas[0].precio).toBe(59.9);
  });

  test('el % se redondea hacia abajo (nunca se exagera)', () => {
    const r = calcular([oferta({ tipo: 'precio_final', valor: 66.7 })], {}, { ...PRODUCTO, precio_regular: 89 });
    expect(r.ventanas[0]).toMatchObject({ precio: 66.7, descuento_pct: 25 });
  });

  test('un descuento menor al 1 % deja el precio rebajado pero sin porcentaje', () => {
    const r = calcular([oferta({ tipo: 'monto', valor: 0.5 })], {}, { ...PRODUCTO, precio_regular: 1000 });
    expect(r.ventanas[0]).toMatchObject({ precio: 999.5, antes: 1000, descuento_pct: null });
    expect(esValido(r).errores).toEqual([]);
  });
});

describe('redondeo', () => {
  const producto = { ...PRODUCTO, precio_regular: 89 };
  test('ninguno deja céntimos (a 2 decimales)', () => {
    expect(calcular([oferta({ valor: 15 })], { redondeo: 'ninguno' }, producto).ventanas[0].precio).toBe(75.65);
  });
  test('entero redondea al sol más cercano', () => {
    expect(calcular([oferta({ valor: 15 })], { redondeo: 'entero' }, producto).ventanas[0]).toMatchObject({ precio: 76, descuento_pct: 14 });
  });
  test('90 deja el precio terminado en .90 más cercano', () => {
    expect(calcular([oferta({ valor: 15 })], { redondeo: '90' }, producto).ventanas[0]).toMatchObject({ precio: 75.9, descuento_pct: 14 });
    expect(calcular([oferta({ valor: 20 })], { redondeo: '90' }, producto).ventanas[0].precio).toBe(70.9);
  });
  test('el precio final que escribe la dueña no se redondea', () => {
    expect(calcular([oferta({ tipo: 'precio_final', valor: 59.37 })], { redondeo: '90' }, producto).ventanas[0].precio).toBe(59.37);
  });
  test('el precio regular tampoco se toca', () => {
    expect(calcular([], { redondeo: '90' }, { ...PRODUCTO, precio_regular: 89.35 }).regular).toBe(89.35);
  });
});

describe('ofertas que no sirven', () => {
  test('si el redondeo deja el precio igual al regular, la oferta no cuenta', () => {
    const r = calcular([oferta({ valor: 1 })], { redondeo: 'entero' }, { ...PRODUCTO, precio_regular: 10 });
    expect(r.ventanas).toHaveLength(1);
    expect(r.ventanas[0].oferta_id).toBe(null);
  });
  test('un monto igual o mayor que el precio (queda en 0 o menos) no cuenta', () => {
    expect(calcular([oferta({ tipo: 'monto', valor: 100 })]).ventanas[0].oferta_id).toBe(null);
    expect(calcular([oferta({ tipo: 'monto', valor: 500 })]).ventanas[0].oferta_id).toBe(null);
  });
  test('un precio final que no baja no cuenta', () => {
    expect(calcular([oferta({ tipo: 'precio_final', valor: 100 })]).ventanas[0].oferta_id).toBe(null);
    expect(calcular([oferta({ tipo: 'precio_final', valor: 150 })]).ventanas[0].oferta_id).toBe(null);
  });
  test('una oferta inefectiva no tapa a otra más barata de menor prioridad', () => {
    const buena = oferta({ valor: 10, prioridad: 1 });
    const mala = oferta({ tipo: 'precio_final', valor: 150, prioridad: 9 });
    expect(calcular([mala, buena]).ventanas[0].oferta_id).toBe(buena.id);
  });
  test('una oferta con fechas al revés se ignora', () => {
    expect(calcular([oferta({ desde: T(10), hasta: T(1) })]).ventanas).toHaveLength(1);
  });
});

describe('prioridad y empates: las ofertas no se suman', () => {
  test('gana la de mayor prioridad aunque descuente menos', () => {
    const grande = oferta({ valor: 50, prioridad: 1 });
    const chica = oferta({ valor: 10, prioridad: 5 });
    const r = calcular([grande, chica]);
    expect(r.ventanas).toHaveLength(1);
    expect(r.ventanas[0]).toMatchObject({ precio: 90, oferta_id: chica.id });
  });
  test('con la misma prioridad gana la de mayor descuento (sin sumarlas)', () => {
    const a = oferta({ valor: 10, prioridad: 2 });
    const b = oferta({ tipo: 'monto', valor: 30, prioridad: 2 });
    const r = calcular([a, b]);
    expect(r.ventanas[0]).toMatchObject({ precio: 70, oferta_id: b.id });
  });
  test('si empatan en todo, gana la primera de la lista (resultado estable)', () => {
    const a = oferta({ valor: 10 });
    const b = oferta({ valor: 10 });
    expect(calcular([a, b]).ventanas[0].oferta_id).toBe(a.id);
    expect(calcular([b, a]).ventanas[0].oferta_id).toBe(b.id);
  });
  test('ofertas que se pisan a medias parten el tiempo en ventanas contiguas', () => {
    const base = oferta({ valor: 20, prioridad: 1, desde: T(1), hasta: T(20), cuenta_regresiva: true });
    const flash = oferta({ valor: 40, prioridad: 2, desde: T(10), hasta: T(15), cuenta_regresiva: true });
    const r = calcular([base, flash]);
    expect(r.ventanas.map((v) => [v.desde, v.hasta, v.precio, v.cuenta_regresiva])).toEqual([
      [null, T(1), 100, false],
      [T(1), T(10), 80, false], // termina porque entra la otra oferta, no porque acabe la oferta: sin cuenta regresiva
      [T(10), T(15), 60, true],
      [T(15), T(20), 80, true],
      [T(20), null, 100, false],
    ]);
    expect(esValido(r).errores).toEqual([]);
  });
  test('si dos ofertas dan lo mismo y se pisan, gana la primera mientras coinciden y luego sigue la otra', () => {
    const a = oferta({ valor: 20, desde: T(1), hasta: T(10) });
    const b = oferta({ valor: 20, desde: T(5), hasta: T(15) });
    const r = calcular([a, b]);
    expect(r.ventanas.map((v) => [v.desde, v.hasta, v.oferta_id])).toEqual([
      [null, T(1), null],
      [T(1), T(10), a.id],
      [T(10), T(15), b.id],
      [T(15), null, null],
    ]);
  });
});

describe('alcances', () => {
  const contexto = { secciones: ['sec_00000001'], temporadas: ['tem_00000001'] };
  const aplica = (o) => calcular([o], contexto).ventanas[0].oferta_id === o.id;
  test('producto', () => {
    expect(aplica(oferta({ alcance: 'producto', objetivos: ['prd_00000001'] }))).toBe(true);
    expect(aplica(oferta({ alcance: 'producto', objetivos: ['prd_00000002'] }))).toBe(false);
  });
  test('categoría', () => {
    expect(aplica(oferta({ alcance: 'categoria', objetivos: ['cat_00000001'] }))).toBe(true);
    expect(aplica(oferta({ alcance: 'categoria', objetivos: ['cat_00000002'] }))).toBe(false);
  });
  test('sección', () => {
    expect(aplica(oferta({ alcance: 'seccion', objetivos: ['sec_00000001'] }))).toBe(true);
    expect(aplica(oferta({ alcance: 'seccion', objetivos: ['sec_00000002'] }))).toBe(false);
  });
  test('temporada', () => {
    expect(aplica(oferta({ alcance: 'temporada', objetivos: ['tem_00000001'] }))).toBe(true);
    expect(aplica(oferta({ alcance: 'temporada', objetivos: ['tem_00000002'] }))).toBe(false);
  });
  test('tienda: a todo, sin objetivos', () => {
    expect(aplica(oferta({ alcance: 'tienda' }))).toBe(true);
  });
});

describe('ventanas pasadas', () => {
  test('con «ahora» se descartan las que ya terminaron y la primera vuelve a empezar en null', () => {
    const o = oferta({ valor: 20, desde: T(1), hasta: T(10) });
    const r = calcular([o], { ahora: new Date('2026-12-12T12:00:00-05:00') });
    expect(r.ventanas).toHaveLength(1);
    expect(r.ventanas[0]).toMatchObject({ desde: null, hasta: null, oferta_id: null, precio: 100 });
    const durante = calcular([o], { ahora: new Date('2026-12-05T12:00:00-05:00') });
    expect(durante.ventanas.map((v) => [v.desde, v.hasta, v.oferta_id])).toEqual([[null, T(10), o.id], [T(10), null, null]]);
    expect(esValido(durante).errores).toEqual([]);
  });
});

describe('pertenencias', () => {
  test('una prenda pertenece a las secciones manuales, de categoría o de etiqueta que la incluyen y a las temporadas de sus fotos', () => {
    const producto = { id: 'prd_00000001', categoria_id: 'cat_00000001', etiquetas: ['nuevo'] };
    const secciones = [
      { id: 'sec_00000001', tipo: 'manual', productos: ['prd_00000001'], parametro: '' },
      { id: 'sec_00000002', tipo: 'categoria', productos: [], parametro: 'cat_00000001' },
      { id: 'sec_00000003', tipo: 'etiqueta', productos: [], parametro: 'nuevo' },
      { id: 'sec_00000004', tipo: 'ofertas', productos: [], parametro: '' },
      { id: 'sec_00000005', tipo: 'manual', productos: ['prd_00000009'], parametro: '' },
    ];
    const fotos = [
      { temporada_id: 'tem_00000001', productos: ['prd_00000001'] },
      { temporada_id: 'tem_00000002', productos: [] },
    ];
    expect(ctx.pertenenciasDe_(producto, secciones, fotos)).toEqual({
      secciones: ['sec_00000001', 'sec_00000002', 'sec_00000003'],
      temporadas: ['tem_00000001'],
    });
  });
});

describe('vistaPreviaPrecios()', () => {
  function conProducto() {
    const p = panelInstalado();
    const cat = p.ctx.crear('categorias', { nombre: 'Vestidos' });
    const prod = p.ctx.crear('productos', { nombre: 'V', categoria_id: cat.id, precio_regular: 100 });
    return { ...p, cat, prod };
  }

  test('sin oferta devuelve el precio regular', () => {
    const { ctx: c, prod } = conProducto();
    expect(c.vistaPreviaPrecios({ producto_id: prod.id })).toEqual({
      regular: 100,
      ventanas: [{ desde: null, hasta: null, precio: 100, antes: null, descuento_pct: null, etiqueta: null, liquidacion: false, cuenta_regresiva: false, oferta_id: null }],
    });
  });

  test('con una oferta sin guardar la aplica como si estuviera activa', () => {
    const { ctx: c, prod } = conProducto();
    const r = c.vistaPreviaPrecios({ producto_id: prod.id, oferta: { tipo: 'porcentaje', valor: 30, alcance: 'tienda', desde: T(1), hasta: T(10) } });
    expect(r.ventanas.map((v) => v.precio)).toEqual([100, 70, 100]);
    expect(c.listar('ofertas').filas).toEqual([]);
  });

  test('una oferta guardada se muestra con los cambios sin guardar encima', () => {
    const { ctx: c, prod } = conProducto();
    const o = c.crear('ofertas', { nombre: 'x', valor: 10, alcance: 'tienda' });
    const r = c.vistaPreviaPrecios({ producto_id: prod.id, oferta: { id: o.id, valor: 50 } });
    expect(r.ventanas[0].precio).toBe(50);
  });

  test('usa el redondeo de la configuración y ofertas guardadas activas', () => {
    const { ctx: c, prod } = conProducto();
    c.guardarConfig('redondeo', '90');
    c.crear('ofertas', { nombre: 'x', valor: 17, alcance: 'tienda', activa: true });
    expect(c.vistaPreviaPrecios({ producto_id: prod.id }).ventanas[0].precio).toBe(82.9);
  });

  test('rechaza una oferta inválida, una prenda inexistente o un precio vacío', () => {
    const { ctx: c, prod } = conProducto();
    expect(() => c.vistaPreviaPrecios({ producto_id: prod.id, oferta: { tipo: 'porcentaje', valor: 95 } })).toThrow(/porcentaje va de 1 a 90/);
    expect(() => c.vistaPreviaPrecios({ producto_id: prod.id, oferta: { tipo: 'sorteo' } })).toThrow(/invalido/);
    expect(() => c.vistaPreviaPrecios({ producto_id: 'prd_ffffffff' })).toThrow(/^no_encontrado:/);
    const sin = c.crear('productos', { nombre: 'Sin precio' });
    expect(() => c.vistaPreviaPrecios({ producto_id: sin.id })).toThrow(/^invalido: .*precio/);
  });
});
