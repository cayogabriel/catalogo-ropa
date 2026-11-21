import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearGasFalso } from './gas-falso.mjs';
import { montarStores, asentar } from './ayudas-estado.mjs';

async function listo(opciones) {
  const m = montarStores(opciones);
  m.stores.datos.init();
  m.stores.panel.init();
  await m.stores.panel.iniciar();
  return m;
}
const avanzar = async (ms) => {
  await vi.advanceTimersByTimeAsync(ms);
  await asentar();
};
const servidorDe = (m, entidad, id) => m.gas.db.filas[entidad].find((f) => f.id === id);

describe('panel.iniciar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('carga usuario, configuración, textos y el estado de publicación', async () => {
    const m = await listo();
    const p = m.stores.panel;
    expect(p.cargando).toBe(false);
    expect(p.falla).toBeNull();
    expect(p.usuario).toMatch(/@/);
    expect(p.config.moneda_simbolo).toBe('S/');
    expect(p.textos['tienda.eslogan']).toBeTruthy();
    expect(m.stores.publicacion.estado.estado).toBe('publicado');
    expect(p.cambiosSinPublicar).toBe(false);
  });

  it('no_autorizado → falla «no_autorizado»', async () => {
    const gas = crearGasFalso();
    gas.simular.falla('obtenerEstadoInicial', 'no_autorizado', 1);
    const m = await listo({ gas });
    expect(m.stores.panel.falla).toBe('no_autorizado');
  });

  it('falta la hoja → falla «no_instalado»; instalar() lo arregla', async () => {
    const gas = crearGasFalso({ instalada: false });
    const m = await listo({ gas });
    expect(m.stores.panel.falla).toBe('no_instalado');
    await m.stores.panel.instalar();
    expect(m.stores.panel.falla).toBeNull();
    expect(m.stores.panel.config.tienda_nombre).toBeTruthy();
  });

  it('irA cambia la ruta, ignora rutas desconocidas y guarda el hash', async () => {
    const m = await listo();
    m.stores.panel.irA('productos');
    expect(m.stores.panel.ruta).toBe('productos');
    expect(m.estado.hash).toBe('productos');
    m.stores.panel.irA('inventada');
    expect(m.stores.panel.ruta).toBe('productos');
  });
});

describe('datos: autoguardado', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cargar trae la lista (con archivados en productos) y guardar usa la versión correcta', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const filas = await d.cargar('productos');
    expect(filas.some((f) => f.estado === 'archivado')).toBe(true);
    const f = filas.find((x) => x.id === 'prd_00000001');
    d.guardar('productos', f, 'nombre', 'Vestido nuevo');
    expect(f.nombre).toBe('Vestido nuevo');
    expect(servidorDe(m, 'productos', f.id).nombre).not.toBe('Vestido nuevo');
    await avanzar(700);
    expect(servidorDe(m, 'productos', f.id).nombre).toBe('Vestido nuevo');
    expect(f.version).toBe(servidorDe(m, 'productos', f.id).version);
    expect(m.stores.panel.guardado.estado).toBe('guardado');
    expect(m.stores.panel.cambiosSinPublicar).toBe(true);
  });

  it('un valor que no pasa la validación local no se envía y devuelve false', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const f = (await d.cargar('productos')).find((x) => x.id === 'prd_00000001');
    const antes = f.precio_regular;
    expect(d.guardar('productos', f, 'precio_regular', 0)).toBe(false);
    await avanzar(1000);
    expect(servidorDe(m, 'productos', f.id).precio_regular).toBe(antes);
    expect(m.llamadas).not.toContain('guardarCampo');
  });

  it('conflicto: recarga la fila con lo que hay en la hoja y avisa', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const f = (await d.cargar('productos')).find((x) => x.id === 'prd_00000002');
    // «otra pestaña» cambia la misma fila
    await m.gas.llamar('guardarCampo', ['productos', f.id, 'nombre', 'Hecho en otra pestaña', f.version]);
    d.guardar('productos', f, 'nombre', 'Mi cambio');
    await avanzar(700);
    expect(f.nombre).toBe('Hecho en otra pestaña');
    expect(f.version).toBe(servidorDe(m, 'productos', f.id).version);
    const aviso = m.stores.toasts.lista.at(-1);
    expect(aviso.tipo).toBe('aviso');
    expect(aviso.texto).toMatch(/otra pestaña/i);
    // y se puede seguir editando
    d.guardar('productos', f, 'nombre', 'Mi cambio 2');
    await avanzar(700);
    expect(servidorDe(m, 'productos', f.id).nombre).toBe('Mi cambio 2');
  });

  it('rechazo del servidor: avisa con el motivo y devuelve el campo a su valor guardado', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const f = (await d.cargar('productos')).find((x) => x.estado === 'borrador' && x.fotos.length === 0);
    d.guardar('productos', f, 'estado', 'publicado');
    await avanzar(700);
    expect(f.estado).toBe('borrador');
    const aviso = m.stores.toasts.lista.at(-1);
    expect(aviso.tipo).toBe('error');
    expect(aviso.texto).toMatch(/para publicar falta/i);
  });

  it('eliminar un producto lo archiva y ofrece «Deshacer»', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const f = (await d.cargar('productos')).find((x) => x.id === 'prd_00000003');
    await d.eliminar('productos', f, { mensaje: 'Archivé la prenda.' });
    expect(f.estado).toBe('archivado');
    const aviso = m.stores.toasts.lista.at(-1);
    expect(aviso.texto).toBe('Archivé la prenda.');
    expect(aviso.accion.texto).toBe('Deshacer');
    await aviso.accion.fn();
    expect(f.estado).not.toBe('archivado');
    expect(servidorDe(m, 'productos', f.id).estado).not.toBe('archivado');
  });

  it('eliminar otra entidad la quita de la lista, y Deshacer la devuelve', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const [o] = await d.cargar('ofertas');
    await d.eliminar('ofertas', o, { mensaje: 'Borré la oferta.' });
    expect(d.listas.ofertas.some((x) => x.id === o.id)).toBe(false);
    await m.stores.toasts.lista.at(-1).accion.fn();
    expect(d.listas.ofertas.some((x) => x.id === o.id)).toBe(true);
  });

  it('reordenar cambia la lista y el orden en la hoja', async () => {
    const m = await listo();
    const d = m.stores.datos;
    const filas = await d.cargar('secciones');
    const ids = filas.map((s) => s.id).reverse();
    await d.reordenar('secciones', ids);
    expect(d.listas.secciones.map((s) => s.id)).toEqual(ids);
    const servidor = [...m.gas.db.filas.secciones].sort((a, b) => a.orden - b.orden).map((s) => s.id);
    expect(servidor).toEqual(ids);
  });

  it('crear agrega la fila a la lista y la deja lista para editar', async () => {
    const m = await listo();
    const d = m.stores.datos;
    await d.cargar('ofertas');
    const nueva = await d.crear('ofertas', { nombre: 'Prueba' });
    expect(d.listas.ofertas.at(-1).id).toBe(nueva.id);
    d.guardar('ofertas', nueva, 'valor', 15);
    await avanzar(700);
    expect(servidorDe(m, 'ofertas', nueva.id).valor).toBe(15);
  });

  it('duplicarProducto agrega el borrador a la lista', async () => {
    const m = await listo();
    const d = m.stores.datos;
    await d.cargar('productos');
    const n = await d.duplicarProducto('prd_00000001');
    expect(d.listas.productos.some((x) => x.id === n.id)).toBe(true);
    expect(n.estado).toBe('borrador');
  });
});

describe('panel: textos y configuración', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('guardarTexto y guardarConfig llegan al servidor', async () => {
    const m = await listo();
    const p = m.stores.panel;
    p.guardarTexto('tienda.eslogan', 'Ropa elegida con calma');
    p.guardarConfig('horario', 'Lunes a viernes');
    await avanzar(700);
    expect(m.gas.db.textos['tienda.eslogan']).toBe('Ropa elegida con calma');
    expect(m.gas.db.config.horario).toBe('Lunes a viernes');
    expect(p.textos['tienda.eslogan']).toBe('Ropa elegida con calma');
  });

  it('un ajuste inválido no se envía y deja su mensaje', async () => {
    const m = await listo();
    const p = m.stores.panel;
    p.guardarConfig('umbral_ultimas_unidades', 'abc');
    await avanzar(1000);
    expect(m.gas.db.config.umbral_ultimas_unidades).toBe('3');
    expect(p.erroresConfig.umbral_ultimas_unidades).toBeTruthy();
    p.guardarConfig('umbral_ultimas_unidades', '5');
    expect(p.erroresConfig.umbral_ultimas_unidades).toBeFalsy();
  });

  it('el token de GitHub: se envía, no se guarda en ningún estado y se vacía el campo', async () => {
    const m = await listo();
    const p = m.stores.panel;
    const r = await p.guardarToken('ghp_secreto_de_prueba');
    expect(r.ok).toBe(true);
    expect(p.token.configurado).toBe(true);
    expect(JSON.stringify({ p, d: m.stores.datos, pub: m.stores.publicacion, t: m.stores.toasts })).not.toContain('ghp_secreto');
  });
});

describe('sin permiso durante el autoguardado', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('pasa a la pantalla «no_autorizado» y no sigue enviando', async () => {
    const m = await listo();
    const f = (await m.stores.datos.cargar('productos'))[0];
    m.gas.simular.falla('guardarCampo', 'no_autorizado', 1);
    m.stores.datos.guardar('productos', f, 'nombre', 'X');
    await avanzar(700);
    expect(m.stores.panel.falla).toBe('no_autorizado');
  });
});
