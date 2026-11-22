// La copia publicada: contenido, campos calculados y que pase validarCatalogo.
import { describe, test, expect } from 'vitest';
import { validarCatalogo } from '@catalogo/contratos';
import { tiendaDeEjemplo } from './escenario.mjs';

function armar(t, ahora) {
  const fecha = ahora ?? t.ctx.ahora_();
  return t.ctx.armarCatalogo_(t.ctx.leerDatosParaPublicar_(fecha), fecha, t.ctx.resolverFotoDrive_);
}
const version = (t, entidad, id) => t.ctx.listar(entidad, { filtro: { id }, incluir_archivados: true }).filas[0].version;
const copia = (t, ahora) => JSON.parse(JSON.stringify(armar(t, ahora).catalogo));

describe('la copia cumple el contrato', () => {
  test('la tienda de ejemplo pasa validarCatalogo', () => {
    const t = tiendaDeEjemplo();
    const c = copia(t);
    expect(validarCatalogo(c)).toEqual({ ok: true, errores: [] });
  });

  test('sigue válida en otros momentos (antes, durante y después de la oferta)', () => {
    const t = tiendaDeEjemplo();
    for (const dia of ['2026-11-25T12:00:00-05:00', '2026-12-05T12:00:00-05:00', '2026-12-09T23:59:00-05:00', '2026-12-10T00:00:00-05:00', '2027-01-15T12:00:00-05:00']) {
      const r = validarCatalogo(copia(t, new Date(dia)));
      expect(r.errores, dia).toEqual([]);
    }
  });

  test('una tienda mínima (sin temporada, portadas ni secciones) también es válida', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('temporadas', t.ids.temporada.id, 'activa_manual', 'no', 1);
    t.ctx.guardarCampos('temporadas', t.ids.temporada.id, { visible_en_web: false, revista: false }, 2);
    const c = copia(t);
    expect(c.temporadas).toEqual([]);
    expect(c.temporada_activa_id).toBe(null);
    expect(c.portadas).toEqual([]);
    expect(validarCatalogo(c).errores).toEqual([]);
  });
});

describe('qué se publica', () => {
  test('solo prendas publicadas o agotadas; borradores y archivadas no', () => {
    const t = tiendaDeEjemplo();
    const c = copia(t);
    expect(c.productos.map((p) => p.codigo).sort()).toEqual(['FAL-001', 'VES-001', 'VES-002']);
    expect(c.productos.find((p) => p.codigo === 'FAL-001')).toMatchObject({ estado: 'agotado', tallas_agotadas: ['S'] });
  });

  test('una categoría oculta oculta sus prendas', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('categorias', t.ids.faldas.id, 'visible', false, 1);
    const c = copia(t);
    expect(c.categorias.map((x) => x.slug)).toEqual(['vestidos']);
    expect(c.productos.map((p) => p.codigo).sort()).toEqual(['VES-001', 'VES-002']);
    expect(validarCatalogo(c).errores).toEqual([]);
  });

  test('las vendedoras son solo las activas y una prenda con vendedora inactiva usa la de por defecto', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('productos', t.ids.v2.id, 'vendedora_id', t.ids.bea.id, 2);
    t.ctx.guardarCampo('vendedoras', t.ids.bea.id, 'activa', false, 1);
    const c = copia(t);
    expect(c.vendedoras.map((v) => v.nombre)).toEqual(['Ana']);
    expect(c.productos.find((p) => p.codigo === 'VES-002').vendedora_id).toBe(null);
  });

  test('los textos no incluyen las claves que empiezan con _', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarTexto('pie.horario', 'Lunes a sábado');
    const tabla = t.ctx.leerTabla_('textos');
    t.ctx.agregarFilas_('textos', tabla, [{ clave: '_nota', valor: 'interna', version: 1 }]);
    const c = copia(t);
    expect(c.textos['pie.horario']).toBe('Lunes a sábado');
    expect('_nota' in c.textos).toBe(false);
  });

  test('las paletas son las usadas: la del tema y las de las temporadas', () => {
    const t = tiendaDeEjemplo();
    const c = copia(t);
    expect(c.tema_paleta_id).toBe('verano-costa');
    expect(Object.keys(c.paletas)).toEqual(['verano-costa']);
    expect(c.paletas['verano-costa']).toMatchObject({ nombre: 'Verano Costa', fuentes: { titulos: 'Poppins', texto: 'Nunito Sans' }, radio: '16px' });
    expect(Object.keys(c.paletas['verano-costa'].tokens)).toHaveLength(16);
    // sin temporada activa, el tema es la paleta por defecto de la tienda
    t.ctx.guardarCampo('temporadas', t.ids.temporada.id, 'activa_manual', 'no', 1);
    const sin = copia(t);
    expect(sin.tema_paleta_id).toBe('neutra-minimal');
    expect(Object.keys(sin.paletas).sort()).toEqual(['neutra-minimal', 'verano-costa']); // la temporada sigue visible: su paleta viaja
  });

  test('la tienda sale con su configuración; las redes vacías son null', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarConfig('envios', 'A todo el Perú');
    const { tienda } = copia(t);
    expect(tienda).toMatchObject({
      nombre: 'Tienda Prueba', moneda: { simbolo: 'S/', codigo: 'PEN' }, pais_codigo: '51', zona_horaria: 'America/Lima',
      redes: { instagram: 'mi.tienda', facebook: null, tiktok: null }, envios: 'A todo el Perú', inicio_modo: 'temporada', logo: null,
      sitio_url: 'https://cayogabriel.github.io/catalogo-ropa/',
    });
  });

  test('el logo, si está configurado, viaja como foto', () => {
    const t = tiendaDeEjemplo();
    const logo = t.ctx.subirFoto({ nombre: 'logo.jpg', mime: 'image/jpeg', base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xd9]).toString('base64'), destino: 'marca' }).id;
    t.ctx.guardarConfig('logo', logo);
    const c = copia(t);
    expect(c.tienda.logo).toEqual({ id: logo, alt: 'Logo de Tienda Prueba' });
    expect(logo in c.fotos).toBe(true);
    expect(validarCatalogo(c).errores).toEqual([]);
  });
});

describe('fotos: lista blanca exacta y «actualizado»', () => {
  test('el índice tiene exactamente las fotos usadas, con su última modificación en Drive (-05:00)', () => {
    const t = tiendaDeEjemplo();
    const c = copia(t);
    const usadas = new Set([...t.fotos.slice(0, 4), t.fotos[6], t.fotos[7]]); // la 4 es de un borrador y la 5 de una archivada: no se publican
    expect(new Set(Object.keys(c.fotos))).toEqual(usadas);
    for (const id of usadas) {
      const archivo = t.dobles.DriveApp.getFileById(id);
      expect(c.fotos[id].actualizado).toBe(t.dobles.Utilities.formatDate(archivo.getLastUpdated(), 'America/Lima', "yyyy-MM-dd'T'HH:mm:ssXXX"));
    }
  });

  test('«actualizado» no cambia al volver a armar la copia (la caché de fotos del workflow no se invalida)', () => {
    const t = tiendaDeEjemplo();
    const a = copia(t).fotos;
    t.dobles._reloj.saltar(3_600_000);
    expect(copia(t).fotos).toEqual(a);
  });

  test('si una foto cambia en Drive, su «actualizado» cambia', () => {
    const t = tiendaDeEjemplo();
    const antes = copia(t).fotos[t.fotos[0]].actualizado;
    t.dobles._drive.fijarActualizado(t.fotos[0], '2026-12-02T08:00:00-05:00');
    expect(copia(t).fotos[t.fotos[0]].actualizado).toBe('2026-12-02T08:00:00-05:00');
    expect(antes).not.toBe('2026-12-02T08:00:00-05:00');
  });

  test('una foto en la papelera o borrada: invalido con su id y el código de la prenda', () => {
    const t = tiendaDeEjemplo();
    t.dobles.DriveApp.getFileById(t.fotos[1]).setTrashed(true);
    expect(() => armar(t)).toThrow(`invalido: la foto ${t.fotos[1]} de VES-001 ya no está en Drive`);
  });

  test('un archivo que no es imagen no sirve como foto', () => {
    const t = tiendaDeEjemplo();
    const doc = t.dobles.DriveApp.createFile('notas', 'x', 'application/vnd.google-apps.document');
    t.ctx.guardarCampo('productos', t.ids.v2.id, 'fotos', [doc.getId()], 2);
    expect(() => armar(t)).toThrow(/^invalido: la foto .* de VES-002 no es una imagen/);
  });

  test('las fotos de la portada, de la temporada y de la categoría también se comprueban', () => {
    const t = tiendaDeEjemplo();
    t.dobles.DriveApp.getFileById(t.fotos[7]).setTrashed(true);
    expect(() => armar(t)).toThrow(/la foto .* de la temporada «Verano 2027» ya no está en Drive/);
  });
});

describe('antes de nada', () => {
  test('sin nombre de tienda lanza invalido sin consultar Drive', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarConfig('tienda_nombre', '');
    t.dobles._drive.llamadas.getFileById.length = 0;
    expect(() => armar(t)).toThrow(/^invalido: la tienda todavía no tiene nombre/);
    expect(t.dobles._drive.llamadas.getFileById).toEqual([]);
  });

  test('una vendedora activa a medias no se publica y el mensaje dice qué le falta', () => {
    const t = tiendaDeEjemplo();
    const bea = t.ids.bea.id;
    t.ctx.guardarCampo('vendedoras', bea, 'nombre', '', version(t, 'vendedoras', bea));
    expect(() => armar(t)).toThrow(/una vendedora activa no tiene nombre/);
    t.ctx.guardarCampo('vendedoras', bea, 'nombre', 'Bea', version(t, 'vendedoras', bea));
    t.ctx.guardarCampo('vendedoras', bea, 'whatsapp', '', version(t, 'vendedoras', bea));
    expect(() => armar(t)).toThrow(/a la vendedora «Bea» le falta su número de WhatsApp/);
  });

  test('sin vendedora activa, o con dos por defecto, lanza invalido', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('vendedoras');
    tabla.filas.forEach((v) => {
      v.por_defecto = true; // hecho a mano en la hoja: dos por defecto
      t.ctx.escribirFila_('vendedoras', tabla, v);
    });
    expect(() => armar(t)).toThrow(/exactamente una vendedora activa por defecto/);
    tabla.filas.forEach((v) => {
      v.activa = false;
      t.ctx.escribirFila_('vendedoras', tabla, v);
    });
    expect(() => armar(t)).toThrow(/falta al menos una vendedora activa/);
  });

  test('una prenda publicada a mano sin foto o sin precio lanza invalido con su código', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('productos');
    const fila = tabla.filas.find((p) => p.id === t.ids.v1.id);
    fila.fotos = [];
    t.ctx.escribirFila_('productos', tabla, fila);
    expect(() => armar(t)).toThrow('invalido: la prenda VES-001 no tiene fotos');
  });
});

describe('campos calculados de la prenda', () => {
  test('nuevo: dentro de los días configurados desde que se publicó por primera vez', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('productos');
    const f = tabla.filas.find((p) => p.id === t.ids.v2.id);
    f.publicado_en = '2026-10-01T10:00:00-05:00'; // hace 61 días
    t.ctx.escribirFila_('productos', tabla, f);
    const c = copia(t);
    expect(c.productos.find((p) => p.codigo === 'VES-002').nuevo).toBe(false);
    expect(c.productos.find((p) => p.codigo === 'VES-001').nuevo).toBe(true); // sin publicado_en: se publica ahora
  });

  test('ultimas_unidades solo con stock real: 1 a 3 sí; vacío o 0 no', () => {
    const t = tiendaDeEjemplo();
    const g = (stock) => {
      t.ctx.guardarCampo('productos', t.ids.v1.id, 'stock', stock, t.ctx.listar('productos', { filtro: { id: t.ids.v1.id } }).filas[0].version);
      return copia(t).productos.find((p) => p.codigo === 'VES-001').ultimas_unidades;
    };
    expect([g(2), g(3), g(4), g(null), g(0)]).toEqual([true, true, false, false, false]);
    t.ctx.guardarConfig('umbral_ultimas_unidades', 5);
    expect(g(5)).toBe(true);
  });

  test('popularidad: solo con clics reales de WhatsApp (mínimo 3 en 30 días), 1 = el más consultado', () => {
    const t = tiendaDeEjemplo();
    const evento = (producto, n) =>
      t.ctx.agregarFilas_('eventos', t.ctx.leerTabla_('eventos'), Array.from({ length: n }, () => ({ fecha: '2026-11-28T10:00:00-05:00', tipo: 'whatsapp', producto_id: producto, temporada_id: '', origen: 'web', pagina: '/', sesion: 'abcdefgh' })));
    evento(t.ids.v2.id, 5);
    evento(t.ids.v1.id, 3);
    evento(t.ids.f1.id, 2);
    const por = Object.fromEntries(copia(t).productos.map((p) => [p.codigo, p.popularidad]));
    expect(por).toEqual({ 'VES-002': 1, 'VES-001': 2, 'FAL-001': null });
  });

  test('sin clics nadie es «más consultado»', () => {
    const t = tiendaDeEjemplo();
    expect(copia(t).productos.every((p) => p.popularidad === null)).toBe(true);
  });
});

describe('precios dentro de la copia', () => {
  test('la oferta sale como ventanas contiguas y el redondeo de la tienda se aplica', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarConfig('redondeo', 'entero');
    const v1 = copia(t).productos.find((p) => p.codigo === 'VES-001');
    expect(v1.precio.regular).toBe(89);
    expect(v1.precio.ventanas.map((v) => [v.desde, v.hasta, v.precio, v.descuento_pct])).toEqual([
      [null, '2026-12-10T00:00:00-05:00', 66, 25],
      ['2026-12-10T00:00:00-05:00', null, 89, null],
    ]);
    expect(v1.precio.ventanas[0]).toMatchObject({ antes: 89, cuenta_regresiva: true, oferta_id: t.ids.oferta.id });
  });

  test('una oferta de la temporada alcanza a las prendas de sus fotos', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('ofertas', { nombre: 'Temporada', tipo: 'monto', valor: 10, alcance: 'temporada', objetivos: [t.ids.temporada.id], activa: true });
    const v2 = copia(t).productos.find((p) => p.codigo === 'VES-002');
    expect(v2.precio.ventanas[0]).toMatchObject({ precio: 110, antes: 120 });
  });
});

describe('temporada activa y vigencia de la revista', () => {
  test('la forzada «si» gana; «no» la apaga; sin forzar, la que contiene hoy con el desde más reciente', () => {
    const t = tiendaDeEjemplo();
    const { ctx, ids } = t;
    const vieja = ctx.crear('temporadas', { nombre: 'Vieja', foto_portada: t.fotos[6], desde: '2026-10-01T00:00:00-05:00', hasta: '2027-02-01T00:00:00-05:00' });
    const nueva = ctx.crear('temporadas', { nombre: 'Nueva', foto_portada: t.fotos[6], desde: '2026-11-20T00:00:00-05:00', hasta: '2027-02-01T00:00:00-05:00' });
    expect(copia(t).temporada_activa_id).toBe(ids.temporada.id); // la forzada
    ctx.guardarCampo('temporadas', ids.temporada.id, 'activa_manual', '', version(t, 'temporadas', ids.temporada.id));
    ctx.guardarCampo('temporadas', ids.temporada.id, 'desde', '2026-01-01T00:00:00-05:00', version(t, 'temporadas', ids.temporada.id));
    expect(copia(t).temporada_activa_id).toBe(nueva.id);
    ctx.guardarCampo('temporadas', nueva.id, 'activa_manual', 'no', 1);
    expect(copia(t).temporada_activa_id).toBe(vieja.id);
    expect(copia(t, new Date('2027-03-01T12:00:00-05:00')).temporada_activa_id).toBe(ids.temporada.id); // sin fechas, no vence
    ctx.guardarCampo('temporadas', ids.temporada.id, 'activa_manual', 'no', version(t, 'temporadas', ids.temporada.id));
    expect(copia(t, new Date('2027-03-01T12:00:00-05:00')).temporada_activa_id).toBe(null);
  });

  test('vigencia = hoy + días de la tienda (15 por defecto) o los de la temporada', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('ofertas', t.ids.oferta.id, 'activa', false, 1);
    expect(copia(t).temporadas[0].vigencia_hasta).toBe('2026-12-16');
    t.ctx.guardarCampo('temporadas', t.ids.temporada.id, 'vigencia_dias', 7, version(t, 'temporadas', t.ids.temporada.id));
    expect(copia(t).temporadas[0].vigencia_hasta).toBe('2026-12-08');
    t.ctx.guardarConfig('vigencia_dias_defecto', 30);
    t.ctx.guardarCampo('temporadas', t.ids.temporada.id, 'vigencia_dias', null, version(t, 'temporadas', t.ids.temporada.id));
    expect(copia(t).temporadas[0].vigencia_hasta).toBe('2026-12-31');
  });

  test('si una prenda tiene una oferta que termina antes, la vigencia no pasa del último día de esa oferta', () => {
    const t = tiendaDeEjemplo();
    // La oferta de VES-001 termina el 10/12 a las 00:00: su último día es el 9/12.
    const c = copia(t);
    expect(c.temporadas[0].vigencia_hasta).toBe('2026-12-09');
    expect(validarCatalogo(c).errores).toEqual([]);
  });

  test('la oferta más próxima manda, aunque haya otras que terminan después', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('ofertas', { nombre: 'Rojo', valor: 10, alcance: 'producto', objetivos: [t.ids.v2.id], hasta: '2026-12-04T12:00:00-05:00', activa: true });
    expect(copia(t).temporadas[0].vigencia_hasta).toBe('2026-12-04');
  });

  test('una oferta que empieza más adelante también limita: los precios impresos cambiarían ese día', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('ofertas', { nombre: 'Futura', valor: 10, alcance: 'producto', objetivos: [t.ids.v2.id], desde: '2026-12-03T00:00:00-05:00', hasta: '2026-12-04T00:00:00-05:00', activa: true });
    const c = copia(t);
    expect(c.temporadas[0].vigencia_hasta).toBe('2026-12-02');
    expect(validarCatalogo(c).errores).toEqual([]);
  });
});

describe('secciones y portadas', () => {
  test('manual conserva el orden elegido; las automáticas se calculan con lo publicado', () => {
    const t = tiendaDeEjemplo();
    const c = copia(t);
    const sec = Object.fromEntries(c.secciones.map((s) => [s.titulo, s.productos]));
    expect(sec.Favoritas).toEqual([t.ids.v2.id, t.ids.v1.id]);
    expect(new Set(sec.Novedades)).toEqual(new Set([t.ids.v1.id, t.ids.v2.id, t.ids.f1.id]));
    expect(sec.Ofertas).toEqual([t.ids.v1.id]);
  });

  test('«Ofertas» y «Liquidación» no se mezclan', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('secciones', { titulo: 'Liquidación', tipo: 'liquidacion' });
    t.ctx.crear('ofertas', { nombre: 'Liq', valor: 50, alcance: 'producto', objetivos: [t.ids.f1.id], es_liquidacion: true, activa: true });
    const sec = Object.fromEntries(copia(t).secciones.map((s) => [s.titulo, s.productos]));
    expect(sec.Liquidación).toEqual([t.ids.f1.id]);
    expect(sec.Ofertas).toEqual([t.ids.v1.id]);
  });

  test('respetan el límite (12 por defecto), ocultan las no visibles y filtran por temporada', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('secciones', t.ids.manual.id, 'limite', 1, 1);
    t.ctx.guardarCampo('secciones', t.ids.novedades.id, 'visible', false, 1);
    const otra = t.ctx.crear('temporadas', { nombre: 'Otra' });
    t.ctx.crear('secciones', { titulo: 'Solo otra', tipo: 'manual', productos: [t.ids.v1.id], temporada_id: otra.id });
    t.ctx.crear('secciones', { titulo: 'Solo verano', tipo: 'manual', productos: [t.ids.v1.id], temporada_id: t.ids.temporada.id });
    const sec = Object.fromEntries(copia(t).secciones.map((s) => [s.titulo, s.productos]));
    expect(Object.keys(sec).sort()).toEqual(['Favoritas', 'Ofertas', 'Solo verano']);
    expect(sec.Favoritas).toEqual([t.ids.v2.id]);
  });

  test('una sección de categoría trae las prendas de esa categoría', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('secciones', { titulo: 'Faldas', tipo: 'categoria', parametro: t.ids.faldas.id });
    expect(copia(t).secciones.find((s) => s.titulo === 'Faldas').productos).toEqual([t.ids.f1.id]);
  });

  test('portadas: solo activas, de la temporada activa o de todas, y sin las vencidas', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('portadas', { titulo: 'General', foto_escritorio: t.fotos[6], activa: true });
    t.ctx.crear('portadas', { titulo: 'Apagada', foto_escritorio: t.fotos[6], activa: false });
    t.ctx.crear('portadas', { titulo: 'Vencida', foto_escritorio: t.fotos[6], activa: true, hasta: '2026-11-30T00:00:00-05:00' });
    const otra = t.ctx.crear('temporadas', { nombre: 'Otra' });
    t.ctx.crear('portadas', { titulo: 'De otra', foto_escritorio: t.fotos[6], activa: true, temporada_id: otra.id });
    expect(copia(t).portadas.map((p) => p.titulo)).toEqual(['Verano', 'General']);
  });

  test('una portada activa sin foto lanza invalido', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('portadas');
    tabla.filas[0].foto_escritorio = '';
    t.ctx.escribirFila_('portadas', tabla, tabla.filas[0]);
    expect(() => armar(t)).toThrow(/la portada «Verano» no tiene foto/);
  });
});

describe('temporadas y sus fotos', () => {
  test('las fotos van en su orden con las prendas publicadas que aparecen y un texto alternativo', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('temporada_fotos', t.ids.fotoT2.id, 'productos', [t.ids.v2.id, t.ids.borrador.id], 1);
    const [tem] = copia(t).temporadas;
    expect(tem.fotos.map((f) => f.id)).toEqual([t.ids.fotoT1.id, t.ids.fotoT2.id]);
    expect(tem.fotos[1].productos).toEqual([t.ids.v2.id]); // el borrador no se publica
    expect(tem.fotos[0].foto.alt).toBe('Vestido Lino'); // armado con la prenda
    expect(tem.foto_portada.alt).toBe('Portada de la temporada Verano 2027');
  });

  test('una temporada que no está activa, ni visible, ni con revista no se publica (ni sus fotos)', () => {
    const t = tiendaDeEjemplo();
    const borrador = t.ctx.crear('temporadas', { nombre: 'Futura', foto_portada: t.fotos[4] });
    const c = copia(t);
    expect(c.temporadas.map((x) => x.id)).toEqual([t.ids.temporada.id]);
    expect(t.fotos[4] in c.fotos).toBe(false);
    expect(borrador.id).toBeTruthy();
  });

  test('una temporada publicada sin foto de portada lanza invalido', () => {
    const t = tiendaDeEjemplo();
    t.ctx.crear('temporadas', { nombre: 'Sin foto', visible_en_web: true });
    expect(() => armar(t)).toThrow(/la temporada «Sin foto» no tiene foto de portada/);
  });
});
