import { describe, it, expect } from 'vitest';
import { cargarParcial } from './cargar-parcial.mjs';

const { Panel } = cargarParcial(['ui/js/util', 'ui/js/validar', 'ui/js/logica']);
const L = Panel.logica;

const prod = (o) => ({ id: 'p', codigo: 'VES-001', nombre: 'Vestido Niña Margaritas', categoria_id: 'c1', estado: 'publicado', fotos: ['a'], precio_regular: 89, creado_en: '2026-11-01T00:00:00-05:00', ...o });

describe('productos', () => {
  const lista = [
    prod({ id: '1', nombre: 'Vestido Lino Coral', codigo: 'VES-001' }),
    prod({ id: '2', nombre: 'Blusa Mostaza', codigo: 'BLU-001', categoria_id: 'c2', estado: 'borrador', fotos: [] }),
    prod({ id: '3', nombre: 'Pantalón Palazzo', codigo: 'PAN-001', categoria_id: 'c3', precio_regular: null }),
    prod({ id: '4', nombre: 'Cinturón viejo', codigo: 'ACC-003', estado: 'archivado' }),
  ];
  const ids = (r) => r.map((x) => x.id);

  it('por defecto no muestra los archivados', () => {
    expect(ids(L.filtrarProductos(lista, {}))).toEqual(['1', '2', '3']);
    expect(ids(L.filtrarProductos(lista, { estado: 'archivado' }))).toEqual(['4']);
  });
  it('busca por nombre o código, sin tildes ni mayúsculas', () => {
    expect(ids(L.filtrarProductos(lista, { texto: 'pantalon' }))).toEqual(['3']);
    expect(ids(L.filtrarProductos(lista, { texto: 'blu-001' }))).toEqual(['2']);
    expect(ids(L.filtrarProductos(lista, { texto: 'vestido coral' }))).toEqual(['1']);
  });
  it('filtra por categoría, estado, sin foto y sin precio', () => {
    expect(ids(L.filtrarProductos(lista, { categoria: 'c2' }))).toEqual(['2']);
    expect(ids(L.filtrarProductos(lista, { estado: 'borrador' }))).toEqual(['2']);
    expect(ids(L.filtrarProductos(lista, { sinFoto: true }))).toEqual(['2']);
    expect(ids(L.filtrarProductos(lista, { sinPrecio: true }))).toEqual(['3']);
  });
  it('ordena por recientes, nombre o código', () => {
    const l = [prod({ id: 'a', nombre: 'Zapato', codigo: 'ACC-002', creado_en: '2026-11-02T00:00:00-05:00' }), prod({ id: 'b', nombre: 'Árbol', codigo: 'ACC-001', creado_en: '2026-11-03T00:00:00-05:00' })];
    expect(ids(L.ordenarProductos(l, 'recientes'))).toEqual(['b', 'a']);
    expect(ids(L.ordenarProductos(l, 'nombre'))).toEqual(['b', 'a']);
    expect(ids(L.ordenarProductos(l, 'codigo'))).toEqual(['b', 'a']);
  });
  it('textoFaltantes dice qué falta para publicar', () => {
    expect(L.textoFaltantes(prod({ nombre: '', precio_regular: null, fotos: [] }))).toBe('Para publicarla falta: nombre, precio y foto.');
    expect(L.textoFaltantes(prod({ fotos: [] }))).toBe('Para publicarla falta: foto.');
    expect(L.textoFaltantes(prod())).toBe('');
  });
  it('resumenAltaRapida cuenta borradores y fotos que fallaron', () => {
    expect(L.resumenAltaRapida([{ estado: 'listo' }, { estado: 'listo' }, { estado: 'listo' }], 3)).toBe('Creé 3 borradores. Completa el nombre y el precio de cada uno.');
    expect(L.resumenAltaRapida([{ estado: 'listo' }, { estado: 'error' }], 1)).toBe('Creé 1 borrador. 1 foto no se pudo subir. Completa el nombre y el precio.');
    expect(L.resumenAltaRapida([{ estado: 'error' }, { estado: 'error' }], 0)).toBe('No pude subir ninguna foto.');
  });
});

describe('categorías', () => {
  it('prefijoDeCategoria usa las 3 primeras letras sin tildes en mayúscula', () => {
    expect(L.prefijoDeCategoria('Vestidos', [])).toBe('VES');
    expect(L.prefijoDeCategoria('Blusas y tops', [])).toBe('BLU');
    expect(L.prefijoDeCategoria('Ñandú', [])).toBe('NAN');
    expect(L.prefijoDeCategoria('Ab', [])).toBe('ABX');
  });
  it('si el prefijo ya existe busca otro con las letras del nombre y, si no, con A–Z', () => {
    expect(L.prefijoDeCategoria('Vestidos', ['VES'])).toBe('VET');
    expect(L.prefijoDeCategoria('Vestidos', ['VES', 'VET'])).toBe('VEI');
    expect(L.prefijoDeCategoria('Abc', ['ABC'])).toBe('ABA');
  });
});

describe('historial legible', () => {
  const ctx = { etiqueta: (entidad, id) => (id === 'p1' ? 'VES-001' : id), simbolo: 'S/' };
  it('edición de precio', () => {
    const h = { accion: 'editar', entidad: 'productos', entidad_id: 'p1', campo: 'precio_regular', antes: '89', despues: '79' };
    expect(L.describirCambio(h, ctx)).toBe('Cambiaste el precio de VES-001: S/ 89 → S/ 79');
  });
  it('textos, listas y booleanos', () => {
    expect(L.describirCambio({ accion: 'editar', entidad: 'productos', entidad_id: 'p1', campo: 'nombre', antes: '"A"', despues: '"B"' }, ctx)).toBe('Cambiaste el nombre de VES-001: A → B');
    expect(L.describirCambio({ accion: 'editar', entidad: 'productos', entidad_id: 'p1', campo: 'tallas', antes: '["S"]', despues: '["S","M"]' }, ctx)).toBe('Cambiaste las tallas de VES-001: S → S, M');
    expect(L.describirCambio({ accion: 'editar', entidad: 'ofertas', entidad_id: 'o1', campo: 'activa', antes: 'true', despues: 'false' }, ctx)).toBe('Cambiaste el dato «activa» de o1: sí → no');
  });
  it('crear, eliminar, archivar, reordenar y deshacer', () => {
    expect(L.describirCambio({ accion: 'crear', entidad: 'productos', entidad_id: 'p1' }, ctx)).toBe('Creaste la prenda VES-001');
    expect(L.describirCambio({ accion: 'eliminar', entidad: 'productos', entidad_id: 'p1' }, ctx)).toBe('Archivaste la prenda VES-001');
    expect(L.describirCambio({ accion: 'eliminar', entidad: 'ofertas', entidad_id: 'o1' }, ctx)).toBe('Eliminaste la oferta o1');
    expect(L.describirCambio({ accion: 'reordenar', entidad: 'secciones', entidad_id: '' }, ctx)).toBe('Cambiaste el orden de las secciones');
    expect(L.describirCambio({ accion: 'deshacer', entidad: 'productos', entidad_id: 'p1', campo: 'nombre', antes: '"B"', despues: '"A"' }, ctx)).toBe('Deshiciste el cambio en el nombre de VES-001');
  });
  it('recorta valores largos', () => {
    const largo = 'x'.repeat(100);
    const t = L.describirCambio({ accion: 'editar', entidad: 'productos', entidad_id: 'p1', campo: 'descripcion', antes: '""', despues: JSON.stringify(largo) }, ctx);
    expect(t.length).toBeLessThan(120);
    expect(t).toContain('…');
  });
});

describe('temporadas', () => {
  const ahora = new Date('2026-12-10T12:00:00-05:00');
  const t = (o) => ({ activa_manual: '', desde: '2026-12-01T00:00:00-05:00', hasta: '2027-03-01T00:00:00-05:00', ...o });
  it('estadoTemporada', () => {
    expect(L.estadoTemporada(t(), ahora).texto).toBe('Activa ahora');
    expect(L.estadoTemporada(t({ desde: '2027-01-01T00:00:00-05:00' }), ahora).texto).toBe('Programada');
    expect(L.estadoTemporada(t({ hasta: '2026-12-05T00:00:00-05:00' }), ahora).texto).toBe('Terminada');
    expect(L.estadoTemporada(t({ activa_manual: 'si', hasta: '2026-12-05T00:00:00-05:00' }), ahora).texto).toBe('Activa (forzada)');
    expect(L.estadoTemporada(t({ activa_manual: 'no' }), ahora).texto).toBe('Apagada');
    expect(L.estadoTemporada(t({ desde: null, hasta: null }), ahora).texto).toBe('Activa ahora');
  });
  it('urlVistaPrevia termina en /temporada/<slug>/', () => {
    expect(L.urlVistaPrevia('https://x.github.io/catalogo-ropa/', 'verano-2027')).toBe('https://x.github.io/catalogo-ropa/temporada/verano-2027/');
    expect(L.urlVistaPrevia('https://x.github.io/catalogo-ropa', 'verano-2027')).toBe('https://x.github.io/catalogo-ropa/temporada/verano-2027/');
    expect(L.urlVistaPrevia('', 'x')).toBe('');
  });
  it('variablesPaleta pasa solo los 16 tokens y el radio', () => {
    const tokens = { '--color-fondo': '#FFFFFF', '--color-texto': '#000000', '--raro': 'x' };
    expect(L.variablesPaleta(tokens, '16px')).toEqual({ '--p-fondo': '#FFFFFF', '--p-texto': '#000000', '--p-radio': '16px' });
  });
  it('vigenciaTexto', () => {
    expect(L.vigenciaTexto({ vigencia_dias: null }, 15)).toMatch(/15 días/);
    expect(L.vigenciaTexto({ vigencia_dias: 7 }, 15)).toMatch(/7 días/);
    expect(L.vigenciaTexto({ vigencia_dias: 1 }, 15)).toMatch(/1 día\b/);
  });
  it('mesesDeUso', () => {
    expect(L.mesesDeUso('12, 1, 2, 3')).toBe('dic, ene, feb, mar');
    expect(L.mesesDeUso('')).toBe('');
  });
});

describe('ofertas', () => {
  const ahora = new Date('2026-12-10T12:00:00-05:00');
  const o = (x) => ({ activa: true, desde: null, hasta: null, ...x });
  it('estadoOferta', () => {
    expect(L.estadoOferta(o({}), ahora).texto).toBe('Activa');
    expect(L.estadoOferta(o({ activa: false }), ahora).texto).toBe('Apagada');
    expect(L.estadoOferta(o({ desde: '2026-12-20T00:00:00-05:00' }), ahora).texto).toBe('Programada');
    expect(L.estadoOferta(o({ hasta: '2026-12-01T00:00:00-05:00' }), ahora).texto).toBe('Vencida');
  });
  it('descripcionOferta', () => {
    const nombres = (alcance, id) => ({ c1: 'Vestidos', p1: 'Vestido Lino', t1: 'Verano' })[id] ?? id;
    expect(L.descripcionOferta({ tipo: 'porcentaje', valor: 25, alcance: 'categoria', objetivos: ['c1'] }, nombres)).toBe('25 % menos en la categoría Vestidos');
    expect(L.descripcionOferta({ tipo: 'monto', valor: 10, alcance: 'tienda', objetivos: [] }, nombres)).toBe('S/ 10 menos en toda la tienda');
    expect(L.descripcionOferta({ tipo: 'precio_final', valor: 59, alcance: 'producto', objetivos: ['p1'] }, nombres)).toBe('Precio final S/ 59 en Vestido Lino');
    expect(L.descripcionOferta({ tipo: 'porcentaje', valor: 30, alcance: 'producto', objetivos: ['a', 'b', 'c'] }, nombres)).toBe('30 % menos en 3 prendas');
    expect(L.descripcionOferta({ tipo: 'porcentaje', valor: 20, alcance: 'temporada', objetivos: ['t1'] }, nombres)).toBe('20 % menos en la temporada Verano');
  });
  it('ofertaLiquidacion nace apagada, sin cuenta regresiva y marcada como liquidación', () => {
    const l = L.ofertaLiquidacion();
    expect(l).toMatchObject({ es_liquidacion: true, activa: false, cuenta_regresiva: false, etiqueta: 'Liquidación', tipo: 'porcentaje', alcance: 'tienda' });
    expect(l.valor).toBeGreaterThan(0);
  });
  it('rutasDeDestino arma las páginas a las que puede llevar el botón de una portada', () => {
    const r = L.rutasDeDestino(
      [{ slug: 'vestidos', nombre: 'Vestidos' }],
      [{ slug: 'verano-2027', nombre: 'Verano 2027' }],
      [{ codigo: 'VES-014', nombre: 'Vestido Lino', estado: 'publicado' }, { codigo: 'XXX-001', nombre: 'Borrador', estado: 'borrador' }],
    );
    const valores = r.map((x) => x.valor);
    expect(valores).toContain('/temporada/verano-2027/');
    expect(valores).toContain('/catalogo/?categoria=vestidos');
    expect(valores).toContain('/p/ves-014/');
    expect(valores).not.toContain('/p/xxx-001/');
    expect(valores).toContain('/catalogo/');
    expect(r.every((x) => x.texto)).toBe(true);
  });
});

describe('textos de la web', () => {
  it('agruparTextos agrupa por el primer segmento y deja fuera las plantillas de WhatsApp', () => {
    const grupos = L.agruparTextos({ 'inicio.portada.titulo': 'A', 'tienda.eslogan': 'B', 'whatsapp.producto': 'X', 'inicio.portada.boton': 'C' });
    expect(grupos.map((g) => g.id)).toEqual(['tienda', 'inicio']);
    expect(grupos[1].titulo).toBe('Inicio');
    expect(grupos[1].claves.map((c) => c.clave)).toEqual(['inicio.portada.boton', 'inicio.portada.titulo']);
  });
  it('etiquetaTexto', () => {
    expect(L.etiquetaTexto('inicio.portada.titulo')).toBe('Portada · Título');
    expect(L.etiquetaTexto('tienda.eslogan')).toBe('Eslogan');
    expect(L.etiquetaTexto('producto.boton_whatsapp')).toBe('Botón whatsapp');
  });
});

describe('WhatsApp', () => {
  const textos = {
    'whatsapp.producto': 'Hola {vendedora}, me interesa:\n{producto} (código {codigo})\nTalla: {talla}\nColor: {color}\nPrecio: {precio}\n{enlace}',
    'whatsapp.lista': 'Hola {vendedora}, mi lista:\n{lista}\nTotal: {total}',
    'whatsapp.revista': 'Hola {vendedora}, vi en la revista:\n{producto} (código {codigo})\nPrecio: {precio}\n{enlace}',
  };
  const productos = [
    { codigo: 'VES-001', nombre: 'Vestido Lino', precio_regular: 89, tallas: ['S', 'M'], colores: ['Coral'] },
    { codigo: 'BLU-002', nombre: 'Blusa', precio_regular: 89, tallas: [], colores: [] },
  ];
  it('arma las tres vistas previas con datos de ejemplo reales de la tienda', () => {
    const r = L.vistaPreviaWhatsapp(textos, { vendedora: 'Ana', productos, sitioUrl: 'https://x.test/c/', simbolo: 'S/' });
    expect(r.producto).toContain('Hola Ana');
    expect(r.producto).toContain('Vestido Lino (código VES-001)');
    expect(r.producto).toContain('Talla: S');
    expect(r.producto).toContain('Precio: S/ 89');
    expect(r.producto).toContain('https://x.test/c/p/ves-001/');
    expect(r.revista).not.toContain('Talla');
    expect(r.lista).toContain('- Vestido Lino (VES-001) · S · Coral · S/ 89');
    expect(r.lista).toContain('- Blusa (BLU-002) · S/ 89');
    expect(r.lista).toContain('Total: S/ 178');
  });
  it('sin productos usa un ejemplo y lo dice', () => {
    const r = L.vistaPreviaWhatsapp(textos, { vendedora: '', productos: [], sitioUrl: '', simbolo: 'S/' });
    expect(r.producto).toContain('Hola');
    expect(r.ejemplo).toBe(true);
  });
});

describe('colores', () => {
  it('agruparPaletas separa predefinidas y propias', () => {
    const g = L.agruparPaletas([{ id: 'a', origen: 'predefinida' }, { id: 'pal_1', origen: 'propia' }]);
    expect(g.predefinidas.map((p) => p.id)).toEqual(['a']);
    expect(g.propias.map((p) => p.id)).toEqual(['pal_1']);
  });
  it('nombreDeCopia no repite nombres', () => {
    expect(L.nombreDeCopia('Verano Costa', [])).toBe('Mi Verano Costa');
    expect(L.nombreDeCopia('Verano Costa', [{ nombre: 'Mi Verano Costa' }])).toBe('Mi Verano Costa 2');
    expect(L.nombreDeCopia('Verano Costa', [{ nombre: 'Mi Verano Costa' }, { nombre: 'Mi Verano Costa 2' }])).toBe('Mi Verano Costa 3');
  });
});
