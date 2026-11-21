import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial(['ui/js/util', 'ui/js/cola']);

const falla = (codigo, detalle = 'x') => Object.assign(new Error(`${codigo}: ${detalle}`), { codigo, detalle });
const red = () => Object.assign(new Error('Failed to fetch'), { codigo: 'desconocido' });

// Servidor de mentira: lleva la versión de cada fila y deja pasar o falla según `guiones`.
function montar(opciones = {}) {
  const versiones = { 'productos:p1': 1, 'productos:p2': 1 };
  const llamadas = [];
  const guiones = []; // cada elemento: undefined (ok) o un Error
  const eventos = { estados: [], guardados: [], conflictos: [], rechazos: [], noAutorizado: 0 };
  let enVuelo = 0;
  let maxEnVuelo = 0;
  const ejecutar = async (lote) => {
    llamadas.push(JSON.parse(JSON.stringify(lote)));
    enVuelo++;
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await Promise.resolve();
    enVuelo--;
    const g = guiones.shift();
    if (g) throw g;
    const clave = `${lote.entidad}:${lote.id}`;
    if (lote.version !== undefined && lote.version !== versiones[clave]) throw falla('conflicto', 'versión vieja');
    if (lote.version !== undefined) versiones[clave] += 1;
    return { fila: { id: lote.id, ...lote.cambios, version: versiones[clave] }, version: versiones[clave] };
  };
  const cola = Panel.crearCola({
    ejecutar,
    onEstado: (e) => eventos.estados.push(e),
    onGuardado: (g) => eventos.guardados.push(g),
    onConflicto: (c) => eventos.conflictos.push(c),
    onRechazo: (r) => eventos.rechazos.push(r),
    onNoAutorizado: () => eventos.noAutorizado++,
    ...opciones,
  });
  cola.registrarVersion('productos', 'p1', 1);
  cola.registrarVersion('productos', 'p2', 1);
  return { cola, llamadas, guiones, eventos, versiones, maxEnVuelo: () => maxEnVuelo };
}

const cambio = (campo, valor, id = 'p1') => ({ entidad: 'productos', id, campo, valor });
const asentar = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('crearCola', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cinco cambios del mismo campo en 300 ms producen una sola llamada con el último valor', async () => {
    const { cola, llamadas } = montar();
    for (const v of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      cola.encolar(cambio('nombre', v));
      vi.advanceTimersByTime(60);
    }
    vi.advanceTimersByTime(539);
    await asentar();
    expect(llamadas).toHaveLength(0);
    vi.advanceTimersByTime(1);
    await asentar();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ entidad: 'productos', id: 'p1', cambios: { nombre: 'abcde' }, version: 1 });
  });

  it('dos campos de la misma fila viajan juntos en una sola llamada', async () => {
    const { cola, llamadas } = montar();
    cola.encolar(cambio('nombre', 'N'));
    cola.encolar(cambio('stock', 4));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].cambios).toEqual({ nombre: 'N', stock: 4 });
  });

  it('filas distintas se guardan por separado', async () => {
    const { cola, llamadas } = montar();
    cola.encolar(cambio('nombre', 'A', 'p1'));
    cola.encolar(cambio('nombre', 'B', 'p2'));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(llamadas.map((l) => l.id).sort()).toEqual(['p1', 'p2']);
  });

  it('dos guardados seguidos usan la versión 1 y luego la 2', async () => {
    const { cola, llamadas } = montar();
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    cola.encolar(cambio('nombre', 'B'));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(llamadas.map((l) => l.version)).toEqual([1, 2]);
  });

  it('una edición hecha con un guardado en vuelo espera y usa la versión nueva; nunca dos a la vez', async () => {
    const { cola, llamadas, maxEnVuelo } = montar();
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600); // sale la primera llamada (aún no resuelve)
    cola.encolar(cambio('stock', 9));
    vi.advanceTimersByTime(600); // vence el temporizador de la segunda mientras la primera sigue en vuelo
    await asentar();
    expect(llamadas).toHaveLength(2);
    expect(llamadas.map((l) => l.version)).toEqual([1, 2]);
    expect(maxEnVuelo()).toBe(1);
  });

  it('el estado pasa por pendiente → guardando → guardado, y no dice guardado con pendientes', async () => {
    const { cola, eventos } = montar();
    cola.encolar(cambio('nombre', 'A'));
    expect(cola.estado()).toBe('pendiente');
    vi.advanceTimersByTime(600);
    expect(cola.estado()).toBe('guardando');
    await asentar();
    expect(cola.estado()).toBe('guardado');
    expect(eventos.estados).toEqual(['pendiente', 'guardando', 'guardado']);
    cola.encolar(cambio('nombre', 'B'));
    expect(cola.estado()).toBe('pendiente');
  });

  it('onGuardado entrega la fila y los campos guardados', async () => {
    const { cola, eventos } = montar();
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(eventos.guardados[0]).toMatchObject({ entidad: 'productos', id: 'p1', version: 2, campos: ['nombre'] });
  });

  it('conflicto: descarta lo de esa fila y avisa una vez, sin reintentar', async () => {
    const { cola, llamadas, guiones, eventos } = montar();
    guiones.push(falla('conflicto'));
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    vi.advanceTimersByTime(60000);
    await asentar();
    expect(llamadas).toHaveLength(1);
    expect(eventos.conflictos).toEqual([{ entidad: 'productos', id: 'p1', perdidos: { nombre: 'A' } }]);
    expect(cola.pendientes()).toBe(0);
    expect(cola.estado()).not.toBe('error');
  });

  it('invalido y limite: avisan con los campos y el error, sin reintentos', async () => {
    const { cola, llamadas, guiones, eventos } = montar();
    guiones.push(falla('invalido', 'el precio debe ser mayor que 0'), falla('limite'));
    cola.encolar(cambio('precio_regular', 0));
    vi.advanceTimersByTime(600);
    await asentar();
    cola.encolar(cambio('nombre', 'x'));
    vi.advanceTimersByTime(600);
    await asentar();
    vi.advanceTimersByTime(60000);
    await asentar();
    expect(llamadas).toHaveLength(2);
    expect(eventos.rechazos).toHaveLength(2);
    expect(eventos.rechazos[0]).toMatchObject({ entidad: 'productos', id: 'p1', campos: ['precio_regular'] });
    expect(eventos.rechazos[0].error.codigo).toBe('invalido');
    expect(cola.pendientes()).toBe(0);
  });

  it('no_autorizado: avisa y se detiene todo', async () => {
    const { cola, llamadas, guiones, eventos } = montar();
    guiones.push(falla('no_autorizado'));
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(eventos.noAutorizado).toBe(1);
    cola.encolar(cambio('nombre', 'B'));
    vi.advanceTimersByTime(60000);
    await asentar();
    expect(llamadas).toHaveLength(1);
  });

  it('falla de red: reintenta a 1 s, 3 s y 8 s; si funciona se guarda una sola vez', async () => {
    const { cola, llamadas, guiones, eventos } = montar();
    guiones.push(red(), red());
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(cola.estado()).toBe('reintentando');
    vi.advanceTimersByTime(999);
    await asentar();
    expect(llamadas).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await asentar();
    expect(llamadas).toHaveLength(2);
    vi.advanceTimersByTime(3000);
    await asentar();
    expect(llamadas).toHaveLength(3);
    expect(cola.estado()).toBe('guardado');
    expect(eventos.guardados).toHaveLength(1);
    expect(eventos.estados).toContain('reintentando');
  });

  it('agota los reintentos: estado error, sigue pendiente; reintentarYa lo envía', async () => {
    const { cola, llamadas, guiones } = montar();
    guiones.push(red(), red(), red(), red());
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    for (const ms of [1000, 3000, 8000]) {
      vi.advanceTimersByTime(ms);
      await asentar();
    }
    expect(llamadas).toHaveLength(4);
    expect(cola.estado()).toBe('error');
    expect(cola.pendientes()).toBe(1);
    vi.advanceTimersByTime(60000);
    await asentar();
    expect(llamadas).toHaveLength(4);
    cola.reintentarYa();
    await asentar();
    expect(llamadas).toHaveLength(5);
    expect(cola.estado()).toBe('guardado');
    expect(cola.pendientes()).toBe(0);
  });

  it('una edición nueva durante el error se suma a lo pendiente (último valor gana)', async () => {
    const { cola, llamadas, guiones } = montar();
    guiones.push(red(), red(), red(), red());
    cola.encolar(cambio('nombre', 'A'));
    vi.advanceTimersByTime(600);
    await asentar();
    for (const ms of [1000, 3000, 8000]) {
      vi.advanceTimersByTime(ms);
      await asentar();
    }
    cola.encolar(cambio('nombre', 'B'));
    cola.encolar(cambio('stock', 2));
    vi.advanceTimersByTime(600);
    await asentar();
    expect(llamadas.at(-1).cambios).toEqual({ nombre: 'B', stock: 2 });
    expect(cola.estado()).toBe('guardado');
  });

  it('vaciar() envía todo ya, sin esperar el temporizador, y resuelve ok', async () => {
    const { cola, llamadas } = montar();
    cola.encolar(cambio('nombre', 'A', 'p1'));
    cola.encolar(cambio('nombre', 'B', 'p2'));
    const p = cola.vaciar();
    await asentar();
    const r = await p;
    expect(r).toEqual({ ok: true, errores: [] });
    expect(llamadas).toHaveLength(2);
    expect(cola.pendientes()).toBe(0);
  });

  it('vaciar() con una falla definitiva no se queda colgada y devuelve el error', async () => {
    const { cola, guiones } = montar();
    guiones.push(falla('invalido', 'mal'));
    cola.encolar(cambio('nombre', 'A'));
    const r = await cola.vaciar();
    expect(r.ok).toBe(false);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].codigo).toBe('invalido');
  });

  it('vaciar() espera a que termine un guardado en vuelo y los reintentos de red', async () => {
    const { cola, llamadas, guiones } = montar();
    guiones.push(red());
    cola.encolar(cambio('nombre', 'A'));
    const p = cola.vaciar();
    await asentar();
    vi.advanceTimersByTime(1000);
    const r = await p;
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(2);
  });

  it('sin pendientes, vaciar() resuelve enseguida', async () => {
    const { cola } = montar();
    expect(await cola.vaciar()).toEqual({ ok: true, errores: [] });
  });

  it('las entidades sin versión (textos, config) se envían sin version', async () => {
    const { cola, llamadas } = montar();
    cola.encolar({ entidad: 'config', id: 'horario', campo: 'valor', valor: 'L a S' });
    vi.advanceTimersByTime(600);
    await asentar();
    expect(llamadas[0]).toMatchObject({ entidad: 'config', id: 'horario', cambios: { valor: 'L a S' } });
    expect(llamadas[0].version).toBeUndefined();
  });
});
