import { describe, expect, it } from 'vitest';
import { crearLista, CLAVE_LISTA } from '../../src/lib/lista.mjs';

const almacenMemoria = (inicial = {}) => {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => {
      datos[k] = String(v);
    },
    removeItem: (k) => delete datos[k],
  };
};

const bloqueado = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceeded');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('crearLista', () => {
  it('usa la clave del contrato y guarda { codigo, talla, color }', () => {
    const a = almacenMemoria();
    const lista = crearLista(a);
    lista.agregar({ codigo: 'VES-001', talla: 'M', color: 'Coral' });
    expect(CLAVE_LISTA).toBe('catalogo-ropa:lista');
    expect(JSON.parse(a.datos[CLAVE_LISTA])).toEqual([{ codigo: 'VES-001', talla: 'M', color: 'Coral' }]);
  });

  it('una entrada por código: agregar de nuevo actualiza', () => {
    const lista = crearLista(almacenMemoria());
    lista.agregar({ codigo: 'VES-001', talla: 'M' });
    lista.agregar({ codigo: 'VES-001', talla: 'L', color: 'Coral' });
    expect(lista.leer()).toEqual([{ codigo: 'VES-001', talla: 'L', color: 'Coral' }]);
  });

  it('contiene, actualizar, quitar y vaciar', () => {
    const lista = crearLista(almacenMemoria());
    lista.agregar({ codigo: 'VES-001' });
    lista.agregar({ codigo: 'BLU-002' });
    expect(lista.contiene('BLU-002')).toBe(true);
    lista.actualizar('VES-001', { talla: 'S' });
    expect(lista.leer()[0]).toEqual({ codigo: 'VES-001', talla: 'S', color: null });
    lista.quitar('VES-001');
    expect(lista.leer().map((i) => i.codigo)).toEqual(['BLU-002']);
    lista.vaciar();
    expect(lista.leer()).toEqual([]);
  });

  it('JSON roto o con basura no rompe', () => {
    expect(crearLista(almacenMemoria({ [CLAVE_LISTA]: '{roto' })).leer()).toEqual([]);
    expect(crearLista(almacenMemoria({ [CLAVE_LISTA]: '{"a":1}' })).leer()).toEqual([]);
    const sucia = JSON.stringify([{ codigo: 'VES-001', talla: 5 }, null, { talla: 'M' }, 'x', { codigo: 'BLU-001', color: 'Rojo' }]);
    expect(crearLista(almacenMemoria({ [CLAVE_LISTA]: sucia })).leer()).toEqual([
      { codigo: 'VES-001', talla: null, color: null },
      { codigo: 'BLU-001', talla: null, color: 'Rojo' },
    ]);
  });

  it('con localStorage bloqueado sigue en memoria mientras dura la pestaña', () => {
    const lista = crearLista(bloqueado);
    lista.agregar({ codigo: 'VES-001', talla: 'M' });
    expect(lista.leer()).toEqual([{ codigo: 'VES-001', talla: 'M', color: null }]);
    expect(crearLista(null).leer()).toEqual([]);
  });
});
