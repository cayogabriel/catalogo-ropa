// Correcciones de la revisión final (cada prueba reproduce un hallazgo).
import { describe, test, expect } from 'vitest';
import { validarCatalogo } from '@catalogo/contratos';
import { panelInstalado, filasCrudas } from './ayudas.mjs';
import { tiendaDeEjemplo, programarGithub, TOKEN_DE_PRUEBA, jpegLimpio } from './escenario.mjs';

const dia = (n, hora = 10) => {
  const d = new Date(Date.parse('2026-12-01T12:00:00-05:00') + n * 86400000);
  return `${new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10)}T${String(hora).padStart(2, '0')}:00:00-05:00`;
};
const evento = (ctx, fecha, tipo = 'vista', producto = 'prd_00000001') =>
  ctx.agregarFilas_('eventos', ctx.leerTabla_('eventos'), [{ fecha, tipo, producto_id: producto, temporada_id: '', origen: 'web', pagina: '/', sesion: 'abcdefgh' }]);

describe('C1 · una fila vacía en estadisticas_diarias no hace perder otras filas', () => {
  test('consolidar_ escribe desde la fila real, no desde la posición entre las filas leídas', () => {
    const { ctx, libro } = panelInstalado();
    const fila = (fecha, vistas) => ({ fecha, producto_id: 'prd_00000001', origen: 'web', vistas, whatsapp: 0, favoritos: 0, compartidos: 0, descargas: 0 });
    ctx.agregarFilas_('estadisticas_diarias', ctx.leerTabla_('estadisticas_diarias'), [fila('2026-10-22', 1), fila('2026-10-23', 2), fila('2026-10-24', 3), fila('2026-11-29', 4)]);
    libro.getSheetByName('estadisticas_diarias').getRange(3, 1, 1, 8).clearContent(); // la dueña borra el contenido de una fila (Supr)
    evento(ctx, dia(-2), 'vista'); // 2026-11-29
    ctx.consolidar_(ctx.ahora_());
    const dias = filasCrudas(libro, 'estadisticas_diarias').map((f) => f.fecha).filter((f) => f !== '');
    expect(dias).toEqual(['2026-10-22', '2026-10-24', '2026-11-29']);
  });
});

describe('C2 · todo lo que se guarda desde el Panel debe poder publicarse', () => {
  test('una vendedora necesita nombre', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.crear('vendedoras', { whatsapp: '51911111111' })).toThrow(/^invalido: la vendedora necesita un nombre/);
    const v = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51911111111' });
    expect(() => ctx.guardarCampo('vendedoras', v.id, 'nombre', '  ', 1)).toThrow(/necesita un nombre/);
  });

  test('una paleta necesita las dos fuentes', () => {
    const t = tiendaDeEjemplo();
    const id = t.ctx.leerTabla_('paletas').filas.find((p) => p.id === 'neutra-minimal');
    expect(() => t.ctx.guardarCampo('paletas', id.id, 'fuente_titulos', '', id.version)).toThrow(/necesita las dos fuentes/);
  });

  test('un texto editado a mano que pasa el máximo del contrato lanza invalido con el código, antes de publicar', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('productos');
    const fila = tabla.filas.find((p) => p.id === t.ids.v1.id);
    fila.nombre = 'x'.repeat(81);
    t.ctx.escribirFila_('productos', tabla, fila);
    const fecha = t.ctx.ahora_();
    expect(() => t.ctx.armarCatalogo_(t.ctx.leerDatosParaPublicar_(fecha), fecha, t.ctx.resolverFotoDrive_)).toThrow(/^invalido: .*VES-001.*nombre.*80/);
  });

  test('una vendedora o una paleta hechas a mano sin nombre/fuente también lanzan invalido legible', () => {
    const t = tiendaDeEjemplo();
    const v = t.ctx.leerTabla_('vendedoras');
    v.filas[1].nombre = '';
    t.ctx.escribirFila_('vendedoras', v, v.filas[1]);
    const fecha = t.ctx.ahora_();
    expect(() => t.ctx.armarCatalogo_(t.ctx.leerDatosParaPublicar_(fecha), fecha, t.ctx.resolverFotoDrive_)).toThrow(/^invalido: .*vendedora.*nombre/);
  });

  test('con datos válidos la copia sigue pasando validarCatalogo', () => {
    const t = tiendaDeEjemplo();
    const fecha = t.ctx.ahora_();
    const c = JSON.parse(JSON.stringify(t.ctx.armarCatalogo_(t.ctx.leerDatosParaPublicar_(fecha), fecha, t.ctx.resolverFotoDrive_).catalogo));
    expect(validarCatalogo(c).errores).toEqual([]);
  });
});

describe('C3 · si falla el aviso a GitHub no queda como publicado', () => {
  test('un token rechazado deja «cambios sin publicar» y no fija publicado_en', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { dispatch: 401, runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(true);
    expect(() => t.ctx.publicar()).toThrow(/^github:/);
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(true);
    expect(t.ctx.listar('productos').filas.every((p) => p.publicado_en === null)).toBe(true);
    expect(t.dobles._propiedades.get('CR_ULTIMA_PUBLICACION')).toBeUndefined();
  });

  test('la publicación automática con aviso rechazado tampoco lo da por publicado', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { dispatch: 422, runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    expect(() => t.ctx.diario_()).toThrow(/^github:/);
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(true);
  });
});

describe('C4 · la consolidación no pierde los eventos que llegan mientras trabaja', () => {
  test('un evento agregado por la API justo después de leer sigue en la hoja', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(-40));
    evento(ctx, dia(-1));
    const leer = ctx.leerTabla_;
    let llegoElNuevo = false;
    ctx.leerTabla_ = (entidad) => {
      const t = leer(entidad);
      if (entidad === 'eventos' && !llegoElNuevo) {
        llegoElNuevo = true;
        const h = libro.getSheetByName('eventos'); // la API anota un evento ahora mismo
        h.getRange(h.getLastRow() + 1, 1, 1, 7).setValues([[new Date(ctx.ahora_().getTime()), 'whatsapp', 'prd_00000002', '', 'web', '/', 'llegando1']]);
      }
      return t;
    };
    ctx.consolidar_(ctx.ahora_());
    ctx.leerTabla_ = leer;
    const sesiones = ctx.leerTabla_('eventos').filas.map((e) => e.sesion);
    expect(sesiones).toEqual(['abcdefgh', 'llegando1']);
  });

  test('podar solo quita las filas viejas del principio y no reescribe el resto de la hoja', () => {
    const { ctx, libro } = panelInstalado();
    for (const n of [-50, -45, -2, -1]) evento(ctx, dia(n));
    const h = libro.getSheetByName('eventos');
    const setValues = h.getRange(2, 1, 1, 7).setValues;
    let reescrituras = 0;
    const getRange = h.getRange;
    h.getRange = (...a) => {
      const r = getRange(...a);
      const sv = r.setValues;
      r.setValues = (v) => ((reescrituras += a[0] >= 2 && a[2] > 1 ? 1 : 0), sv(v));
      return r;
    };
    expect(ctx.consolidar_(ctx.ahora_()).borrados).toBe(2);
    expect(reescrituras).toBe(0);
    expect(ctx.leerTabla_('eventos').filas.map((e) => e.fecha.slice(0, 10))).toEqual(['2026-11-29', '2026-11-30']);
    expect(setValues).toBeTypeOf('function');
  });

  test('si todas las filas son viejas no intenta borrar todas las filas no congeladas', () => {
    const { ctx, libro } = panelInstalado();
    ctx.agregarFilas_('eventos', ctx.leerTabla_('eventos'), Array.from({ length: 1200 }, () => ({ fecha: dia(-60), tipo: 'vista', producto_id: '', temporada_id: '', origen: 'web', pagina: '/', sesion: 'abcdefgh' })));
    expect(() => ctx.consolidar_(ctx.ahora_())).not.toThrow();
    expect(libro.getSheetByName('eventos').getLastRow()).toBe(1);
  });
});

describe('I5 · documentos: una sola copia a la vez', () => {
  test('si ya hay una copia en curso, otra no empieza ni cuenta como fallo', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.ctx.publicar();
    const creada = new Date(t.dobles._reloj.ahora() + 5000).toISOString();
    t.dobles._url.reiniciar();
    programarGithub(t.dobles, { runs: [{ id: 9, status: 'completed', conclusion: 'success', created_at: creada, run_started_at: creada, updated_at: creada, html_url: 'https://github.com/cayogabriel/catalogo-ropa/actions/runs/9' }] });
    t.dobles._propiedades.set('CR_DOCS_EN_CURSO', String(t.dobles._reloj.ahora()));
    const e = t.ctx.estadoPublicacion();
    expect(e).toMatchObject({ estado: 'publicado', documentos_guardados: false, mensaje: expect.stringContaining('Copiando') });
    expect(t.dobles._url.llamadas.filter((l) => /documentos\.json/.test(l.url))).toHaveLength(0);
    expect(t.dobles._propiedades.get('CR_DOCS_INTENTOS')).toBeUndefined();
  });

  test('una marca de más de 10 minutos se considera abandonada y la copia sigue; la marca se limpia siempre', () => {
    const t = tiendaDeEjemplo();
    t.dobles._url.responder(/documentos\.json/, { codigo: 404 });
    t.dobles._propiedades.set('CR_DOCS_EN_CURSO', String(t.dobles._reloj.ahora() - 11 * 60 * 1000));
    expect(t.ctx.guardarDocumentosUnaVez_()).toEqual({ guardados: 0 });
    expect(t.dobles._propiedades.get('CR_DOCS_EN_CURSO')).toBeUndefined();
    t.dobles._url.reiniciar();
    t.dobles._url.responder(/documentos\.json/, { codigo: 500 });
    expect(() => t.ctx.guardarDocumentosUnaVez_()).toThrow(/^github:/);
    expect(t.dobles._propiedades.get('CR_DOCS_EN_CURSO')).toBeUndefined();
  });
});

describe('I6 · guardar no lee todo el historial', () => {
  test('el autoguardado agrega al historial sin leer sus filas', () => {
    const t = tiendaDeEjemplo();
    const h = t.libro.getSheetByName('historial');
    const filasLeidas = [];
    const getRange = h.getRange;
    h.getRange = (f, c, nf = 1, nc = 1) => {
      const r = getRange(f, c, nf, nc);
      const gv = r.getValues;
      r.getValues = () => (filasLeidas.push(nf), gv());
      return r;
    };
    const p = t.ctx.listar('productos').filas[0];
    t.ctx.guardarCampo('productos', p.id, 'nombre', 'Otro nombre', p.version);
    expect(Math.max(0, ...filasLeidas)).toBeLessThanOrEqual(1); // solo los encabezados
  });
});

describe('I7 · el redondeo nunca promete más descuento del que se aplica', () => {
  const producto = (regular) => ({ id: 'prd_00000001', categoria_id: 'cat_00000001', precio_regular: regular });
  const oferta = (extra) => ({ id: 'ofe_00000001', tipo: 'porcentaje', valor: 20, alcance: 'tienda', objetivos: [], desde: null, hasta: null, prioridad: 0, etiqueta: '', es_liquidacion: false, cuenta_regresiva: false, activa: true, ...extra });
  const precio = (regular, o, redondeo) => {
    const { ctx } = panelInstalado();
    return ctx.ventanasDePrecio_(producto(regular), [oferta(o)], { redondeo, secciones: [], temporadas: [], ahora: null }).ventanas[0];
  };

  test('«90» y «entero» redondean hacia abajo: el cliente paga lo prometido o menos', () => {
    expect(precio(20, { valor: 2 }, '90')).toMatchObject({ precio: 18.9, descuento_pct: 5 });
    expect(precio(85, { tipo: 'monto', valor: 10 }, '90').precio).toBe(74.9);
    expect(precio(89, { valor: 15 }, 'entero')).toMatchObject({ precio: 75, descuento_pct: 15 });
    expect(precio(89, { valor: 15 }, '90')).toMatchObject({ precio: 74.9 });
  });

  test('nunca queda por encima del precio que daría el descuento exacto', () => {
    const { ctx } = panelInstalado();
    for (const regular of [10, 19.9, 33.33, 59.9, 89, 120.5, 249])
      for (const valor of [1, 2, 5, 10, 15, 20, 33, 50, 70, 90])
        for (const redondeo of ['ninguno', 'entero', '90']) {
          const r = ctx.ventanasDePrecio_(producto(regular), [oferta({ valor })], { redondeo, secciones: [], temporadas: [], ahora: null }).ventanas[0];
          if (r.oferta_id === null) continue;
          expect(r.precio, `${regular} ${valor}% ${redondeo}`).toBeLessThanOrEqual(regular * (1 - valor / 100) + 1e-9);
          expect(r.precio).toBeGreaterThan(0);
        }
  });

  test('si al redondear hacia abajo el precio llega a 0, la oferta no cuenta', () => {
    expect(precio(10, { tipo: 'monto', valor: 9.5 }, 'entero').oferta_id).toBe(null);
  });
});

describe('menores baratos', () => {
  test('una prenda agotada no sale con «Últimas unidades» aunque tenga stock cargado', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('productos');
    const f = tabla.filas.find((p) => p.id === t.ids.f1.id);
    f.stock = 2;
    t.ctx.escribirFila_('productos', tabla, f);
    const fecha = t.ctx.ahora_();
    const c = t.ctx.armarCatalogo_(t.ctx.leerDatosParaPublicar_(fecha), fecha, t.ctx.resolverFotoDrive_).catalogo;
    expect(c.productos.find((p) => p.codigo === 'FAL-001').ultimas_unidades).toBe(false);
    expect(c.productos.find((p) => p.codigo === 'VES-001').ultimas_unidades).toBe(true);
  });

  test('no se elimina una categoría, sección o temporada que usa una oferta, ni una categoría que usa una sección', () => {
    const t = tiendaDeEjemplo();
    const { ctx, ids } = t;
    ctx.crear('ofertas', { nombre: 'Cat', valor: 10, alcance: 'categoria', objetivos: [ids.faldas.id] });
    expect(() => ctx.eliminar('categorias', ids.faldas.id)).toThrow(/prenda|oferta/);
    const cat = ctx.crear('categorias', { nombre: 'Blusas' });
    ctx.crear('secciones', { titulo: 'Blusas', tipo: 'categoria', parametro: cat.id });
    expect(() => ctx.eliminar('categorias', cat.id)).toThrow(/sección/);
    ctx.crear('ofertas', { nombre: 'Sec', valor: 10, alcance: 'seccion', objetivos: [ids.manual.id] });
    expect(() => ctx.eliminar('secciones', ids.manual.id)).toThrow(/oferta/);
    ctx.crear('ofertas', { nombre: 'Tem', valor: 10, alcance: 'temporada', objetivos: [ids.temporada.id] });
    ctx.eliminar('temporada_fotos', ids.fotoT1.id);
    ctx.eliminar('temporada_fotos', ids.fotoT2.id);
    ctx.eliminar('portadas', ids.portada.id);
    expect(() => ctx.eliminar('temporadas', ids.temporada.id)).toThrow(/oferta/);
  });

  test('instalar() con el candado ocupado lanza conflicto con el formato del contrato', () => {
    const { ctx, dobles } = panelInstalado();
    dobles._candado.fallar = true;
    expect(() => ctx.instalar()).toThrow(/^conflicto:/);
  });

  test('el reporte mensual agranda la hoja si hay más de 1000 líneas', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('estadisticas_diarias');
    t.ctx.agregarFilas_('estadisticas_diarias', tabla, Array.from({ length: 1100 }, (_, i) => ({ fecha: '2026-11-15', producto_id: `prd_${String(i).padStart(8, '0')}`, origen: 'web', vistas: 1, whatsapp: 0, favoritos: 0, compartidos: 0, descargas: 0 })));
    expect(() => t.ctx.reporteMensual_()).not.toThrow();
  });

  test('un JPEG con bytes sueltos entre segmentos (puede esconder un EXIF) se rechaza', () => {
    const { ctx } = panelInstalado();
    const base = jpegLimpio();
    const sucio = Buffer.concat([base.subarray(0, 20), Buffer.from([0x00, 0x00]), Buffer.from([0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2]), base.subarray(20)]);
    expect(() => ctx.subirFoto({ nombre: 'a.jpg', mime: 'image/jpeg', base64: sucio.toString('base64'), destino: 'producto' })).toThrow(/^invalido:/);
    expect(ctx.subirFoto({ nombre: 'a.jpg', mime: 'image/jpeg', base64: base.toString('base64'), destino: 'producto' }).id).toBeTruthy();
  });
});
