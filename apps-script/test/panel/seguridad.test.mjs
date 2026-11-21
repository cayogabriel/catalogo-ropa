import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const conUsuario = (usuario) => cargarGas('panel', { dobles: crearDobles({ usuario, dueno: 'duena@example.com' }) }).ctx;

describe('requireAdmin_()', () => {
  test('deja pasar a la dueña aunque cambien las mayúsculas', () => {
    expect(() => conUsuario('Duena@Example.com').requireAdmin_()).not.toThrow();
  });

  test('rechaza a quien entra sin identificarse', () => {
    expect(() => conUsuario('').requireAdmin_()).toThrow(/no_autorizado/);
  });

  test('rechaza a otra cuenta', () => {
    expect(() => conUsuario('otra@example.com').requireAdmin_()).toThrow(/no_autorizado/);
  });
});
