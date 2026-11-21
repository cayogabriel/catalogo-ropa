import { describe, it, expect } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

// google.script.run mínimo: resuelve o falla según lo que se le programe.
function googleFalso(respuestas) {
  const llamadas = [];
  const crear = (ok, fallo) =>
    new Proxy(
      {},
      {
        get(_, nombre) {
          if (nombre === 'withSuccessHandler') return (f) => crear(f, fallo);
          if (nombre === 'withFailureHandler') return (f) => crear(ok, f);
          return (...args) => {
            llamadas.push({ nombre, args });
            const r = respuestas[nombre];
            queueMicrotask(() => {
              if (r instanceof Error) fallo(r);
              else ok(r);
            });
          };
        },
      },
    );
  return { script: { run: crear(null, null) }, llamadas };
}

function cargar(respuestas = {}) {
  const google = googleFalso(respuestas);
  const { Panel } = cargarParcial(['ui/js/util', 'ui/js/servidor'], { google });
  return { S: Panel.servidor, google };
}

describe('analizarError', () => {
  const { S } = cargar();
  it('reconoce los códigos de api-panel.md con o sin prefijo', () => {
    expect(S.analizarError(new Error('conflicto: la fila cambió'))).toMatchObject({ codigo: 'conflicto', detalle: 'la fila cambió' });
    expect(S.analizarError(new Error('Error: conflicto: la fila cambió')).codigo).toBe('conflicto');
    expect(S.analizarError(new Error('Exception: limite: demasiado grande')).codigo).toBe('limite');
    for (const c of ['no_autorizado', 'no_encontrado', 'invalido', 'github', 'sin_token']) {
      expect(S.analizarError(new Error(`${c}: x`)).codigo).toBe(c);
    }
  });
  it('lo que no tiene código es desconocido (se trata como falla de conexión)', () => {
    expect(S.analizarError(new Error('Failed to fetch'))).toMatchObject({ codigo: 'desconocido', crudo: 'Failed to fetch' });
    expect(S.analizarError('texto suelto').codigo).toBe('desconocido');
    expect(S.analizarError(null).codigo).toBe('desconocido');
  });
});

describe('mensajeAmable', () => {
  const { S } = cargar();
  it('cada código tiene un texto propio, sin jerga', () => {
    expect(S.mensajeAmable('conflicto')).toMatch(/otra pestaña/i);
    expect(S.mensajeAmable('no_autorizado')).toMatch(/permiso/i);
    expect(S.mensajeAmable('sin_token')).toMatch(/Configuración/);
    expect(S.mensajeAmable('desconocido')).toMatch(/conexión/i);
    expect(S.mensajeAmable('desconocido')).not.toMatch(/reintento solo/i);
  });
  it('invalido y limite muestran el detalle del servidor con mayúscula y punto', () => {
    expect(S.mensajeAmable('invalido', 'el precio debe ser mayor que 0')).toBe('El precio debe ser mayor que 0.');
    expect(S.mensajeAmable('limite', 'la foto pesa más de 8 MB')).toBe('La foto pesa más de 8 MB.');
    expect(S.mensajeAmable('limite')).toBe('Pasaste el tamaño o la cantidad máxima.');
  });
});

describe('llamar', () => {
  it('resuelve con el valor y pasa los argumentos', async () => {
    const { S, google } = cargar({ listar: { filas: [1, 2] } });
    expect(await S.llamar('listar', 'productos', { incluir_archivados: true })).toEqual({ filas: [1, 2] });
    expect(google.llamadas[0].args).toEqual(['productos', { incluir_archivados: true }]);
  });
  it('rechaza con codigo, detalle y mensaje amable', async () => {
    const { S } = cargar({ guardarCampo: new Error('conflicto: la fila cambió') });
    const e = await S.llamar('guardarCampo', 'productos', 'x', 'nombre', 'y', 1).catch((x) => x);
    expect(e.name).toBe('Error'); // viene de otro contexto vm: no sirve instanceof
    expect(e.codigo).toBe('conflicto');
    expect(e.detalle).toBe('la fila cambió');
    expect(e.amable).toMatch(/otra pestaña/i);
  });
});
