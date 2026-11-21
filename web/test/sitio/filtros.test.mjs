import { describe, expect, it } from 'vitest';
import { leerFiltros, escribirFiltros, opcionesFiltro, aplicar } from '../../src/lib/filtros.mjs';

const item = (codigo, extra = {}) => ({
  codigo,
  nombre: codigo,
  categoria: 'vestidos',
  tallas: ['S', 'M'],
  agotadas: [],
  colores: ['Coral'],
  precio: 100,
  oferta: false,
  orden: 1,
  ...extra,
});

const items = [
  item('VES-001', { nombre: 'Vestido Lino Coral', precio: 89, orden: 2, oferta: true }),
  item('VES-002', { nombre: 'Vestido Midi Floral', precio: 119, orden: 1, tallas: ['S', 'M', 'L'], agotadas: ['L'], colores: ['Floral azul'] }),
  item('BLU-001', { nombre: 'Blusa Seda Marfil', categoria: 'blusas', precio: 59, orden: 3, colores: ['Marfil'] }),
  item('PAN-001', { nombre: 'Pantalón Palazzo', categoria: 'pantalones', precio: 99, orden: 4, tallas: ['L'], colores: ['Lino natural'] }),
];
const opciones = opcionesFiltro(items);
const vacio = { categoria: null, talla: null, color: null, min: null, max: null, oferta: false, q: '', orden: 'recomendado' };

describe('opcionesFiltro', () => {
  it('categorías, tallas, colores y rango de precio a partir de los productos', () => {
    expect(opciones.categorias).toEqual(['vestidos', 'blusas', 'pantalones']);
    expect(opciones.tallas).toEqual(['S', 'M', 'L']);
    expect(opciones.colores).toEqual(['Coral', 'Floral azul', 'Lino natural', 'Marfil']);
    expect([opciones.precioMin, opciones.precioMax]).toEqual([59, 119]);
  });
  it('tallas en orden de prendas (XS…XXL) y luego números', () => {
    const o = opcionesFiltro([item('A', { tallas: ['10', 'XL', '4', 'S', 'Única'] }), item('B', { tallas: ['M', '28'] })]);
    expect(o.tallas).toEqual(['S', 'M', 'XL', '4', '10', '28', 'Única']);
  });
});

describe('leerFiltros', () => {
  it('lee los parámetros del contrato', () => {
    const f = leerFiltros(new URLSearchParams('categoria=vestidos&talla=M&oferta=1&color=Coral&min=50&max=100&q=lino&orden=precio-asc'), opciones);
    expect(f).toEqual({ categoria: 'vestidos', talla: 'M', color: 'Coral', min: 50, max: 100, oferta: true, q: 'lino', orden: 'precio-asc' });
  });
  it('ignora valores que no existen o no son números', () => {
    const f = leerFiltros(new URLSearchParams('categoria=zapatos&talla=<script>&min=abc&max=-5&oferta=si&orden=raro'), opciones);
    expect(f).toEqual(vacio);
  });
  it('recorta búsquedas largas', () => {
    expect(leerFiltros(new URLSearchParams(`q=${'a'.repeat(200)}`), opciones).q).toHaveLength(60);
  });
});

describe('escribirFiltros', () => {
  it('sin vacíos y en orden estable', () => {
    expect(escribirFiltros({ ...vacio, oferta: true, categoria: 'vestidos', q: 'lino coral' })).toBe('categoria=vestidos&oferta=1&q=lino+coral');
    expect(escribirFiltros(vacio)).toBe('');
  });
  it('ida y vuelta', () => {
    const f = { ...vacio, talla: 'M', min: 60, orden: 'nombre' };
    expect(leerFiltros(new URLSearchParams(escribirFiltros(f)), opciones)).toEqual(f);
  });
});

describe('aplicar', () => {
  const codigos = (f) => aplicar(items, { ...vacio, ...f }).map((i) => i.codigo);

  it('sin filtros, en el orden recomendado', () => expect(codigos({})).toEqual(['VES-002', 'VES-001', 'BLU-001', 'PAN-001']));
  it('por categoría', () => expect(codigos({ categoria: 'vestidos' })).toEqual(['VES-002', 'VES-001']));
  it('por talla, sin contar las agotadas', () => expect(codigos({ talla: 'L' })).toEqual(['PAN-001']));
  it('por color', () => expect(codigos({ color: 'Marfil' })).toEqual(['BLU-001']));
  it('por rango de precio vigente', () => expect(codigos({ min: 60, max: 100 })).toEqual(['VES-001', 'PAN-001']));
  it('solo ofertas', () => expect(codigos({ oferta: true })).toEqual(['VES-001']));
  it('búsqueda sin tildes ni mayúsculas, en nombre, código y color', () => {
    expect(codigos({ q: 'PANTALON' })).toEqual(['PAN-001']);
    expect(codigos({ q: 'blu-001' })).toEqual(['BLU-001']);
    expect(codigos({ q: 'floral   azul' })).toEqual(['VES-002']);
    expect(codigos({ q: 'vestido coral' })).toEqual(['VES-001']);
  });
  it('órdenes', () => {
    expect(codigos({ orden: 'precio-asc' })).toEqual(['BLU-001', 'VES-001', 'PAN-001', 'VES-002']);
    expect(codigos({ orden: 'precio-desc' })).toEqual(['VES-002', 'PAN-001', 'VES-001', 'BLU-001']);
    expect(codigos({ orden: 'nombre' })).toEqual(['BLU-001', 'PAN-001', 'VES-001', 'VES-002']);
  });
  it('no modifica el arreglo original', () => {
    aplicar(items, { ...vacio, orden: 'nombre' });
    expect(items[0].codigo).toBe('VES-001');
  });
});
