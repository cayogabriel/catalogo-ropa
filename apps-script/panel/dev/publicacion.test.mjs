import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearGasFalso } from './gas-falso.mjs';
import { montarStores, asentar } from './ayudas-estado.mjs';

const DURACIONES = { cola: 1000, publicando: 2000, documentos: 1000 };

async function listo(opciones = {}) {
  const gas = opciones.gas ?? crearGasFalso({ duraciones: DURACIONES });
  const m = montarStores({ ...opciones, gas });
  m.stores.datos.init();
  m.stores.panel.init();
  m.stores.publicacion.init?.();
  await m.stores.panel.iniciar();
  await gas.llamar('guardarTokenGithub', ['x']);
  return m;
}
const avanzar = async (ms) => {
  await vi.advanceTimersByTimeAsync(ms);
  await asentar();
};

describe('publicación', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('el botón recorre Publicar → En cola → Publicando → Publicado → Documentos guardados en Drive', async () => {
    const m = await listo();
    const p = m.stores.publicacion;
    expect(p.etiquetaBoton).toBe('Publicar');
    const prom = p.publicar();
    await asentar();
    expect(p.etiquetaBoton).toBe('En cola…');
    expect(p.enCurso).toBe(true);
    await prom;
    await avanzar(1000);
    expect(p.etiquetaBoton).toBe('Publicando…');
    await avanzar(2000);
    expect(p.etiquetaBoton).toBe('Publicado');
    await avanzar(1000);
    expect(p.etiquetaBoton).toBe('Documentos guardados en Drive');
    expect(p.enCurso).toBe(false);
    const n = m.llamadas.filter((x) => x === 'estadoPublicacion').length;
    await avanzar(10000);
    expect(m.llamadas.filter((x) => x === 'estadoPublicacion').length).toBe(n); // dejó de consultar
  });

  it('antes de publicar se guardan los cambios pendientes del autoguardado', async () => {
    const m = await listo();
    const f = (await m.stores.datos.cargar('productos'))[0];
    m.stores.datos.guardar('productos', f, 'nombre', 'Antes de publicar');
    await m.stores.publicacion.publicar();
    const i = m.llamadas.lastIndexOf('guardarCampo');
    expect(i).toBeGreaterThan(-1);
    expect(m.llamadas.indexOf('publicar')).toBeGreaterThan(i);
    expect(m.gas.db.filas.productos.find((x) => x.id === f.id).nombre).toBe('Antes de publicar');
  });

  it('si algo no se pudo guardar, no publica y avisa', async () => {
    const m = await listo();
    const f = (await m.stores.datos.cargar('productos')).find((x) => x.estado === 'borrador' && !x.fotos.length);
    m.stores.datos.guardar('productos', f, 'estado', 'publicado'); // el servidor lo rechaza
    await m.stores.publicacion.publicar();
    expect(m.llamadas).not.toContain('publicar');
    expect(m.stores.toasts.lista.some((t) => /no se pudo guardar/i.test(t.texto))).toBe(true);
    expect(m.stores.publicacion.enCurso).toBe(false);
  });

  it('al aceptarse la publicación se limpian los cambios sin publicar; una edición nueva los vuelve a marcar', async () => {
    const m = await listo();
    const f = (await m.stores.datos.cargar('productos'))[0];
    m.stores.datos.guardar('productos', f, 'stock', 3);
    await vi.advanceTimersByTimeAsync(700);
    expect(m.stores.panel.cambiosSinPublicar).toBe(true);
    await m.stores.publicacion.publicar();
    expect(m.stores.panel.cambiosSinPublicar).toBe(false);
    m.stores.datos.guardar('productos', f, 'stock', 4);
    await vi.advanceTimersByTimeAsync(700);
    expect(m.stores.panel.cambiosSinPublicar).toBe(true);
  });

  it('publicar espera a las operaciones sueltas (por ejemplo, un reorden) antes de enviar', async () => {
    const m = await listo();
    const filas = await m.stores.datos.cargar('secciones');
    m.stores.datos.reordenar('secciones', filas.map((s) => s.id).reverse()); // sin esperar
    await m.stores.publicacion.publicar();
    expect(m.llamadas.indexOf('publicar')).toBeGreaterThan(m.llamadas.lastIndexOf('reordenar'));
  });

  it('una edición hecha mientras viaja publicar() deja marcados los cambios sin publicar', async () => {
    const m = await listo();
    const f = (await m.stores.datos.cargar('productos'))[0];
    const orig = m.gas.llamar.bind(m.gas);
    m.gas.llamar = async (n, a) => {
      if (n === 'publicar') m.stores.datos.guardar('productos', f, 'stock', 7); // la dueña sigue editando
      return orig(n, a);
    };
    await m.stores.publicacion.publicar();
    expect(m.stores.panel.cambiosSinPublicar).toBe(true);
  });

  it('sin token: deja un aviso con enlace a Configuración', async () => {
    const m = await listo({ gas: crearGasFalso({ duraciones: DURACIONES }) });
    m.gas.db.tokenGithub = null;
    await m.stores.publicacion.publicar();
    const p = m.stores.publicacion;
    expect(p.error.codigo).toBe('sin_token');
    expect(p.error.mensaje).toMatch(/GitHub/);
    expect(p.error.enlace).toBe('configuracion');
    expect(p.enCurso).toBe(false);
  });

  it('tienda sin nombre: aviso con enlace a Configuración', async () => {
    const m = await listo();
    m.gas.db.config.tienda_nombre = '';
    await m.stores.publicacion.publicar();
    expect(m.stores.publicacion.error.enlace).toBe('configuracion');
    expect(m.stores.publicacion.error.mensaje).toMatch(/nombre/i);
  });

  it('una publicación que termina en error muestra el mensaje y el enlace al detalle, y deja los cambios marcados', async () => {
    const gas = crearGasFalso({ duraciones: DURACIONES });
    gas.simular.publicacionFalla(true);
    const m = await listo({ gas });
    await m.stores.publicacion.publicar();
    await avanzar(3500);
    const p = m.stores.publicacion;
    expect(p.estado.estado).toBe('error');
    expect(p.etiquetaBoton).toBe('Publicar');
    expect(p.textoEstado).toMatch(/no se pudo publicar/i);
    expect(p.estado.url_ejecucion).toMatch(/^https:\/\//);
    expect(m.stores.panel.cambiosSinPublicar).toBe(true);
    expect(p.enCurso).toBe(false);
  });

  it('con la pestaña oculta pausa las consultas; al volver consulta de inmediato', async () => {
    const m = await listo();
    await m.stores.publicacion.publicar();
    m.estado.visible = false;
    const antes = m.llamadas.filter((x) => x === 'estadoPublicacion').length;
    await avanzar(3000);
    expect(m.llamadas.filter((x) => x === 'estadoPublicacion').length).toBe(antes);
    m.estado.visible = true;
    await m.stores.publicacion.alVolver();
    expect(m.llamadas.filter((x) => x === 'estadoPublicacion').length).toBe(antes + 1);
  });

  it('si el arranque dice que ya hay una publicación en curso, sigue consultándola', async () => {
    const gas = crearGasFalso({ duraciones: DURACIONES });
    await gas.llamar('guardarTokenGithub', ['x']);
    await gas.llamar('publicar', []);
    const m = montarStores({ gas });
    m.stores.datos.init();
    m.stores.panel.init();
    await m.stores.panel.iniciar();
    expect(m.stores.publicacion.enCurso).toBe(true);
    await avanzar(4500);
    expect(m.stores.publicacion.estado.estado).toBe('publicado');
  });

  it('textoEstado cuenta lo que pasó, sin cifras inventadas', async () => {
    const m = await listo();
    expect(m.stores.publicacion.textoEstado).toMatch(/^Publicado/);
    const gas = crearGasFalso({ duraciones: DURACIONES });
    const m2 = montarStores({ gas });
    m2.stores.publicacion.estado = { estado: 'nunca' };
    expect(m2.stores.publicacion.textoEstado).toMatch(/Aún no has publicado/);
  });
});
