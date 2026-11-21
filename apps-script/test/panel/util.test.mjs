import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const preparar = (opciones) => {
  const dobles = crearDobles(opciones);
  return { dobles, ...cargarGas('panel', { dobles }) };
};

describe('fallar_()', () => {
  test('lanza Error con «<codigo>: <detalle>»', () => {
    const { ctx } = preparar();
    expect(() => ctx.fallar_('invalido', 'el precio debe ser mayor que 0')).toThrow('invalido: el precio debe ser mayor que 0');
  });
});

describe('idNuevo_()', () => {
  test('da <prefijo>_<8 hex en minúscula> y no se repite', () => {
    const { ctx } = preparar();
    const ids = Array.from({ length: 50 }, () => ctx.idNuevo_('prd'));
    for (const id of ids) expect(id).toMatch(/^prd_[0-9a-f]{8}$/);
    expect(new Set(ids).size).toBe(50);
  });
});

describe('fechas', () => {
  test('aIso_ da ISO con -05:00 y deIso_ lo lee de vuelta', () => {
    const { ctx } = preparar();
    const d = ctx.deIso_('2026-12-05T00:00:00-05:00');
    expect(d.getTime()).toBe(Date.parse('2026-12-05T05:00:00Z'));
    expect(ctx.aIso_(d)).toBe('2026-12-05T00:00:00-05:00');
  });

  test('deIso_ devuelve null con vacío o con basura', () => {
    const { ctx } = preparar();
    expect(ctx.deIso_('')).toBe(null);
    expect(ctx.deIso_(null)).toBe(null);
    expect(ctx.deIso_('mañana')).toBe(null);
  });

  test('diaLima_ da la fecha de calendario en Lima, no en UTC', () => {
    const { ctx } = preparar();
    expect(ctx.diaLima_(new Date('2026-12-05T03:00:00Z'))).toBe('2026-12-04');
  });
});

describe('conCandado_()', () => {
  test('toma el candado, ejecuta, lo suelta y devuelve el resultado', () => {
    const { ctx, dobles } = preparar();
    expect(ctx.conCandado_(() => 42)).toBe(42);
    expect(dobles._candado.tomas).toBe(1);
    expect(dobles._candado.tomado).toBe(false);
  });

  test('suelta el candado aunque la función falle', () => {
    const { ctx, dobles } = preparar();
    expect(() =>
      ctx.conCandado_(() => {
        throw new Error('x');
      }),
    ).toThrow('x');
    expect(dobles._candado.tomado).toBe(false);
  });

  test('si no consigue el candado lanza conflicto y no ejecuta nada', () => {
    const { ctx, dobles } = preparar();
    dobles._candado.fallar = true;
    let corrio = false;
    expect(() => ctx.conCandado_(() => (corrio = true))).toThrow(/^conflicto:/);
    expect(corrio).toBe(false);
  });

  test('anidado reutiliza el candado en vez de pedirlo otra vez', () => {
    const { ctx, dobles } = preparar();
    ctx.conCandado_(() => ctx.conCandado_(() => 1));
    expect(dobles._candado.tomas).toBe(1);
  });
});

describe('marcas de cambios', () => {
  test('marcarCambio_ guarda la hora y hayCambiosSinPublicar_ compara con la última publicación', () => {
    const { ctx, dobles } = preparar();
    expect(ctx.hayCambiosSinPublicar_()).toBe(false);
    ctx.marcarCambio_();
    expect(ctx.hayCambiosSinPublicar_()).toBe(true);
    dobles._reloj.saltar(5000);
    ctx.marcarPublicacion_();
    expect(ctx.hayCambiosSinPublicar_()).toBe(false);
  });
});
