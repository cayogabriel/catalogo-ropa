import { describe, test, expect } from 'vitest';
import { panelInstalado, filasCrudas, escribirCrudo } from './ayudas.mjs';

const FOTO = 'fotoEjemplo01';
const FOTO2 = 'fotoEjemplo02';

function conCategoria(nombre = 'Vestidos') {
  const p = panelInstalado();
  const cat = p.ctx.crear('categorias', { nombre });
  return { ...p, cat };
}

describe('crear()', () => {
  test('una categoría genera su enlace, su prefijo, orden y version 1', () => {
    const { ctx } = panelInstalado();
    const c = ctx.crear('categorias', { nombre: 'Vestidos de Fiesta' });
    expect(c).toMatchObject({ nombre: 'Vestidos de Fiesta', slug: 'vestidos-de-fiesta', prefijo_codigo: 'VES', orden: 1, visible: true, version: 1 });
    expect(c.id).toMatch(/^cat_[0-9a-f]{8}$/);
    expect(ctx.crear('categorias', { nombre: 'Vestidos' })).toMatchObject({ slug: 'vestidos', prefijo_codigo: 'VET', orden: 2 });
    expect(ctx.crear('categorias', { nombre: 'Vestidos' }).slug).toBe('vestidos-2');
  });

  test('el enlace y el prefijo quitan tildes y la ñ', () => {
    const { ctx } = panelInstalado();
    expect(ctx.crear('categorias', { nombre: 'Niñas' })).toMatchObject({ slug: 'ninas', prefijo_codigo: 'NIN' });
  });

  test('un producto nace en borrador con código = prefijo + correlativo y fechas', () => {
    const { ctx, cat } = conCategoria();
    const a = ctx.crear('productos', { nombre: 'Vestido', categoria_id: cat.id, estado: 'publicado' });
    const b = ctx.crear('productos', { nombre: 'Otro', categoria_id: cat.id });
    expect(a).toMatchObject({ estado: 'borrador', codigo: 'VES-001', version: 1, publicado_en: null, orden: 1 });
    expect(b.codigo).toBe('VES-002');
    expect(a.creado_en.slice(0, 10)).toBe('2026-12-01');
    expect(a.creado_en).toMatch(/-05:00$/);
    expect(a.id).toMatch(/^prd_[0-9a-f]{8}$/);
  });

  test('el correlativo sigue al mayor usado, incluso de una prenda archivada', () => {
    const { ctx, cat } = conCategoria();
    const a = ctx.crear('productos', { categoria_id: cat.id });
    const b = ctx.crear('productos', { categoria_id: cat.id });
    ctx.eliminar('productos', b.id);
    expect(ctx.crear('productos', { categoria_id: cat.id }).codigo).toBe('VES-003');
    expect(a.codigo).toBe('VES-001');
  });

  test('rechaza columnas que no existen, ids y campos del sistema', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.crear('categorias', { nombre: 'A', color: 'rojo' })).toThrow(/invalido: no existe la columna «color»/);
    expect(() => ctx.crear('categorias', { nombre: 'A', id: 'cat_00000001' })).toThrow(/invalido: el id lo genera/);
    expect(() => ctx.crear('categorias', { nombre: 'A', version: 9 })).toThrow(/invalido: version: lo maneja el Panel/);
    expect(() => ctx.crear('cosas', {})).toThrow(/invalido: entidad desconocida/);
  });

  test('valida cada columna según modelo-datos.md', () => {
    const { ctx, cat } = conCategoria();
    expect(() => ctx.crear('productos', { nombre: 'x'.repeat(81) })).toThrow(/nombre: máximo 80/);
    expect(() => ctx.crear('productos', { precio_regular: 0 })).toThrow(/precio regular: debe ser mayor que 0/);
    expect(() => ctx.crear('productos', { precio_regular: 'caro' })).toThrow(/debe ser un número/);
    expect(() => ctx.crear('productos', { categoria_id: 'cat_ffffffff' })).toThrow(/categoria id: «cat_ffffffff» no existe/);
    expect(() => ctx.crear('productos', { tallas: ['S,M'] })).toThrow(/no puede llevar comas/);
    expect(() => ctx.crear('productos', { fotos: ['corta'] })).toThrow(/no es válido/);
    expect(() => ctx.crear('productos', { stock: -1 })).toThrow(/no puede ser menor que 0/);
    expect(() => ctx.crear('productos', { stock: 1.5 })).toThrow(/número entero/);
    expect(() => ctx.crear('categorias', { nombre: 'A', slug: 'Con Espacios' })).toThrow(/enlace solo puede llevar/);
    expect(() => ctx.crear('categorias', { nombre: 'A', prefijo_codigo: 'ab' })).toThrow(/prefijo son 3 letras/);
    expect(() => ctx.crear('productos', { fecha: 1 })).toThrow(/no existe la columna/);
    expect(cat.id).toBeTruthy();
  });

  test('un prefijo o un enlace repetido se rechaza', () => {
    const { ctx } = panelInstalado();
    ctx.crear('categorias', { nombre: 'Faldas', slug: 'faldas', prefijo_codigo: 'FAL' });
    expect(() => ctx.crear('categorias', { nombre: 'Otra', slug: 'faldas', prefijo_codigo: 'OTR' })).toThrow(/enlace «faldas» ya lo usa/);
    expect(() => ctx.crear('categorias', { nombre: 'Otra', slug: 'otra', prefijo_codigo: 'FAL' })).toThrow(/prefijo FAL ya lo usa/);
  });

  test('las fechas se guardan en ISO con -05:00 y se rechazan las inválidas', () => {
    const { ctx } = panelInstalado();
    const o = ctx.crear('ofertas', { nombre: 'Cyber', valor: 20, desde: '2026-12-05T05:00:00Z', hasta: '2026-12-10T00:00:00-05:00' });
    expect(o.desde).toBe('2026-12-05T00:00:00-05:00');
    expect(() => ctx.crear('ofertas', { desde: 'mañana' })).toThrow(/la fecha no es válida/);
    expect(() => ctx.crear('ofertas', { desde: '2026-12-10T00:00:00-05:00', hasta: '2026-12-05T00:00:00-05:00' })).toThrow(/«hasta» debe ser posterior/);
  });

  test('las ofertas completas y el alcance «tienda» sin objetivos', () => {
    const { ctx } = panelInstalado();
    const o = ctx.crear('ofertas', { nombre: 'Todo', tipo: 'porcentaje', valor: 20, alcance: 'tienda', objetivos: [], activa: true });
    expect(o).toMatchObject({ prioridad: 0, activa: true, objetivos: [] });
    expect(() => ctx.crear('ofertas', { valor: 95 })).toThrow(/porcentaje va de 1 a 90/);
    expect(() => ctx.crear('ofertas', { activa: true })).toThrow(/falta el valor/);
    expect(() => ctx.crear('ofertas', { valor: 10, alcance: 'producto', activa: true })).toThrow(/elige a qué se aplica/);
    expect(() => ctx.crear('ofertas', { valor: 10, alcance: 'producto', objetivos: ['prd_ffffffff'] })).toThrow(/objetivos: «prd_ffffffff» no existe/);
  });

  test('una temporada toma la paleta por defecto y un enlace desde su nombre', () => {
    const { ctx } = panelInstalado();
    const t = ctx.crear('temporadas', { nombre: 'Verano 2027' });
    expect(t).toMatchObject({ slug: 'verano-2027', paleta_id: 'neutra-minimal', activa_manual: '', revista: false });
  });

  test('una foto de temporada se numera dentro de su temporada', () => {
    const { ctx } = panelInstalado();
    const t1 = ctx.crear('temporadas', { nombre: 'Uno' });
    const t2 = ctx.crear('temporadas', { nombre: 'Dos' });
    const a = ctx.crear('temporada_fotos', { temporada_id: t1.id, foto: FOTO });
    const b = ctx.crear('temporada_fotos', { temporada_id: t1.id, foto: FOTO2 });
    const c = ctx.crear('temporada_fotos', { temporada_id: t2.id, foto: FOTO });
    expect([a.orden, b.orden, c.orden]).toEqual([1, 2, 1]);
    expect(() => ctx.crear('temporada_fotos', { foto: FOTO })).toThrow(/necesita una temporada/);
  });

  test('una paleta propia exige los 16 colores y queda como «propia»', () => {
    const { ctx } = panelInstalado();
    const tokens = Object.fromEntries(['fondo', 'superficie', 'texto', 'texto-suave', 'borde', 'control', 'primario', 'sobre-primario', 'acento', 'sobre-acento', 'oferta', 'sobre-oferta', 'liquidacion', 'sobre-liquidacion', 'exito', 'foco'].map((t) => [`--color-${t}`, '#abcdef']));
    const p = ctx.crear('paletas', { nombre: 'Mía', tokens, origen: 'predefinida' });
    expect(p.id).toMatch(/^pal_[0-9a-f]{8}$/);
    expect(p.origen).toBe('propia');
    expect(p.tokens['--color-fondo']).toBe('#ABCDEF');
    expect(() => ctx.crear('paletas', { nombre: 'Mala', tokens: { '--color-fondo': '#fff' } })).toThrow(/debe ser un color #RRGGBB/);
  });

  test('la primera vendedora con número queda activa y por defecto; las demás no', () => {
    const { ctx } = panelInstalado();
    const a = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51987654321' });
    const b = ctx.crear('vendedoras', { nombre: 'Bea', whatsapp: '51987654322' });
    expect(a).toMatchObject({ activa: true, por_defecto: true });
    expect(b).toMatchObject({ activa: true, por_defecto: false });
    expect(() => ctx.crear('vendedoras', { nombre: 'C', whatsapp: '987-654' })).toThrow(/solo con dígitos/);
  });

  test('guarda los textos que parecen fórmula como texto', () => {
    const { ctx, libro } = panelInstalado();
    ctx.crear('categorias', { nombre: '=HYPERLINK("x")' });
    expect(filasCrudas(libro, 'categorias')[0].nombre).toBe('=HYPERLINK("x")');
  });
});

describe('listar()', () => {
  test('ordena por «orden», oculta archivados y filtra', () => {
    const { ctx, cat } = conCategoria();
    const a = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    const b = ctx.crear('productos', { nombre: 'B', categoria_id: cat.id });
    const c = ctx.crear('productos', { nombre: 'C' });
    ctx.reordenar('productos', [c.id, b.id, a.id]);
    ctx.eliminar('productos', b.id);
    const r = ctx.listar('productos');
    expect(r.filas.map((f) => f.nombre)).toEqual(['C', 'A']);
    expect(ctx.listar('productos', { incluir_archivados: true }).filas.map((f) => f.nombre)).toEqual(['C', 'B', 'A']);
    expect(ctx.listar('productos', { filtro: { categoria_id: cat.id } }).filas.map((f) => f.nombre)).toEqual(['A']);
    expect(r.leido_en).toMatch(/-05:00$/);
    expect(() => ctx.listar('productos', { filtro: { zzz: 1 } })).toThrow(/no existe la columna/);
  });

  test('devuelve objetos JSON simples (sin fechas ni campos internos)', () => {
    const { ctx, cat } = conCategoria();
    ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    const f = ctx.listar('productos').filas[0];
    expect(Object.keys(f).some((k) => k.startsWith('_'))).toBe(false);
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});

describe('guardarCampo / guardarCampos', () => {
  test('guarda, sube la versión y actualiza la fecha de la prenda', () => {
    const { ctx, cat, dobles } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    dobles._reloj.saltar(60000);
    const r = ctx.guardarCampo('productos', p.id, 'nombre', 'Vestido Lino', 1);
    expect(r.version).toBe(2);
    expect(r.fila).toMatchObject({ nombre: 'Vestido Lino', version: 2 });
    expect(r.fila.actualizado_en > p.actualizado_en).toBe(true);
    expect(ctx.listar('productos').filas[0].nombre).toBe('Vestido Lino');
  });

  test('con una versión vieja lanza conflicto y no cambia nada', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    ctx.guardarCampo('productos', p.id, 'nombre', 'B', 1);
    expect(() => ctx.guardarCampo('productos', p.id, 'nombre', 'C', 1)).toThrow(/^conflicto:/);
    expect(ctx.listar('productos').filas[0]).toMatchObject({ nombre: 'B', version: 2 });
  });

  test('sin versión también es conflicto (la interfaz siempre la manda)', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    expect(() => ctx.guardarCampo('productos', p.id, 'nombre', 'B', undefined)).toThrow(/^conflicto:/);
  });

  test('una fila editada a mano, sin version, se puede guardar con version 0 o null', () => {
    const { ctx, libro } = panelInstalado();
    escribirCrudo(libro, 'categorias', { id: 'cat_0000000a', nombre: 'Mano', slug: 'mano', prefijo_codigo: 'MAN' });
    const r = ctx.guardarCampo('categorias', 'cat_0000000a', 'nombre', 'Mano 2', null === 0 ? 0 : 0);
    expect(r.version).toBe(1);
    const otra = ctx.guardarCampo('categorias', 'cat_0000000a', 'nombre', 'Mano 3', 1);
    expect(otra.version).toBe(2);
  });

  test('un id que no existe es no_encontrado', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.guardarCampo('productos', 'prd_ffffffff', 'nombre', 'x', 1)).toThrow(/^no_encontrado:/);
  });

  test('no deja editar id, version ni fechas del sistema', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id });
    for (const campo of ['id', 'version', 'creado_en', 'actualizado_en', 'publicado_en']) {
      expect(() => ctx.guardarCampo('productos', p.id, campo, 'x', 1)).toThrow(/lo maneja el Panel/);
    }
  });

  test('guardarCampos aplica varios cambios en una sola versión', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id });
    const r = ctx.guardarCampos('productos', p.id, { nombre: 'Vestido', precio_regular: 89, tallas: ['S', 'M'] }, 1);
    expect(r.version).toBe(2);
    expect(r.fila).toMatchObject({ nombre: 'Vestido', precio_regular: 89, tallas: ['S', 'M'] });
  });

  test('si un campo es inválido no se guarda ninguno de los otros', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    expect(() => ctx.guardarCampos('productos', p.id, { nombre: 'B', precio_regular: -5 }, 1)).toThrow(/invalido/);
    expect(ctx.listar('productos').filas[0]).toMatchObject({ nombre: 'A', version: 1 });
  });

  test('guardar el mismo valor no sube la versión ni deja historial', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    const antes = ctx.historial({ id: p.id }).length;
    expect(ctx.guardarCampo('productos', p.id, 'nombre', 'A', 1).version).toBe(1);
    expect(ctx.historial({ id: p.id }).length).toBe(antes);
  });

  test('si el candado no se consigue no se escribe nada', () => {
    const { ctx, cat, dobles } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    dobles._candado.fallar = true;
    expect(() => ctx.guardarCampo('productos', p.id, 'nombre', 'B', 1)).toThrow(/^conflicto:/);
    expect(() => ctx.crear('categorias', { nombre: 'Z' })).toThrow(/^conflicto:/);
    expect(() => ctx.eliminar('productos', p.id)).toThrow(/^conflicto:/);
    dobles._candado.fallar = false;
    expect(ctx.listar('productos').filas[0]).toMatchObject({ nombre: 'A', version: 1 });
  });

  test('quitar una talla la quita también de las agotadas; agotar una talla que no existe se rechaza', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id, tallas: ['S', 'M', 'L'], tallas_agotadas: ['M'] });
    expect(() => ctx.guardarCampo('productos', p.id, 'tallas_agotadas', ['XL'], 1)).toThrow(/«XL» no está en las tallas/);
    const r = ctx.guardarCampo('productos', p.id, 'tallas', ['S', 'L'], 1);
    expect(r.fila.tallas_agotadas).toEqual([]);
  });

  test('pasar a publicado exige nombre, categoría, precio y foto', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id });
    expect(() => ctx.guardarCampo('productos', p.id, 'estado', 'publicado', 1)).toThrow(/falta: nombre, precio, al menos una foto/);
    const ok = ctx.guardarCampos('productos', p.id, { nombre: 'V', precio_regular: 50, fotos: [FOTO], estado: 'publicado' }, 1);
    expect(ok.fila.estado).toBe('publicado');
    expect(() => ctx.guardarCampo('productos', p.id, 'precio_regular', null, 2)).toThrow(/falta: precio/);
  });

  test('el código se puede cambiar antes de publicar, pero no después', () => {
    const { ctx, cat, dobles, libro } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'V', precio_regular: 50, fotos: [FOTO], categoria_id: cat.id });
    expect(ctx.guardarCampo('productos', p.id, 'codigo', 'VES-100', 1).fila.codigo).toBe('VES-100');
    expect(() => ctx.guardarCampo('productos', p.id, 'codigo', 'ves 1', 2)).toThrow(/el código debe verse así/);
    // simula una publicación: publicado_en lo fija publicar()
    const t = ctx.leerTabla_('productos');
    t.filas[0].publicado_en = '2026-12-01T12:00:00-05:00';
    ctx.escribirFila_('productos', t, t.filas[0]);
    expect(() => ctx.guardarCampo('productos', p.id, 'codigo', 'VES-101', 2)).toThrow(/no cambia después de publicar/);
    expect(dobles).toBeTruthy();
    expect(libro).toBeTruthy();
  });

  test('un código repetido se rechaza', () => {
    const { ctx, cat } = conCategoria();
    ctx.crear('productos', { categoria_id: cat.id });
    const b = ctx.crear('productos', { categoria_id: cat.id });
    expect(() => ctx.guardarCampo('productos', b.id, 'codigo', 'VES-001', 1)).toThrow(/ya lo tiene otra prenda/);
  });

  test('cambiar la categoría de una prenda sin publicar le da el código de la categoría nueva', () => {
    const { ctx, cat } = conCategoria();
    const falda = ctx.crear('categorias', { nombre: 'Faldas' });
    const p = ctx.crear('productos', { categoria_id: cat.id });
    expect(ctx.guardarCampo('productos', p.id, 'categoria_id', falda.id, 1).fila.codigo).toBe('FAL-001');
  });

  test('un producto sin categoría usa el prefijo PRD', () => {
    const { ctx } = panelInstalado();
    expect(ctx.crear('productos', {}).codigo).toBe('PRD-001');
  });

  test('un editado a mano con letras en una columna numérica se lee como vacío y no rompe', () => {
    const { ctx, libro } = panelInstalado();
    escribirCrudo(libro, 'categorias', { id: 'cat_0000000b', nombre: 'X', slug: 'x', prefijo_codigo: 'XXX', orden: 'primero' });
    expect(ctx.listar('categorias').filas[0].orden).toBe(null);
  });
});

describe('vendedora por defecto', () => {
  test('marcar otra como por defecto desmarca a la anterior (siempre queda una)', () => {
    const { ctx } = panelInstalado();
    const a = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51987654321' });
    const b = ctx.crear('vendedoras', { nombre: 'Bea', whatsapp: '51987654322' });
    ctx.guardarCampo('vendedoras', b.id, 'por_defecto', true, 1);
    const v = ctx.listar('vendedoras').filas;
    expect(v.find((x) => x.id === a.id)).toMatchObject({ por_defecto: false, version: 2 });
    expect(v.find((x) => x.id === b.id).por_defecto).toBe(true);
  });

  test('no se puede quitar la marca, desactivar ni eliminar a la vendedora por defecto', () => {
    const { ctx } = panelInstalado();
    const a = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51987654321' });
    expect(() => ctx.guardarCampo('vendedoras', a.id, 'por_defecto', false, 1)).toThrow(/tiene que haber una vendedora por defecto/);
    expect(() => ctx.guardarCampo('vendedoras', a.id, 'activa', false, 1)).toThrow(/no se puede desactivar/);
    expect(() => ctx.eliminar('vendedoras', a.id)).toThrow(/vendedora por defecto/);
  });
});

describe('eliminar()', () => {
  test('una prenda se archiva y deja registro; el resto se borra', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id });
    expect(ctx.eliminar('productos', p.id)).toEqual({ ok: true, archivado: true });
    expect(ctx.listar('productos', { incluir_archivados: true }).filas[0].estado).toBe('archivado');
    const o = ctx.crear('ofertas', { nombre: 'x' });
    expect(ctx.eliminar('ofertas', o.id)).toEqual({ ok: true, archivado: false });
    expect(ctx.listar('ofertas').filas).toEqual([]);
    const h = ctx.historial({ limite: 10 });
    expect(h.filter((x) => x.accion === 'eliminar').map((x) => x.entidad).sort()).toEqual(['ofertas', 'productos']);
  });

  test('no borra una categoría con prendas ni una temporada con fotos', () => {
    const { ctx, cat } = conCategoria();
    ctx.crear('productos', { categoria_id: cat.id });
    expect(() => ctx.eliminar('categorias', cat.id)).toThrow(/tiene 1 prenda/);
    const t = ctx.crear('temporadas', { nombre: 'T' });
    ctx.crear('temporada_fotos', { temporada_id: t.id, foto: FOTO });
    expect(() => ctx.eliminar('temporadas', t.id)).toThrow(/quítalas primero/);
  });

  test('no borra una paleta predefinida ni la que usa una temporada', () => {
    const { ctx } = panelInstalado();
    const tabla = ctx.leerTabla_('paletas');
    ctx.agregarFilas_('paletas', tabla, [{ id: 'mi-paleta', nombre: 'P', temporada: '', uso: '', tokens: {}, fuente_titulos: 'Poppins', fuente_texto: 'Nunito Sans', radio: '12px', origen: 'predefinida', version: 1 }]);
    expect(() => ctx.eliminar('paletas', 'mi-paleta')).toThrow(/predefinidas no se eliminan/);
  });

  test('una fila que no existe es no_encontrado', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.eliminar('ofertas', 'ofe_ffffffff')).toThrow(/^no_encontrado:/);
  });
});

describe('reordenar()', () => {
  test('numera 1..n en el orden recibido y sube la versión solo de lo que cambió', () => {
    const { ctx } = panelInstalado();
    const [a, b, c] = ['A', 'B', 'C'].map((n) => ctx.crear('secciones', { titulo: n }));
    expect(ctx.reordenar('secciones', [c.id, a.id, b.id])).toEqual({ ok: true });
    const f = ctx.listar('secciones').filas;
    expect(f.map((x) => [x.titulo, x.orden])).toEqual([['C', 1], ['A', 2], ['B', 3]]);
    expect(f.map((x) => x.version)).toEqual([2, 2, 2]);
    ctx.reordenar('secciones', [c.id, a.id, b.id]);
    expect(ctx.listar('secciones').filas.map((x) => x.version)).toEqual([2, 2, 2]);
  });

  test('en temporada_fotos solo mezcla las de una temporada', () => {
    const { ctx } = panelInstalado();
    const t1 = ctx.crear('temporadas', { nombre: 'Uno' });
    const t2 = ctx.crear('temporadas', { nombre: 'Dos' });
    const a = ctx.crear('temporada_fotos', { temporada_id: t1.id, foto: FOTO });
    const b = ctx.crear('temporada_fotos', { temporada_id: t2.id, foto: FOTO2 });
    expect(() => ctx.reordenar('temporada_fotos', [a.id, b.id])).toThrow(/una sola temporada/);
  });

  test('rechaza ids repetidos, inexistentes o una entidad sin orden', () => {
    const { ctx } = panelInstalado();
    const a = ctx.crear('secciones', { titulo: 'A' });
    expect(() => ctx.reordenar('secciones', [a.id, a.id])).toThrow(/repetido/);
    expect(() => ctx.reordenar('secciones', ['sec_ffffffff'])).toThrow(/^no_encontrado:/);
    expect(() => ctx.reordenar('vendedoras', ['x'])).toThrow(/no se puede reordenar/);
    expect(() => ctx.reordenar('secciones', [])).toThrow(/debe ser una lista/);
  });
});

describe('duplicarProducto()', () => {
  test('crea una prenda en borrador con código nuevo y las mismas fotos', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'Vestido', categoria_id: cat.id, precio_regular: 89, fotos: [FOTO, FOTO2], tallas: ['S'], colores: ['Rojo'] });
    ctx.guardarCampo('productos', p.id, 'estado', 'publicado', 1);
    const d = ctx.duplicarProducto(p.id);
    expect(d).toMatchObject({ nombre: 'Vestido (copia)', estado: 'borrador', codigo: 'VES-002', fotos: [FOTO, FOTO2], tallas: ['S'], precio_regular: 89, version: 1, publicado_en: null });
    expect(d.id).not.toBe(p.id);
  });

  test('el nombre copiado respeta el máximo de 80', () => {
    const { ctx } = panelInstalado();
    const p = ctx.crear('productos', { nombre: 'x'.repeat(80) });
    expect(ctx.duplicarProducto(p.id).nombre.length).toBe(80);
  });
});

describe('historial() y deshacer()', () => {
  test('cada cambio queda con usuario, antes y después; la más reciente primero', () => {
    const { ctx, cat, dobles } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    dobles._reloj.saltar(1000);
    ctx.guardarCampo('productos', p.id, 'nombre', 'B', 1);
    const h = ctx.historial({ id: p.id });
    expect(h[0]).toMatchObject({ accion: 'editar', campo: 'nombre', antes: '"A"', despues: '"B"', usuario: 'duena@example.com', entidad: 'productos', entidad_id: p.id });
    expect(h[1]).toMatchObject({ accion: 'crear', campo: '' });
    expect(h[0].id).toMatch(/^his_[0-9a-f]{8}$/);
    expect(h[0].fecha).toMatch(/-05:00$/);
  });

  test('filtra por entidad y respeta el límite', () => {
    const { ctx } = panelInstalado();
    for (let i = 0; i < 5; i++) ctx.crear('ofertas', { nombre: `o${i}` });
    ctx.crear('secciones', { titulo: 's' });
    expect(ctx.historial({ entidad: 'secciones' })).toHaveLength(1);
    expect(ctx.historial({ limite: 3 })).toHaveLength(3);
    expect(() => ctx.historial({ limite: 0 })).toThrow(/invalido/);
  });

  test('deshacer una edición devuelve el valor anterior y lo registra como «deshacer»', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    ctx.guardarCampo('productos', p.id, 'nombre', 'B', 1);
    const cambio = ctx.historial({ id: p.id })[0];
    const r = ctx.deshacer(cambio.id);
    expect(r.fila).toMatchObject({ nombre: 'A', version: 3 });
    expect(ctx.historial({ id: p.id })[0]).toMatchObject({ accion: 'deshacer', campo: 'nombre', antes: '"B"', despues: '"A"' });
  });

  test('deshacer una creación archiva la prenda o borra la fila', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { categoria_id: cat.id });
    ctx.deshacer(ctx.historial({ id: p.id })[0].id);
    expect(ctx.listar('productos').filas).toEqual([]);
    const o = ctx.crear('ofertas', { nombre: 'x' });
    ctx.deshacer(ctx.historial({ id: o.id })[0].id);
    expect(ctx.listar('ofertas').filas).toEqual([]);
  });

  test('deshacer una eliminación restaura la prenda archivada o la fila borrada con su mismo id', () => {
    const { ctx, cat } = conCategoria();
    const p = ctx.crear('productos', { nombre: 'A', categoria_id: cat.id });
    ctx.eliminar('productos', p.id);
    ctx.deshacer(ctx.historial({ id: p.id })[0].id);
    expect(ctx.listar('productos').filas[0]).toMatchObject({ id: p.id, estado: 'borrador' });
    const o = ctx.crear('ofertas', { nombre: 'x', valor: 10 });
    ctx.eliminar('ofertas', o.id);
    ctx.deshacer(ctx.historial({ id: o.id })[0].id);
    expect(ctx.listar('ofertas').filas[0]).toMatchObject({ id: o.id, nombre: 'x', valor: 10 });
  });

  test('deshacer un reordenamiento vuelve al orden anterior', () => {
    const { ctx } = panelInstalado();
    const [a, b] = ['A', 'B'].map((n) => ctx.crear('secciones', { titulo: n }));
    ctx.reordenar('secciones', [b.id, a.id]);
    ctx.deshacer(ctx.historial({ entidad: 'secciones' })[0].id);
    expect(ctx.listar('secciones').filas.map((f) => f.titulo)).toEqual(['A', 'B']);
  });

  test('un cambio que no existe es no_encontrado', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.deshacer('his_ffffffff')).toThrow(/^no_encontrado:/);
  });

  test('deshacer una edición de una fila que ya no existe es no_encontrado', () => {
    const { ctx } = panelInstalado();
    const o = ctx.crear('ofertas', { nombre: 'x' });
    ctx.guardarCampo('ofertas', o.id, 'nombre', 'y', 1);
    const edicion = ctx.historial({ id: o.id })[0];
    ctx.eliminar('ofertas', o.id);
    expect(() => ctx.deshacer(edicion.id)).toThrow(/^no_encontrado:/);
  });
});

describe('cambios sin publicar', () => {
  test('cada escritura marca que hay cambios sin publicar', () => {
    const { ctx } = panelInstalado();
    expect(ctx.hayCambiosSinPublicar_()).toBe(false);
    ctx.crear('ofertas', { nombre: 'x' });
    expect(ctx.hayCambiosSinPublicar_()).toBe(true);
  });
});
