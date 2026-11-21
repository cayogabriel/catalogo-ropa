import { describe, it, expect, vi } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial(['ui/js/util', 'ui/js/servidor', 'ui/js/fotos', 'ui/js/miniaturas']);
const F = Panel.fotos;

const MB = 1024 * 1024;

// Un navegador de mentira: bitmap, canvas y blob con tamaño según la calidad.
function entorno({ ancho = 4000, alto = 3000, bytesPorCalidad = (c) => c * 2 * MB, bitmapFalla = false, imagenFalla = false } = {}) {
  const registro = { orden: [], calidades: [], bitmaps: [], canvases: [] };
  const crearCanvas = (w, h) => {
    const ctx = {
      set fillStyle(v) { registro.orden.push(`fillStyle:${v}`); },
      fillRect: (...a) => registro.orden.push(`fillRect:${a.join(',')}`),
      drawImage: (...a) => registro.orden.push(`drawImage:${a.slice(1).join(',')}`),
    };
    const canvas = {
      width: w, height: h, getContext: () => ctx,
      toBlob: (cb, tipo, calidad) => {
        registro.orden.push('toBlob');
        registro.calidades.push([tipo, calidad]);
        cb({ size: Math.round(bytesPorCalidad(calidad)), type: tipo });
      },
    };
    registro.canvases.push(canvas);
    return canvas;
  };
  const bitmap = () => {
    const b = { width: ancho, height: alto, close: vi.fn() };
    registro.bitmaps.push(b);
    return b;
  };
  const deps = {
    createImageBitmap: vi.fn(async (archivo, opciones) => {
      if (bitmapFalla) throw new Error('no soportado');
      return bitmap();
    }),
    cargarImagen: vi.fn(async () => {
      if (imagenFalla) throw new Error('no se pudo leer');
      return bitmap();
    }),
    crearCanvas,
    leerDataUrl: async (blob) => `data:${blob.type};base64,QUJD`,
    liberarCanvas: vi.fn(),
  };
  return { deps, registro };
}
const jpg = (extra = {}) => ({ name: 'IMG_0001.JPG', type: 'image/jpeg', size: 12 * MB, ...extra });

describe('calcularTamano', () => {
  it('lado mayor a 2000 sin deformar y sin agrandar', () => {
    expect(F.calcularTamano(4000, 3000)).toEqual({ ancho: 2000, alto: 1500 });
    expect(F.calcularTamano(3000, 4000)).toEqual({ ancho: 1500, alto: 2000 });
    expect(F.calcularTamano(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(F.calcularTamano(2000, 2000)).toEqual({ ancho: 2000, alto: 2000 });
    expect(F.calcularTamano(5001, 1)).toEqual({ ancho: 2000, alto: 1 });
  });
});

describe('comprimirImagen', () => {
  it("usa createImageBitmap con imageOrientation 'from-image' y JPEG al 0.85", async () => {
    const { deps, registro } = entorno();
    const r = await F.comprimirImagen(jpg(), deps);
    expect(deps.createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' });
    expect(registro.canvases[0]).toMatchObject({ width: 2000, height: 1500 });
    expect(registro.calidades[0]).toEqual(['image/jpeg', 0.85]);
    expect(r).toMatchObject({ mime: 'image/jpeg', ancho: 2000, alto: 1500 });
    expect(registro.bitmaps[0].close).toHaveBeenCalled();
    expect(deps.liberarCanvas).toHaveBeenCalledWith(registro.canvases[0]);
  });

  it('vuelve a codificar siempre, aunque la foto ya sea chica y JPEG (así se va el EXIF)', async () => {
    const { deps, registro } = entorno({ ancho: 800, alto: 600 });
    const r = await F.comprimirImagen(jpg({ size: 90 * 1024 }), deps);
    expect(registro.calidades).toHaveLength(1);
    expect(r).toMatchObject({ ancho: 800, alto: 600 });
  });

  it('una PNG con transparencia se dibuja sobre fondo blanco', async () => {
    const { deps, registro } = entorno({ ancho: 100, alto: 100 });
    await F.comprimirImagen({ name: 'logo.png', type: 'image/png', size: 5000 }, deps);
    const i = registro.orden.findIndex((x) => x.startsWith('fillRect'));
    const d = registro.orden.findIndex((x) => x.startsWith('drawImage'));
    expect(registro.orden).toContain('fillStyle:#ffffff');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(d);
  });

  it('si el JPEG pasa de 8 MB baja la calidad por pasos hasta que cabe', async () => {
    const { deps, registro } = entorno({ bytesPorCalidad: (c) => c * 10 * MB });
    const r = await F.comprimirImagen(jpg(), deps);
    expect(registro.calidades.map((c) => c[1])).toEqual([0.85, 0.75]);
    expect(r.blob.size).toBeLessThanOrEqual(8 * MB);
  });

  it('si no cabe ni con la calidad más baja, rechaza con limite', async () => {
    const { deps } = entorno({ bytesPorCalidad: () => 20 * MB });
    const e = await F.comprimirImagen(jpg(), deps).catch((x) => x);
    expect(e.codigo).toBe('limite');
    expect(e.amable).toMatch(/pesa/i);
  });

  it('un archivo que no es imagen rechaza con invalido y un mensaje amable', async () => {
    const { deps } = entorno();
    const e = await F.comprimirImagen({ name: 'lista.pdf', type: 'application/pdf', size: 100 }, deps).catch((x) => x);
    expect(e.codigo).toBe('invalido');
    expect(e.amable).toMatch(/foto/i);
    expect(deps.createImageBitmap).not.toHaveBeenCalled();
  });

  it('si createImageBitmap falla usa <img> y, si también falla, rechaza', async () => {
    const a = entorno({ bitmapFalla: true });
    const r = await F.comprimirImagen(jpg(), a.deps);
    expect(a.deps.cargarImagen).toHaveBeenCalled();
    expect(r.mime).toBe('image/jpeg');
    const b = entorno({ bitmapFalla: true, imagenFalla: true });
    const e = await F.comprimirImagen(jpg(), b.deps).catch((x) => x);
    expect(e.codigo).toBe('invalido');
    expect(e.amable).toMatch(/No pude leer/);
  });
});

describe('blobABase64 y codificar', () => {
  it('el base64 no trae el prefijo data:', async () => {
    const { deps } = entorno();
    expect(await F.blobABase64({ size: 3, type: 'image/jpeg' }, deps)).toBe('QUJD');
    const p = await F.codificar(jpg(), deps);
    expect(p.base64).toBe('QUJD');
    expect(p.mime).toBe('image/jpeg');
    expect(p.nombre).toBe('IMG_0001.jpg');
  });
});

describe('subirFotos', () => {
  const archivos = (n) => Array.from({ length: n }, (_, i) => jpg({ name: `f${i}.jpg` }));

  it('el progreso de cada foto pasa por sus estados en orden', async () => {
    const eventos = [];
    const r = await F.subirFotos(archivos(1), {
      destino: 'producto',
      comprimir: async () => ({ nombre: 'f0.jpg', mime: 'image/jpeg', base64: 'QUJD' }),
      subir: async () => ({ id: 'fx_1', nombre: 'f0.jpg', miniatura: 'data:x' }),
      onProgreso: (i, estado) => eventos.push([i, estado]),
    });
    expect(eventos).toEqual([[0, 'en_espera'], [0, 'comprimiendo'], [0, 'subiendo'], [0, 'listo']]);
    expect(r[0]).toMatchObject({ estado: 'listo', foto: { id: 'fx_1' } });
  });

  it('una foto que falla no detiene a las otras y deja su error', async () => {
    const r = await F.subirFotos(archivos(3), {
      destino: 'producto',
      comprimir: async (a) => {
        if (a.name === 'f1.jpg') throw Object.assign(new Error('x'), { codigo: 'invalido', amable: 'No pude leer esa foto.' });
        return { nombre: a.name, mime: 'image/jpeg', base64: 'QUJD' };
      },
      subir: async (p) => ({ id: 'fx_' + p.nombre, nombre: p.nombre, miniatura: 'data:x' }),
    });
    expect(r.map((x) => x.estado)).toEqual(['listo', 'error', 'listo']);
    expect(r[1].error).toBe('No pude leer esa foto.');
  });

  it('un error del servidor (limite) queda en esa foto con su mensaje amable', async () => {
    const r = await F.subirFotos(archivos(1), {
      destino: 'producto',
      comprimir: async () => ({ nombre: 'a.jpg', mime: 'image/jpeg', base64: 'QUJD' }),
      subir: async () => { throw Object.assign(new Error('limite: x'), { codigo: 'limite', amable: 'Pasaste el límite.' }); },
    });
    expect(r[0]).toMatchObject({ estado: 'error', error: 'Pasaste el límite.' });
  });

  it('con concurrencia 2 nunca hay más de 2 fotos en proceso a la vez', async () => {
    let activas = 0;
    let maximo = 0;
    const pausa = () => new Promise((r) => setTimeout(r, 1));
    await F.subirFotos(archivos(6), {
      destino: 'producto',
      concurrencia: 2,
      comprimir: async (a) => {
        activas++;
        maximo = Math.max(maximo, activas);
        await pausa();
        return { nombre: a.name, mime: 'image/jpeg', base64: 'QUJD' };
      },
      subir: async (p) => {
        await pausa();
        activas--;
        return { id: p.nombre, nombre: p.nombre, miniatura: 'data:x' };
      },
    });
    expect(maximo).toBe(2);
  });

  it('manda el destino y la temporada con cada foto', async () => {
    const subir = vi.fn(async (p) => ({ id: 'fx', nombre: p.nombre, miniatura: 'data:x' }));
    await F.subirFotos(archivos(1), {
      destino: 'temporada',
      temporada_id: 'tem_1',
      comprimir: async () => ({ nombre: 'a.jpg', mime: 'image/jpeg', base64: 'QUJD' }),
      subir,
    });
    expect(subir).toHaveBeenCalledWith({ nombre: 'a.jpg', mime: 'image/jpeg', base64: 'QUJD', destino: 'temporada', temporada_id: 'tem_1' });
  });
});

describe('crearMiniaturas', () => {
  const ticks = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it('tres pedidos iguales en el mismo instante hacen una sola llamada', async () => {
    const pedir = vi.fn(async (ids) => Object.fromEntries(ids.map((i) => [i, `data:${i}`])));
    const m = Panel.crearMiniaturas({ pedir });
    expect(m.src('a')).toBe('');
    m.src('a');
    m.src('a');
    await ticks();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(['a']);
    expect(m.src('a')).toBe('data:a');
  });

  it('85 ids salen en lotes de 40, 40 y 5', async () => {
    const pedir = vi.fn(async (ids) => Object.fromEntries(ids.map((i) => [i, `data:${i}`])));
    const m = Panel.crearMiniaturas({ pedir });
    m.pedir(Array.from({ length: 85 }, (_, i) => `id${i}`));
    await ticks();
    expect(pedir.mock.calls.map((c) => c[0].length)).toEqual([40, 40, 5]);
  });

  it('no vuelve a pedir lo que ya tiene ni lo que está en camino', async () => {
    const pedir = vi.fn(async (ids) => Object.fromEntries(ids.map((i) => [i, `data:${i}`])));
    const m = Panel.crearMiniaturas({ pedir });
    m.pedir(['a', 'b']);
    await ticks();
    m.pedir(['a', 'b', 'c']);
    m.pedir(['c']);
    await ticks();
    expect(pedir.mock.calls.map((c) => c[0])).toEqual([['a', 'b'], ['c']]);
  });

  it('agregar(id, url) guarda una miniatura que ya se tiene (por ejemplo, la de una foto recién subida)', async () => {
    const pedir = vi.fn(async () => ({}));
    const m = Panel.crearMiniaturas({ pedir });
    m.agregar('nueva', 'data:nueva');
    expect(m.src('nueva')).toBe('data:nueva');
    await ticks();
    expect(pedir).not.toHaveBeenCalled();
  });

  it('una falla del lote no deja ids pidiéndose para siempre: se pueden reintentar', async () => {
    let falla = true;
    const pedir = vi.fn(async (ids) => {
      if (falla) throw new Error('red');
      return Object.fromEntries(ids.map((i) => [i, `data:${i}`]));
    });
    const m = Panel.crearMiniaturas({ pedir });
    m.src('a');
    await ticks();
    expect(m.src('a')).toBe('');
    expect(pedir).toHaveBeenCalledTimes(1);
    m.src('a'); // sin reintento automático en cada pintado
    await ticks();
    expect(pedir).toHaveBeenCalledTimes(1);
    falla = false;
    m.reintentar();
    m.src('a');
    await ticks();
    expect(m.src('a')).toBe('data:a');
  });
});
