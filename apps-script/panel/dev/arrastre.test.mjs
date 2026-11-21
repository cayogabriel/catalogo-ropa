import { describe, it, expect } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial(['ui/js/util', 'ui/js/arrastre']);
const A = Panel.arrastre;

describe('indiceDestino', () => {
  const centros = [50, 150, 250, 350];
  it('devuelve la posición cuyo centro queda más cerca del puntero', () => {
    expect(A.indiceDestino(centros, 40)).toBe(0);
    expect(A.indiceDestino(centros, 110)).toBe(1);
    expect(A.indiceDestino(centros, 205)).toBe(2);
    expect(A.indiceDestino(centros, 999)).toBe(3);
    expect(A.indiceDestino(centros, -50)).toBe(0);
  });
  it('lista vacía', () => {
    expect(A.indiceDestino([], 10)).toBe(0);
  });
});

describe('indiceMasCercano (listas en cuadrícula)', () => {
  const centros = [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 50, y: 150 }, { x: 150, y: 150 }];
  it('elige la celda cuyo centro queda más cerca', () => {
    expect(A.indiceMasCercano(centros, 60, 40)).toBe(0);
    expect(A.indiceMasCercano(centros, 140, 60)).toBe(1);
    expect(A.indiceMasCercano(centros, 40, 160)).toBe(2);
    expect(A.indiceMasCercano(centros, 400, 400)).toBe(3);
  });
});

describe('desplazamientos', () => {
  it('al bajar de la posición 0 a la 2, los elementos 1 y 2 suben una fila', () => {
    expect(A.desplazamientos(4, 0, 2)).toEqual([0, -1, -1, 0]);
  });
  it('al subir de la 3 a la 1, los elementos 1 y 2 bajan una fila', () => {
    expect(A.desplazamientos(4, 3, 1)).toEqual([0, 1, 1, 0]);
  });
  it('sin movimiento no desplaza a nadie', () => {
    expect(A.desplazamientos(3, 1, 1)).toEqual([0, 0, 0]);
  });
});

describe('mover con botones', () => {
  it('arriba y abajo no se salen de la lista', () => {
    expect(A.destinoBoton(0, 5, 'arriba')).toBe(0);
    expect(A.destinoBoton(0, 5, 'abajo')).toBe(1);
    expect(A.destinoBoton(4, 5, 'abajo')).toBe(4);
    expect(A.destinoBoton(4, 5, 'arriba')).toBe(3);
  });
});

describe('ordenNuevo', () => {
  it('devuelve los ids en el orden nuevo sin mutar la lista', () => {
    const filas = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(A.ordenNuevo(filas, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(filas.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });
});
