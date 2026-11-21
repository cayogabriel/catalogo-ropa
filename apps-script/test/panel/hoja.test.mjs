import { describe, test, expect } from 'vitest';
import { panelInstalado, filasCrudas, escribirCrudo } from './ayudas.mjs';

const ejemplo = (extra = {}) => ({
  id: 'prd_0000000a', codigo: 'VES-001', nombre: 'Vestido', descripcion: '', categoria_id: 'cat_00000001', precio_regular: 89.5,
  stock: 4, tallas: ['S', 'M'], tallas_agotadas: [], colores: ['Coral'], fotos: ['f1', 'f2'], texto_alt: '', etiquetas: ['nuevo'],
  estado: 'borrador', vendedora_id: '', orden: 1, creado_en: '2026-12-01T10:00:00-05:00', actualizado_en: '2026-12-01T10:00:00-05:00',
  publicado_en: null, version: 1, ...extra,
});

describe('leerTabla_ / agregarFilas_', () => {
  test('una pestaña sin filas devuelve una lista vacía', () => {
    const { ctx } = panelInstalado();
    expect(ctx.leerTabla_('productos').filas).toEqual([]);
  });

  test('guarda y lee de vuelta cada tipo: número, lista, fecha ISO con -05:00, booleano y json', () => {
    const { ctx, libro } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', t, [ejemplo()]);
    const leida = ctx.leerTabla_('productos').filas[0];
    expect(leida).toMatchObject(ejemplo());
    const p = ctx.leerTabla_('paletas');
    ctx.agregarFilas_('paletas', p, [
      { id: 'pal_00000001', nombre: 'Mía', temporada: '', uso: '', tokens: { '--color-fondo': '#FFFFFF' }, fuente_titulos: 'Poppins', fuente_texto: 'Nunito Sans', radio: '12px', origen: 'propia', version: 1 },
    ]);
    expect(ctx.leerTabla_('paletas').filas.find((f) => f.id === 'pal_00000001').tokens).toEqual({ '--color-fondo': '#FFFFFF' });
    const v = ctx.leerTabla_('vendedoras');
    ctx.agregarFilas_('vendedoras', v, [{ id: 'ven_00000001', nombre: 'Ana', whatsapp: '51987654321', activa: true, por_defecto: true, version: 1 }]);
    expect(ctx.leerTabla_('vendedoras').filas[0]).toMatchObject({ activa: true, por_defecto: true, whatsapp: '51987654321' });
    expect(filasCrudas(libro, 'productos')[0].tallas).toBe('S,M');
  });

  test('los textos que parecen número, fecha o fórmula se guardan como texto', () => {
    const { ctx, libro } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', t, [ejemplo({ nombre: '=1+1', descripcion: '2026-12-01', texto_alt: '51', vendedora_id: 'TRUE' })]);
    const f = ctx.leerTabla_('productos').filas[0];
    expect(f.nombre).toBe('=1+1');
    expect(f.descripcion).toBe('2026-12-01');
    expect(f.texto_alt).toBe('51');
    expect(typeof filasCrudas(libro, 'productos')[0].texto_alt).toBe('string');
  });

  test('agrega al final sin pisar filas existentes y numera _n', () => {
    const { ctx } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', t, [ejemplo({ id: 'prd_00000001' }), ejemplo({ id: 'prd_00000002' })]);
    const otra = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', otra, [ejemplo({ id: 'prd_00000003' })]);
    expect(ctx.leerTabla_('productos').filas.map((f) => [f.id, f._n])).toEqual([['prd_00000001', 2], ['prd_00000002', 3], ['prd_00000003', 4]]);
  });

  test('crece la hoja si hacen falta más filas de las que tiene', () => {
    const { ctx, libro } = panelInstalado();
    const t = ctx.leerTabla_('historial');
    const filas = Array.from({ length: 1100 }, (_, i) => ({ id: `his_${String(i).padStart(8, '0')}`, fecha: null, usuario: '', entidad: '', entidad_id: '', campo: '', antes: '', despues: '', accion: 'crear' }));
    ctx.agregarFilas_('historial', t, filas);
    expect(libro.getSheetByName('historial').getLastRow()).toBe(1101);
  });
});

describe('filas tecleadas a mano', () => {
  test('sin version, con número en una columna de texto y con coma decimal', () => {
    const { ctx, libro } = panelInstalado();
    libro.getSheetByName('productos').getRange(2, 1, 1, 20).setNumberFormat('General');
    escribirCrudo(libro, 'productos', { id: 'prd_0000000b', nombre: 12345, precio_regular: '59,90', tallas: 'S, M ,,L' });
    const f = ctx.leerTabla_('productos').filas[0];
    expect(f.nombre).toBe('12345');
    expect(f.precio_regular).toBe(59.9);
    expect(f.version).toBe(null);
    expect(f.tallas).toEqual(['S', 'M', 'L']);
    expect(f.creado_en).toBe(null);
  });

  test('tolera las columnas reordenadas y una columna extra', () => {
    const { ctx, libro } = panelInstalado();
    const h = libro.getSheetByName('categorias');
    const n = h.getLastColumn();
    h.insertColumnsAfter(h.getMaxColumns(), 1);
    h.getRange(1, n + 1).setValue('nota_mia');
    h.getRange(1, 1, 1, 2).setValues([['nombre', 'id']]);
    h.getRange(2, 1, 1, 3).setValues([['Vestidos', 'cat_00000001', 'x']]);
    const t = ctx.leerTabla_('categorias');
    expect(t.filas[0]).toMatchObject({ id: 'cat_00000001', nombre: 'Vestidos' });
    ctx.escribirFila_('categorias', t, { ...t.filas[0], nombre: 'Faldas' });
    expect(h.getRange(2, 1, 1, 2).getValues()[0]).toEqual(['Faldas', 'cat_00000001']);
  });

  test('si falta una columna del esquema pide ejecutar instalar()', () => {
    const { ctx, libro } = panelInstalado();
    libro.getSheetByName('categorias').getRange(1, 3).setValue('otra');
    expect(() => ctx.leerTabla_('categorias')).toThrow(/invalido: .*slug.*instalar/);
  });
});

describe('escribirFila_ / eliminarFila_', () => {
  test('actualiza solo su fila y conserva las columnas desconocidas', () => {
    const { ctx, libro } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', t, [ejemplo({ id: 'prd_00000001' }), ejemplo({ id: 'prd_00000002' })]);
    libro.getSheetByName('productos').insertColumnsAfter(20, 1);
    libro.getSheetByName('productos').getRange(1, 21).setValue('mi_nota');
    libro.getSheetByName('productos').getRange(3, 21).setValue('no me borres');
    const t2 = ctx.leerTabla_('productos');
    const f = t2.filas[1];
    f.nombre = 'Cambiado';
    ctx.escribirFila_('productos', t2, f);
    const crudas = filasCrudas(libro, 'productos');
    expect(crudas.map((x) => x.nombre)).toEqual(['Vestido', 'Cambiado']);
    expect(crudas[1].mi_nota).toBe('no me borres');
  });

  test('eliminarFila_ quita la fila y renumera las siguientes', () => {
    const { ctx } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    ctx.agregarFilas_('productos', t, [1, 2, 3].map((n) => ejemplo({ id: `prd_0000000${n}` })));
    const t2 = ctx.leerTabla_('productos');
    ctx.eliminarFila_(t2, t2.filas[0]);
    expect(t2.filas.map((f) => f._n)).toEqual([2, 3]);
    expect(ctx.leerTabla_('productos').filas.map((f) => f.id)).toEqual(['prd_00000002', 'prd_00000003']);
  });

  test('un valor de más de 45 000 caracteres se rechaza con limite', () => {
    const { ctx } = panelInstalado();
    const t = ctx.leerTabla_('productos');
    expect(() => ctx.agregarFilas_('productos', t, [ejemplo({ descripcion: 'x'.repeat(46000) })])).toThrow(/^limite:/);
  });
});

describe('leerConfig_', () => {
  test('texto, salvo las claves numéricas', () => {
    const { ctx } = panelInstalado();
    const c = ctx.leerConfig_();
    expect(c.moneda_simbolo).toBe('S/');
    expect(c.pais_codigo).toBe('51');
    expect(c.umbral_ultimas_unidades).toBe(3);
    expect(c.vigencia_dias_defecto).toBe(15);
    expect(c.tienda_nombre).toBe('');
  });

  test('una clave numérica con basura vuelve a su valor por defecto', () => {
    const { ctx, libro } = panelInstalado();
    const h = libro.getSheetByName('config');
    const filas = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues().map((f) => f[0]);
    h.getRange(filas.indexOf('dias_nuevo') + 2, 2).setValue('muchos');
    expect(ctx.leerConfig_().dias_nuevo).toBe(30);
  });
});
