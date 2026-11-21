import { describe, test, expect } from 'vitest';
import { cargarGas } from './cargar.mjs';
import { crearDobles } from './dobles/index.mjs';

const ejemplo = new URL('./ejemplo/', import.meta.url);

describe('cargarGas', () => {
  test('los archivos comparten el ámbito global, como en Apps Script', () => {
    const { ctx } = cargarGas(ejemplo);
    expect(ctx.saludar()).toBe('hola');
  });

  test('valor() lee constantes de nivel superior', () => {
    const { valor } = cargarGas(ejemplo);
    expect(valor('SALUDO')).toBe('hola');
  });

  test('el código ve los dobles de los servicios de Google', () => {
    const { ctx } = cargarGas(ejemplo, { dobles: crearDobles({ usuario: 'alguien@example.com' }) });
    expect(ctx.quien()).toBe('alguien@example.com');
  });
});
