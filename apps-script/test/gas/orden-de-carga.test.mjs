// Google no garantiza el orden en que carga los archivos de un proyecto: si un archivo lee al cargarse
// algo que define otro, en el orden equivocado falla. Aquí se carga cada proyecto en varios órdenes.
import { describe, test, expect } from 'vitest';
import { cargarGas } from './cargar.mjs';
import { crearDobles } from './dobles/index.mjs';
import { panelInstalado } from '../panel/ayudas.mjs';

const ordenes = ['alfabetico', 'inverso', 1, 2, 3, 5, 8, 13];

describe.each(['panel', 'api'])('proyecto %s', (proyecto) => {
  test.each(ordenes)('carga sin errores con el orden %s', (orden) => {
    expect(() => cargarGas(proyecto, { dobles: crearDobles(), orden })).not.toThrow();
  });

  test('define las mismas funciones sin importar el orden', () => {
    const nombres = (orden) => {
      const { ctx } = cargarGas(proyecto, { dobles: crearDobles(), orden });
      return Object.keys(ctx).filter((k) => typeof ctx[k] === 'function').sort();
    };
    expect(nombres('inverso')).toEqual(nombres('alfabetico'));
  });
});

describe('el Panel funciona igual cargado al revés', () => {
  test('instalar, crear y guardar con el orden inverso', () => {
    const dobles = crearDobles();
    const { ctx } = cargarGas('panel', { dobles, orden: 'inverso' });
    ctx.ahora_ = () => new Date(dobles._reloj.ahora());
    ctx.instalar();
    const cat = ctx.crear('categorias', { nombre: 'Vestidos' });
    expect(ctx.guardarCampo('categorias', cat.id, 'nombre', 'Faldas', 1).fila.nombre).toBe('Faldas');
    expect(panelInstalado).toBeTypeOf('function');
  });
});
