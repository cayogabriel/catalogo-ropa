import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { revisarPaleta } from '../../../contratos/tokens.mjs';
import { crearGasFalso } from './gas-falso.mjs';

const CONTRATO = fileURLToPath(new URL('../../../docs/contracts/api-panel.md', import.meta.url));

function reloj(inicio = '2026-11-21T12:00:00-05:00') {
  let t = new Date(inicio).getTime();
  return { ahora: () => new Date(t), avanzar: (ms) => (t += ms) };
}

async function fallo(promesa) {
  try {
    await promesa;
  } catch (e) {
    return e.message;
  }
  return null;
}

// JPEG mínimo válido (SOI + APP0 + EOI) y otro con un bloque EXIF (APP1 «Exif»).
const JPEG_LIMPIO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
const JPEG_CON_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08]),
  Buffer.from('Exif\0\0'),
  Buffer.from([0xff, 0xd9]),
]);

describe('crearGasFalso: contrato', () => {
  it('conoce todas las funciones que lista docs/contracts/api-panel.md', async () => {
    const md = readFileSync(CONTRATO, 'utf8');
    const nombres = [...new Set([...md.matchAll(/^\| `([a-zA-Z]+)\(/gm)].map((m) => m[1]))];
    expect(nombres.length).toBeGreaterThanOrEqual(26);
    const gas = crearGasFalso();
    for (const nombre of nombres) {
      const msg = await fallo(gas.llamar(nombre, []));
      // Puede fallar por argumentos, pero nunca por «no existe la función».
      expect(msg ?? '', nombre).not.toMatch(/funci[oó]n desconocida/i);
    }
  });

  it('una función inexistente lanza no_encontrado', async () => {
    const gas = crearGasFalso();
    expect(await fallo(gas.llamar('inventada', []))).toMatch(/^no_encontrado:/);
  });
});

describe('crearGasFalso: edición', () => {
  let gas;
  beforeEach(() => {
    gas = crearGasFalso();
  });

  it('listar productos: sin archivados, con filtro y con incluir_archivados', async () => {
    const { filas, leido_en } = await gas.llamar('listar', ['productos']);
    expect(filas.length).toBeGreaterThanOrEqual(20);
    expect(filas.some((f) => f.estado === 'archivado')).toBe(false);
    expect(typeof leido_en).toBe('string');
    const borradores = await gas.llamar('listar', ['productos', { filtro: { estado: 'borrador' } }]);
    expect(borradores.filas.length).toBeGreaterThanOrEqual(2);
    expect(borradores.filas.every((f) => f.estado === 'borrador')).toBe(true);
    const todos = await gas.llamar('listar', ['productos', { incluir_archivados: true }]);
    expect(todos.filas.length).toBeGreaterThan(filas.length);
  });

  it('las filas llegan tipadas: listas como arreglos, fechas ISO o null, tokens como objeto', async () => {
    const { filas } = await gas.llamar('listar', ['productos']);
    const p = filas.find((f) => f.id === 'prd_00000001');
    expect(Array.isArray(p.tallas)).toBe(true);
    expect(Array.isArray(p.fotos)).toBe(true);
    expect(typeof p.fotos[0]).toBe('string');
    expect(typeof p.precio_regular).toBe('number');
    const pal = (await gas.llamar('listar', ['paletas'])).filas[0];
    expect(typeof pal.tokens).toBe('object');
    expect(Object.keys(pal.tokens)).toHaveLength(16);
  });

  it('guardarCampo sube la versión y devuelve la fila; con versión vieja lanza conflicto', async () => {
    const antes = (await gas.llamar('listar', ['productos'])).filas.find((f) => f.id === 'prd_00000001');
    const r = await gas.llamar('guardarCampo', ['productos', antes.id, 'nombre', 'Otro nombre', antes.version]);
    expect(r.version).toBe(antes.version + 1);
    expect(r.fila.nombre).toBe('Otro nombre');
    expect(await fallo(gas.llamar('guardarCampo', ['productos', antes.id, 'nombre', 'X', antes.version]))).toMatch(
      /^conflicto:/,
    );
  });

  it('guardarCampos cambia varios campos con una sola subida de versión', async () => {
    const f = (await gas.llamar('listar', ['productos'])).filas[0];
    const r = await gas.llamar('guardarCampos', ['productos', f.id, { nombre: 'Nuevo', stock: 4 }, f.version]);
    expect(r.version).toBe(f.version + 1);
    expect(r.fila).toMatchObject({ nombre: 'Nuevo', stock: 4 });
  });

  it('valida como el servidor: nombre largo, precio ≤ 0 y whatsapp sin país → invalido', async () => {
    const f = (await gas.llamar('listar', ['productos'])).filas[0];
    expect(await fallo(gas.llamar('guardarCampo', ['productos', f.id, 'nombre', 'x'.repeat(81), f.version]))).toMatch(
      /^invalido:/,
    );
    expect(await fallo(gas.llamar('guardarCampo', ['productos', f.id, 'precio_regular', 0, f.version]))).toMatch(
      /^invalido:/,
    );
    const v = (await gas.llamar('listar', ['vendedoras'])).filas[0];
    expect(await fallo(gas.llamar('guardarCampo', ['vendedoras', v.id, 'whatsapp', '12', v.version]))).toMatch(
      /^invalido:/,
    );
  });

  it('crear producto: código con el prefijo de la categoría, borrador y versión 1', async () => {
    const cat = (await gas.llamar('listar', ['categorias'])).filas[0];
    const p = await gas.llamar('crear', ['productos', { categoria_id: cat.id, nombre: 'Falda' }]);
    expect(p.codigo).toMatch(new RegExp(`^${cat.prefijo_codigo}-\\d{3}$`));
    expect(p).toMatchObject({ estado: 'borrador', version: 1, nombre: 'Falda' });
    const otro = await gas.llamar('crear', ['productos', { categoria_id: cat.id }]);
    expect(otro.codigo).not.toBe(p.codigo);
    expect(await fallo(gas.llamar('crear', ['productos', { categoria_id: 'cat_noexiste' }]))).toMatch(/^invalido:/);
  });

  it('eliminar: el producto se archiva, lo demás se borra; deshacer lo restaura', async () => {
    const r = await gas.llamar('eliminar', ['productos', 'prd_00000002']);
    expect(r).toEqual({ ok: true, archivado: true });
    const sin = await gas.llamar('listar', ['productos']);
    expect(sin.filas.some((f) => f.id === 'prd_00000002')).toBe(false);

    const [cambio] = await gas.llamar('historial', [{ entidad: 'productos', id: 'prd_00000002', limite: 1 }]);
    expect(cambio.accion).toBe('eliminar');
    await gas.llamar('deshacer', [cambio.id]);
    const con = await gas.llamar('listar', ['productos']);
    expect(con.filas.find((f) => f.id === 'prd_00000002').estado).not.toBe('archivado');
    const [ultimo] = await gas.llamar('historial', [{ limite: 1 }]);
    expect(ultimo.accion).toBe('deshacer');

    const of = await gas.llamar('eliminar', ['ofertas', 'ofe_00000001']);
    expect(of).toEqual({ ok: true, archivado: false });
    expect((await gas.llamar('listar', ['ofertas'])).filas.some((f) => f.id === 'ofe_00000001')).toBe(false);
  });

  it('deshacer una edición devuelve el valor anterior', async () => {
    const f = (await gas.llamar('listar', ['productos'])).filas.find((x) => x.id === 'prd_00000003');
    await gas.llamar('guardarCampo', ['productos', f.id, 'nombre', 'Cambiado', f.version]);
    const [cambio] = await gas.llamar('historial', [{ entidad: 'productos', id: f.id }]);
    expect(cambio).toMatchObject({ campo: 'nombre', accion: 'editar' });
    expect(JSON.parse(cambio.antes)).toBe(f.nombre);
    expect(JSON.parse(cambio.despues)).toBe('Cambiado');
    const { fila } = await gas.llamar('deshacer', [cambio.id]);
    expect(fila.nombre).toBe(f.nombre);
  });

  it('reordenar cambia el orden; en temporada_fotos solo toca las de esa temporada', async () => {
    const { filas } = await gas.llamar('listar', ['secciones']);
    const ids = filas.map((s) => s.id).reverse();
    await gas.llamar('reordenar', ['secciones', ids]);
    const despues = (await gas.llamar('listar', ['secciones'])).filas.sort((a, b) => a.orden - b.orden);
    expect(despues.map((s) => s.id)).toEqual(ids);

    const fotos = (await gas.llamar('listar', ['temporada_fotos', { filtro: { temporada_id: 'tem_00000001' } }])).filas;
    const orden = fotos.map((x) => x.id).reverse();
    await gas.llamar('reordenar', ['temporada_fotos', orden]);
    const nuevas = (await gas.llamar('listar', ['temporada_fotos', { filtro: { temporada_id: 'tem_00000001' } }])).filas;
    expect(nuevas.sort((a, b) => a.orden - b.orden).map((x) => x.id)).toEqual(orden);
  });

  it('duplicarProducto: borrador, código nuevo y las mismas fotos', async () => {
    const o = (await gas.llamar('listar', ['productos'])).filas.find((f) => f.id === 'prd_00000001');
    const d = await gas.llamar('duplicarProducto', ['prd_00000001']);
    expect(d.id).not.toBe(o.id);
    expect(d.codigo).not.toBe(o.codigo);
    expect(d.estado).toBe('borrador');
    expect(d.fotos).toEqual(o.fotos);
  });
});

describe('crearGasFalso: fotos', () => {
  let gas;
  beforeEach(() => {
    gas = crearGasFalso();
  });
  const archivo = (buf, extra = {}) => ({
    nombre: 'vestido.jpg',
    mime: 'image/jpeg',
    base64: buf.toString('base64'),
    destino: 'producto',
    ...extra,
  });

  it('rechaza con invalido un JPEG que trae EXIF', async () => {
    expect(await fallo(gas.llamar('subirFoto', [archivo(JPEG_CON_EXIF)]))).toMatch(/^invalido:.*EXIF/i);
  });

  it('rechaza con invalido un mime no permitido', async () => {
    expect(await fallo(gas.llamar('subirFoto', [archivo(JPEG_LIMPIO, { mime: 'image/gif' })]))).toMatch(/^invalido:/);
  });

  it('rechaza con limite más de 8 MB ya decodificado', async () => {
    const grande = Buffer.concat([JPEG_LIMPIO.subarray(0, 8), Buffer.alloc(8 * 1024 * 1024), JPEG_LIMPIO.subarray(8)]);
    expect(await fallo(gas.llamar('subirFoto', [archivo(grande)]))).toMatch(/^limite:/);
  });

  it('acepta una foto limpia y la deja en la biblioteca de su carpeta', async () => {
    const ok = await gas.llamar('subirFoto', [archivo(JPEG_LIMPIO, { destino: 'portada' })]);
    expect(ok.id).toMatch(/^fx_[0-9a-f]{8}$/);
    expect(ok.miniatura).toMatch(/^data:image\//);
    const lib = await gas.llamar('biblioteca', [{ carpeta: 'portadas' }]);
    expect(lib.fotos.some((f) => f.id === ok.id && f.carpeta === 'portadas')).toBe(true);
  });

  it('biblioteca: usos con etiquetas y paginación', async () => {
    const lib = await gas.llamar('biblioteca', [{ carpeta: 'fotos' }]);
    expect(lib.total).toBeGreaterThan(0);
    expect(lib.pagina).toBe(1);
    const usada = lib.fotos.find((f) => f.id === 'fx_00000001');
    expect(usada.usos.some((u) => u.entidad === 'productos' && u.etiqueta === 'VES-001')).toBe(true);
    const sinUso = (await gas.llamar('biblioteca', [{}])).fotos.some((f) => f.usos.length === 0);
    expect(typeof sinUso).toBe('boolean');
  });

  it('miniaturas devuelve data URL por id (y rechaza más de 40 con limite)', async () => {
    const m = await gas.llamar('miniaturas', [['fx_00000001', 'fx_00000002']]);
    expect(Object.keys(m)).toEqual(['fx_00000001', 'fx_00000002']);
    expect(m.fx_00000001).toMatch(/^data:image\/jpeg;base64,/);
    const muchas = Array.from({ length: 41 }, (_, i) => `fx_${String(i).padStart(8, '0')}`);
    expect(await fallo(gas.llamar('miniaturas', [muchas]))).toMatch(/^limite:/);
  });

  it('altaRapida crea un borrador por foto, en la categoría elegida', async () => {
    const cat = (await gas.llamar('listar', ['categorias'])).filas[1];
    const filas = await gas.llamar('altaRapida', [['fx_00000001', 'fx_00000002'], { categoria_id: cat.id }]);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.fotos)).toEqual([['fx_00000001'], ['fx_00000002']]);
    expect(filas.every((f) => f.estado === 'borrador' && f.categoria_id === cat.id)).toBe(true);
  });
});

describe('crearGasFalso: precios, paletas, textos y configuración', () => {
  let gas;
  beforeEach(() => {
    gas = crearGasFalso();
  });

  it('vistaPreviaPrecios con una oferta sin guardar da ventanas contiguas', async () => {
    const desde = '2026-12-01T00:00:00-05:00';
    const hasta = '2026-12-10T00:00:00-05:00';
    const r = await gas.llamar('vistaPreviaPrecios', [
      { producto_id: 'prd_00000001', oferta: { tipo: 'porcentaje', valor: 25, desde, hasta, cuenta_regresiva: true } },
    ]);
    expect(r.regular).toBe(89);
    expect(r.ventanas).toHaveLength(3);
    expect(r.ventanas[1]).toMatchObject({ precio: 66.75, antes: 89, descuento_pct: 25, etiqueta: '-25%', cuenta_regresiva: true });
    expect(r.ventanas[0].hasta).toBe(r.ventanas[1].desde);
    expect(r.ventanas[1].hasta).toBe(r.ventanas[2].desde);
    expect(r.ventanas[0].desde).toBeNull();
    expect(r.ventanas[2].hasta).toBeNull();
  });

  it('vistaPreviaPrecios: monto y precio final', async () => {
    const m = await gas.llamar('vistaPreviaPrecios', [{ producto_id: 'prd_00000001', oferta: { tipo: 'monto', valor: 9 } }]);
    expect(m.ventanas.at(-1)).toMatchObject({ precio: 80, antes: 89 });
    const f = await gas.llamar('vistaPreviaPrecios', [{ producto_id: 'prd_00000001', oferta: { tipo: 'precio_final', valor: 59 } }]);
    expect(f.ventanas.at(-1).precio).toBe(59);
  });

  it('vistaPreviaPrecios sin oferta devuelve solo el precio regular', async () => {
    const r = await gas.llamar('vistaPreviaPrecios', [{ producto_id: 'prd_00000003' }]);
    expect(r.ventanas.every((v) => v.oferta_id === null || typeof v.oferta_id === 'string')).toBe(true);
    expect(r.regular).toBeGreaterThan(0);
  });

  it('validarPaleta coincide con revisarPaleta de contratos', async () => {
    const buena = (await gas.llamar('listar', ['paletas'])).filas[0].tokens;
    expect(await gas.llamar('validarPaleta', [buena])).toMatchObject({ ok: true, faltantes: [], fallos: [] });
    const rota = { ...buena, '--color-texto': buena['--color-fondo'] };
    const r = await gas.llamar('validarPaleta', [rota]);
    const esperado = revisarPaleta(rota);
    expect(r.ok).toBe(false);
    expect(r.fallos).toEqual(esperado.fallos);
    const incompleta = { '--color-fondo': '#FFFFFF' };
    expect((await gas.llamar('validarPaleta', [incompleta])).faltantes).toHaveLength(15);
  });

  it('una paleta propia que no pasa el contraste no se guarda', async () => {
    const base = (await gas.llamar('listar', ['paletas'])).filas[0];
    const nueva = await gas.llamar('crear', ['paletas', { nombre: 'Mía', tokens: base.tokens, origen: 'propia' }]);
    expect(nueva.id).toMatch(/^pal_[0-9a-f]{8}$/);
    const rota = { ...base.tokens, '--color-texto': base.tokens['--color-fondo'] };
    expect(await fallo(gas.llamar('guardarCampo', ['paletas', nueva.id, 'tokens', rota, nueva.version]))).toMatch(/^invalido:/);
  });

  it('guardarTexto y guardarConfig guardan y se ven en obtenerEstadoInicial', async () => {
    expect(await gas.llamar('guardarTexto', ['tienda.eslogan', 'Hola'])).toEqual({ clave: 'tienda.eslogan', valor: 'Hola' });
    expect(await gas.llamar('guardarConfig', ['tienda_nombre', 'Mi tienda'])).toEqual({ clave: 'tienda_nombre', valor: 'Mi tienda' });
    const e = await gas.llamar('obtenerEstadoInicial', []);
    expect(e.textos['tienda.eslogan']).toBe('Hola');
    expect(e.config.tienda_nombre).toBe('Mi tienda');
    expect(e.conteos.productos).toBeGreaterThanOrEqual(20);
    expect(typeof e.sitio_url).toBe('string');
    expect(e.usuario).toMatch(/@/);
  });

  it('guardarConfig rechaza claves desconocidas', async () => {
    expect(await fallo(gas.llamar('guardarConfig', ['no_existe', 'x']))).toMatch(/^invalido:/);
  });

  it('el token de GitHub se guarda pero nunca se devuelve', async () => {
    expect(await gas.llamar('estadoTokenGithub', [])).toMatchObject({ configurado: false });
    const r = await gas.llamar('guardarTokenGithub', ['ghp_secreto_de_prueba']);
    expect(r.ok).toBe(true);
    expect(typeof r.repo).toBe('string');
    const estado = await gas.llamar('estadoTokenGithub', []);
    expect(estado.configurado).toBe(true);
    expect(JSON.stringify([r, estado, await gas.llamar('obtenerEstadoInicial', [])])).not.toContain('ghp_secreto');
  });

  it('instalar es repetible', async () => {
    const a = await gas.llamar('instalar', []);
    const b = await gas.llamar('instalar', []);
    expect(a).toHaveProperty('hojaUrl');
    expect(b.nueva).toBe(false);
  });
});

describe('crearGasFalso: publicación, resumen y documentos', () => {
  it('publicar pasa por en_cola → publicando → publicado → documentos guardados', async () => {
    const r = reloj();
    const gas = crearGasFalso({ ahora: r.ahora, duraciones: { cola: 1000, publicando: 2000, documentos: 1000 } });
    await gas.llamar('guardarTokenGithub', ['x']);
    expect((await gas.llamar('estadoPublicacion', [])).estado).toBe('publicado');
    const e = await gas.llamar('publicar', []);
    expect(e.estado).toBe('en_cola');
    expect((await gas.llamar('estadoPublicacion', [])).estado).toBe('en_cola');
    r.avanzar(1500);
    expect((await gas.llamar('estadoPublicacion', [])).estado).toBe('publicando');
    r.avanzar(2000);
    const p = await gas.llamar('estadoPublicacion', []);
    expect(p.estado).toBe('publicado');
    expect(p.documentos_guardados).toBe(false);
    r.avanzar(1500);
    expect((await gas.llamar('estadoPublicacion', [])).documentos_guardados).toBe(true);
    expect((await gas.llamar('obtenerEstadoInicial', [])).cambios_sin_publicar).toBe(false);
  });

  it('las ediciones marcan cambios sin publicar', async () => {
    const gas = crearGasFalso();
    expect((await gas.llamar('obtenerEstadoInicial', [])).cambios_sin_publicar).toBe(false);
    const f = (await gas.llamar('listar', ['productos'])).filas[0];
    await gas.llamar('guardarCampo', ['productos', f.id, 'stock', 3, f.version]);
    expect((await gas.llamar('obtenerEstadoInicial', [])).cambios_sin_publicar).toBe(true);
  });

  it('publicar sin token lanza sin_token; sin nombre de tienda lanza invalido', async () => {
    const gas = crearGasFalso();
    expect(await fallo(gas.llamar('publicar', []))).toMatch(/^sin_token:/);
    await gas.llamar('guardarTokenGithub', ['x']);
    await gas.llamar('guardarConfig', ['tienda_nombre', '']);
    expect(await fallo(gas.llamar('publicar', []))).toMatch(/^invalido:.*nombre/i);
  });

  it('resumen devuelve la forma del contrato para 7 y 30 días', async () => {
    const gas = crearGasFalso();
    const r7 = await gas.llamar('resumen', [{ dias: 7 }]);
    const r30 = await gas.llamar('resumen', [{ dias: 30 }]);
    expect(Object.keys(r7.totales).sort()).toEqual(['compartidos', 'descargas', 'favoritos', 'vistas', 'whatsapp']);
    expect(r30.totales.vistas).toBeGreaterThanOrEqual(r7.totales.vistas);
    expect(r30.por_producto[0]).toHaveProperty('codigo');
    expect(r30.por_origen).toHaveProperty('web');
    expect(await fallo(gas.llamar('resumen', [{ dias: 5 }]))).toMatch(/^invalido:/);
  });

  it('documentos tiene la forma del contrato', async () => {
    const d = await crearGasFalso().llamar('documentos', []);
    expect(d.revistas[0]).toMatchObject({ temporada_id: 'tem_00000001' });
    expect(d.revistas[0].pdf).toHaveProperty('url');
    expect(d.revistas[0].carrusel).toHaveProperty('cantidad');
    expect(d.catalogo).toHaveProperty('url');
    expect(Array.isArray(d.reportes)).toBe(true);
  });
});

describe('crearGasFalso: fallas simuladas', () => {
  it('falla(nombre, codigo, veces) hace fallar solo las siguientes llamadas', async () => {
    const gas = crearGasFalso();
    gas.simular.falla('guardarCampo', 'conflicto', 1);
    const f = (await gas.llamar('listar', ['productos'])).filas[0];
    expect(await fallo(gas.llamar('guardarCampo', ['productos', f.id, 'stock', 1, f.version]))).toMatch(/^conflicto:/);
    const r = await gas.llamar('guardarCampo', ['productos', f.id, 'stock', 1, f.version]);
    expect(r.version).toBe(f.version + 1);
  });

  it("falla('*') afecta a cualquier función; no_autorizado y limite llevan su código", async () => {
    const gas = crearGasFalso();
    gas.simular.falla('*', 'no_autorizado', 1);
    expect(await fallo(gas.llamar('listar', ['productos']))).toMatch(/^no_autorizado:/);
    gas.simular.falla('subirFoto', 'limite', 1);
    expect(await fallo(gas.llamar('subirFoto', [{}]))).toMatch(/^limite:/);
  });

  it('sinConexion hace fallar con un error de red (sin código)', async () => {
    const gas = crearGasFalso();
    gas.simular.sinConexion(true);
    expect(await fallo(gas.llamar('listar', ['productos']))).toMatch(/Failed to fetch|red|conexi/i);
    gas.simular.sinConexion(false);
    expect((await gas.llamar('listar', ['productos'])).filas.length).toBeGreaterThan(0);
  });

  it('reiniciar vuelve a los datos de partida', async () => {
    const gas = crearGasFalso();
    const f = (await gas.llamar('listar', ['productos'])).filas[0];
    await gas.llamar('guardarCampo', ['productos', f.id, 'nombre', 'Otro', f.version]);
    gas.simular.reiniciar();
    expect((await gas.llamar('listar', ['productos'])).filas[0].nombre).toBe(f.nombre);
  });
});

describe('crearGasFalso: datos de partida', () => {
  it('ningún id se repite dentro de una entidad', async () => {
    const gas = crearGasFalso();
    for (const entidad of ['productos', 'categorias', 'secciones', 'portadas', 'ofertas', 'temporadas', 'temporada_fotos', 'paletas', 'vendedoras']) {
      const { filas } = await gas.llamar('listar', [entidad, { incluir_archivados: true }]);
      const ids = filas.map((f) => f.id);
      expect(new Set(ids).size, entidad).toBe(ids.length);
    }
  });
});

// El simulador imita al servidor real (crud.js, quitarPorDefectoAjeno_): siempre queda exactamente una
// vendedora por defecto, y las que el servidor desmarca suben su versión.
describe('crearGasFalso: vendedora por defecto, como el servidor real', () => {
  it('marcar una como por defecto desmarca a las demás y les sube la versión', async () => {
    const gas = crearGasFalso();
    const nueva = await gas.llamar('crear', ['vendedoras', { nombre: 'Bea', whatsapp: '51900000002', activa: true, por_defecto: false }]);
    const antes = (await gas.llamar('listar', ['vendedoras'])).filas.filter((v) => v.por_defecto && v.id !== nueva.id);
    expect(antes.length).toBeGreaterThan(0);
    await gas.llamar('guardarCampo', ['vendedoras', nueva.id, 'por_defecto', true, nueva.version]);
    const despues = (await gas.llamar('listar', ['vendedoras'])).filas;
    expect(despues.filter((v) => v.por_defecto).map((v) => v.id)).toEqual([nueva.id]);
    for (const v of antes) expect(despues.find((d) => d.id === v.id).version).toBe(v.version + 1);
  });

  it('crear una ya marcada por defecto también desmarca a las demás', async () => {
    const gas = crearGasFalso();
    const nueva = await gas.llamar('crear', ['vendedoras', { nombre: 'Cata', whatsapp: '51900000003', activa: true, por_defecto: true }]);
    const filas = (await gas.llamar('listar', ['vendedoras'])).filas;
    expect(filas.filter((v) => v.por_defecto).map((v) => v.id)).toEqual([nueva.id]);
  });
});
