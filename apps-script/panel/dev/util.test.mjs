import { describe, it, expect, vi } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial('ui/js/util');
const U = Panel.util;

describe('fechas de Lima', () => {
  it('localAIso agrega el desfase -05:00 y completa los segundos', () => {
    expect(U.localAIso('2026-12-05T00:00')).toBe('2026-12-05T00:00:00-05:00');
    expect(U.localAIso('2026-12-05T08:30:15')).toBe('2026-12-05T08:30:15-05:00');
  });
  it('isoALocal lleva cualquier instante a la hora de Lima', () => {
    expect(U.isoALocal('2026-12-05T05:00:00Z')).toBe('2026-12-05T00:00');
    expect(U.isoALocal('2026-12-05T00:00:00-05:00')).toBe('2026-12-05T00:00');
  });
  it('ida y vuelta estable', () => {
    const v = '2026-11-21T18:45';
    expect(U.isoALocal(U.localAIso(v))).toBe(v);
  });
  it('vacío y null', () => {
    expect(U.localAIso('')).toBeNull();
    expect(U.localAIso(null)).toBeNull();
    expect(U.isoALocal(null)).toBe('');
    expect(U.isoALocal('basura')).toBe('');
  });
  it('formatoFecha da dd/mm/aaaa en hora de Lima', () => {
    expect(U.formatoFecha('2026-12-05T00:30:00-05:00')).toBe('05/12/2026');
    expect(U.formatoFecha('2026-12-05T03:00:00Z')).toBe('04/12/2026');
    expect(U.formatoFecha(null)).toBe('');
  });
  it('haceCuanto', () => {
    const ahora = new Date('2026-11-21T12:00:00-05:00');
    expect(U.haceCuanto('2026-11-21T11:59:40-05:00', ahora)).toBe('hace un momento');
    expect(U.haceCuanto('2026-11-21T11:55:00-05:00', ahora)).toBe('hace 5 min');
    expect(U.haceCuanto('2026-11-21T09:00:00-05:00', ahora)).toBe('hace 3 h');
    expect(U.haceCuanto('2026-11-20T09:00:00-05:00', ahora)).toBe('ayer');
    expect(U.haceCuanto('2026-11-17T09:00:00-05:00', ahora)).toBe('hace 4 días');
    expect(U.haceCuanto('2026-10-01T09:00:00-05:00', ahora)).toBe('01/10/2026');
    expect(U.haceCuanto(null, ahora)).toBe('');
  });
});

describe('montos', () => {
  it('formatoMonto', () => {
    expect(U.formatoMonto(66.75)).toBe('S/ 66.75');
    expect(U.formatoMonto(89)).toBe('S/ 89');
    expect(U.formatoMonto(66.5)).toBe('S/ 66.50');
    expect(U.formatoMonto(null)).toBe('');
    expect(U.formatoMonto('')).toBe('');
    expect(U.formatoMonto(12, '$')).toBe('$ 12');
  });
});

describe('listas y texto', () => {
  it('textoALista separa por comas o saltos, limpia y no repite', () => {
    expect(U.textoALista('S, M,L\nXL, M, ')).toEqual(['S', 'M', 'L', 'XL']);
    expect(U.textoALista('')).toEqual([]);
  });
  it('listaATexto', () => {
    expect(U.listaATexto(['S', 'M'])).toBe('S, M');
    expect(U.listaATexto(null)).toBe('');
  });
  it('sinTildes y coincide buscan sin importar tildes ni mayúsculas', () => {
    expect(U.sinTildes('Pantalón Niña')).toBe('pantalon nina');
    expect(U.coincide('Blusa Off-Shoulder Mostaza', 'blusa mostaza')).toBe(true);
    expect(U.coincide('Vestido Niña Margaritas', 'NINA')).toBe(true);
    expect(U.coincide('Vestido', 'falda')).toBe(false);
    expect(U.coincide('Vestido', '')).toBe(true);
  });
  it('slug', () => {
    expect(U.slug('Verano 2027 · Costa')).toBe('verano-2027-costa');
    expect(U.slug('Día de la Madre')).toBe('dia-de-la-madre');
  });
});

describe('moverElemento', () => {
  it('mueve sin mutar el original', () => {
    const a = ['a', 'b', 'c'];
    expect(U.moverElemento(a, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(U.moverElemento(a, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(a).toEqual(['a', 'b', 'c']);
  });
  it('fuera de rango deja la lista igual', () => {
    expect(U.moverElemento(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
    expect(U.moverElemento(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
  });
});

describe('rellenarPlantilla', () => {
  it('quita la línea completa si talla o color están vacíos', () => {
    expect(U.rellenarPlantilla('Talla: {talla}\nPrecio: {precio}', { precio: 'S/ 89' })).toBe('Precio: S/ 89');
    expect(U.rellenarPlantilla('Color: {color}\nPrecio: {precio}', { color: '', precio: 'S/ 89' })).toBe('Precio: S/ 89');
  });
  it('reemplaza las variables y respeta las que no conoce', () => {
    expect(U.rellenarPlantilla('Hola {vendedora}, {desconocida}', { vendedora: 'Ana' })).toBe('Hola Ana, {desconocida}');
    expect(U.rellenarPlantilla('{producto} ({codigo})', { producto: 'Vestido', codigo: 'VES-001' })).toBe('Vestido (VES-001)');
  });
  it('con talla presente conserva la línea', () => {
    expect(U.rellenarPlantilla('Talla: {talla}', { talla: 'M' })).toBe('Talla: M');
  });
});

describe('debounce', () => {
  it('junta varias llamadas en una y permite cancelar o forzar', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = U.debounce(fn, 500);
    d(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    d(4);
    d.cancelar();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    d(5);
    d.ahora();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(5);
    vi.useRealTimers();
  });
});
