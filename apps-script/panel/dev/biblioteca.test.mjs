import { describe, it, expect, vi } from 'vitest';
import { crearGasFalso } from './gas-falso.mjs';
import { cargarParcial } from './cargar-parcial.mjs';

const MODULOS = ['ui/js/util', 'ui/js/servidor', 'ui/js/fotos', 'ui/js/biblioteca'];

function montar(opciones = {}, gas = crearGasFalso()) {
  const { Panel } = cargarParcial(MODULOS);
  const miniaturas = { pedir: vi.fn(), agregar: vi.fn() };
  const servidor = {
    llamar: (n, ...a) =>
      gas.llamar(n, a).catch((e) => {
        const x = Panel.servidor.analizarError(e);
        throw Object.assign(new Error(x.crudo), { codigo: x.codigo, amable: Panel.servidor.mensajeAmable(x.codigo, x.detalle) });
      }),
  };
  const subirFotos = vi.fn(async (archivos, o) => {
    const r = [];
    for (let i = 0; i < archivos.length; i++) {
      o.onProgreso(i, 'en_espera');
      o.onProgreso(i, 'comprimiendo');
      o.onProgreso(i, 'subiendo');
      if (archivos[i].falla) {
        o.onProgreso(i, 'error', 'No pude leer esa foto.');
        r.push({ archivo: archivos[i], estado: 'error', error: 'No pude leer esa foto.' });
      } else {
        const foto = { id: `fx_nuevo${i}`, nombre: archivos[i].name, miniatura: 'data:x' };
        o.onProgreso(i, 'listo', foto);
        r.push({ archivo: archivos[i], estado: 'listo', foto });
      }
    }
    return r;
  });
  const b = Panel.crearBiblioteca({ servidor, miniaturas, subirFotos }, opciones);
  return { b, gas, miniaturas, subirFotos };
}

describe('biblioteca de fotos', () => {
  it('cargar trae la primera página, el total y pide las miniaturas', async () => {
    const { b, miniaturas } = montar();
    await b.cargar();
    expect(b.fotos.length).toBeGreaterThan(0);
    expect(b.total).toBeGreaterThanOrEqual(b.fotos.length);
    expect(b.cargando).toBe(false);
    expect(miniaturas.pedir).toHaveBeenCalledWith(b.fotos.map((f) => f.id));
  });

  it('elegir una carpeta recarga solo esa carpeta', async () => {
    const { b } = montar();
    await b.elegirCarpeta('portadas');
    expect(b.carpeta).toBe('portadas');
    expect(b.fotos.length).toBeGreaterThan(0);
    expect(b.fotos.every((f) => f.carpeta === 'portadas')).toBe(true);
  });

  it('masFotos agrega la página siguiente sin repetir', async () => {
    const gas = crearGasFalso();
    // más fotos que una página (24)
    for (let i = 0; i < 30; i++) {
      gas.db.fotos[`fx_extra${i}`] = { id: `fx_extra${i}`, nombre: `e${i}.jpg`, carpeta: 'fotos', actualizado: '2026-11-21T10:00:00-05:00', subida: true, buffer: null };
    }
    const { b } = montar({}, gas);
    await b.cargar();
    expect(b.hayMas).toBe(true);
    const antes = b.fotos.length;
    await b.masFotos();
    expect(b.fotos.length).toBeGreaterThan(antes);
    expect(new Set(b.fotos.map((f) => f.id)).size).toBe(b.fotos.length);
  });

  it('en modo elegir con una sola foto, alternar reemplaza la selección', async () => {
    const { b } = montar({ modo: 'elegir', multiple: false });
    b.alternar('a');
    b.alternar('b');
    expect(b.seleccion).toEqual(['b']);
  });

  it('en modo elegir con varias, alternar agrega y quita', async () => {
    const { b } = montar({ modo: 'elegir', multiple: true });
    b.alternar('a');
    b.alternar('b');
    b.alternar('a');
    expect(b.seleccion).toEqual(['b']);
    expect(b.elegida('b')).toBe(true);
    expect(b.elegida('a')).toBe(false);
  });

  it('las fotos ya usadas se pueden excluir de la selección', async () => {
    const { b } = montar({ modo: 'elegir', multiple: true, excluir: ['fx_00000001'] });
    b.alternar('fx_00000001');
    expect(b.seleccion).toEqual([]);
    expect(b.deshabilitada('fx_00000001')).toBe(true);
  });

  it('subir agrega las fotos nuevas arriba, guarda su miniatura y, en modo elegir, las deja elegidas', async () => {
    const { b, miniaturas, subirFotos } = montar({ modo: 'elegir', multiple: true, destino: 'temporada', temporada_id: 'tem_1' });
    await b.cargar();
    const r = await b.subir([{ name: 'a.jpg', type: 'image/jpeg' }, { name: 'b.jpg', type: 'image/jpeg' }]);
    expect(r.map((x) => x.estado)).toEqual(['listo', 'listo']);
    expect(b.fotos[0].id).toBe('fx_nuevo1');
    expect(b.fotos[1].id).toBe('fx_nuevo0');
    expect(b.seleccion).toEqual(['fx_nuevo0', 'fx_nuevo1']);
    expect(miniaturas.agregar).toHaveBeenCalledWith('fx_nuevo0', 'data:x');
    expect(subirFotos.mock.calls[0][1]).toMatchObject({ destino: 'temporada', temporada_id: 'tem_1' });
  });

  it('subir muestra el avance de cada foto y deja el error de la que falló', async () => {
    const { b } = montar();
    await b.subir([{ name: 'a.jpg', type: 'image/jpeg' }, { name: 'mala.jpg', type: 'image/jpeg', falla: true }]);
    expect(b.subidas.map((s) => s.estado)).toEqual(['listo', 'error']);
    expect(b.subidas[0]).toMatchObject({ nombre: 'a.jpg', pct: 100, texto: 'Lista' });
    expect(b.subidas[1]).toMatchObject({ pct: 100, texto: 'No pude leer esa foto.' });
    expect(b.errores).toBe(1);
  });

  it('ignora lo que no es imagen y lo avisa', async () => {
    const { b, subirFotos } = montar();
    await b.subir([{ name: 'lista.pdf', type: 'application/pdf' }]);
    expect(subirFotos).not.toHaveBeenCalled();
    expect(b.aviso).toMatch(/solo fotos/i);
  });

  it('en la biblioteca, la carpeta elegida decide el destino de lo que se sube', async () => {
    const { b, subirFotos } = montar();
    await b.elegirCarpeta('marca');
    await b.subir([{ name: 'logo.png', type: 'image/png' }]);
    expect(subirFotos.mock.calls[0][1].destino).toBe('marca');
  });

  it('usosTexto dice dónde se usa o que está sin usar', () => {
    const { b } = montar();
    expect(b.usosTexto({ usos: [{ etiqueta: 'VES-001' }, { etiqueta: 'Verano 2027' }] })).toBe('Usada en VES-001, Verano 2027');
    expect(b.usosTexto({ usos: [] })).toBe('Sin usar');
    expect(b.usosTexto({ usos: Array.from({ length: 6 }, (_, i) => ({ etiqueta: `P${i}` })) })).toBe('Usada en P0, P1, P2 y 3 más');
  });

  it('una falla del servidor deja un mensaje y no se queda cargando', async () => {
    const gas = crearGasFalso();
    gas.simular.falla('biblioteca', 'limite', 1);
    const { b } = montar({}, gas);
    await b.cargar();
    expect(b.cargando).toBe(false);
    expect(b.error).toBeTruthy();
  });
});
