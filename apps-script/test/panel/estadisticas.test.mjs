import { describe, test, expect } from 'vitest';
import { panelInstalado, filasCrudas } from './ayudas.mjs';
import { tiendaDeEjemplo, programarGithub, TOKEN_DE_PRUEBA } from './escenario.mjs';

// Lima: el reloj de los dobles arranca el 1/12/2026 12:00.
const dia = (n, hora = 10) => {
  const d = new Date(Date.parse('2026-12-01T12:00:00-05:00') + n * 86400000);
  const lima = new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  return `${lima}T${String(hora).padStart(2, '0')}:00:00-05:00`;
};

function evento(ctx, fecha, tipo, producto = '', origen = 'web', sesion = 'abcdefgh') {
  const tabla = ctx.leerTabla_('eventos');
  ctx.agregarFilas_('eventos', tabla, [{ fecha, tipo, producto_id: producto, temporada_id: '', origen, pagina: '/p/ves-001/', sesion }]);
}
const diarias = (libro) => filasCrudas(libro, 'estadisticas_diarias').map((f) => [f.fecha, f.producto_id, f.origen, f.vistas, f.whatsapp, f.favoritos, f.compartidos, f.descargas]);

describe('consolidar_()', () => {
  test('agrupa los eventos por día, prenda y origen, con los contadores de cada tipo', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(-1), 'vista', 'prd_00000001');
    evento(ctx, dia(-1), 'vista', 'prd_00000001');
    evento(ctx, dia(-1), 'whatsapp', 'prd_00000001');
    evento(ctx, dia(-1), 'favorito', 'prd_00000001');
    evento(ctx, dia(-1), 'compartir', 'prd_00000001');
    evento(ctx, dia(-1), 'vista', 'prd_00000001', 'pdf');
    evento(ctx, dia(-1), 'revista_descarga', '', 'revista_web');
    evento(ctx, dia(0), 'vista', 'prd_00000002');
    const r = ctx.consolidar_(ctx.ahora_());
    expect(r).toMatchObject({ dias: 2, filas: 4, borrados: 0 });
    expect(diarias(libro)).toEqual([
      ['2026-11-30', 'prd_00000001', 'web', 2, 1, 1, 1, 0],
      ['2026-11-30', 'prd_00000001', 'pdf', 1, 0, 0, 0, 0],
      ['2026-11-30', '', 'revista_web', 0, 0, 0, 0, 1],
      ['2026-12-01', 'prd_00000002', 'web', 1, 0, 0, 0, 0],
    ]);
  });

  test('los días de Lima, no de UTC: un evento a las 23:30 de Lima cuenta ese día', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, '2026-11-30T23:30:00-05:00', 'vista', 'prd_00000001');
    ctx.consolidar_(ctx.ahora_());
    expect(diarias(libro)[0][0]).toBe('2026-11-30');
  });

  test('se puede repetir: no duplica filas, y suma los eventos nuevos del mismo día', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(0), 'vista', 'prd_00000001');
    ctx.consolidar_(ctx.ahora_());
    ctx.consolidar_(ctx.ahora_());
    expect(diarias(libro)).toEqual([['2026-12-01', 'prd_00000001', 'web', 1, 0, 0, 0, 0]]);
    evento(ctx, dia(0, 15), 'vista', 'prd_00000001');
    ctx.consolidar_(ctx.ahora_());
    expect(diarias(libro)).toEqual([['2026-12-01', 'prd_00000001', 'web', 2, 0, 0, 0, 0]]);
  });

  test('las fechas y los ids de las filas diarias quedan como texto', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(0), 'vista', 'prd_00000001');
    ctx.consolidar_(ctx.ahora_());
    expect(typeof filasCrudas(libro, 'estadisticas_diarias')[0].fecha).toBe('string');
  });

  test('borra los eventos de más de 35 días y conserva sus filas diarias', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(-40), 'vista', 'prd_00000001');
    evento(ctx, dia(-36), 'vista', 'prd_00000001');
    evento(ctx, dia(-35), 'vista', 'prd_00000001');
    evento(ctx, dia(-1), 'vista', 'prd_00000001');
    expect(ctx.consolidar_(ctx.ahora_())).toMatchObject({ borrados: 2 });
    expect(ctx.leerTabla_('eventos').filas.map((e) => e.fecha.slice(0, 10))).toEqual(['2026-10-27', '2026-11-30']);
    expect(diarias(libro).map((f) => f[0])).toEqual(['2026-10-22', '2026-10-26', '2026-10-27', '2026-11-30']);
  });

  test('cuando ya no quedan eventos de un día viejo, sus filas diarias siguen ahí y no se duplican', () => {
    const { ctx, libro, dobles } = panelInstalado();
    evento(ctx, dia(-1), 'whatsapp', 'prd_00000001');
    ctx.consolidar_(ctx.ahora_());
    dobles._reloj.saltar(60 * 86400000);
    ctx.consolidar_(ctx.ahora_());
    expect(ctx.leerTabla_('eventos').filas).toEqual([]);
    expect(diarias(libro)).toEqual([['2026-11-30', 'prd_00000001', 'web', 0, 1, 0, 0, 0]]);
  });

  test('la hoja de eventos no crece sin límite: tras podar se recortan las filas vacías', () => {
    const { ctx, libro } = panelInstalado();
    const tabla = ctx.leerTabla_('eventos');
    ctx.agregarFilas_('eventos', tabla, Array.from({ length: 1500 }, () => ({ fecha: dia(-60), tipo: 'vista', producto_id: '', temporada_id: '', origen: 'web', pagina: '/', sesion: 'abcdefgh' })));
    const antes = libro.getSheetByName('eventos').getMaxRows();
    ctx.consolidar_(ctx.ahora_());
    expect(libro.getSheetByName('eventos').getMaxRows()).toBeLessThan(antes);
    expect(libro.getSheetByName('eventos').getLastRow()).toBe(1);
  });

  test('ignora tipos desconocidos y filas sin fecha', () => {
    const { ctx, libro } = panelInstalado();
    evento(ctx, dia(0), 'hackeo', 'prd_00000001');
    evento(ctx, null, 'vista', 'prd_00000001');
    expect(ctx.consolidar_(ctx.ahora_())).toMatchObject({ filas: 0 });
    expect(diarias(libro)).toEqual([]);
  });

  test('no hace nada con la hoja de eventos vacía', () => {
    const { ctx } = panelInstalado();
    expect(ctx.consolidar_(ctx.ahora_())).toEqual({ dias: 0, filas: 0, borrados: 0 });
  });

  test('con el candado ocupado no hace nada', () => {
    const { ctx, dobles } = panelInstalado();
    dobles._candado.fallar = true;
    expect(() => ctx.consolidar_(ctx.ahora_())).toThrow(/^conflicto:/);
  });
});

describe('resumen()', () => {
  function conEventos() {
    const t = tiendaDeEjemplo();
    const { ctx, ids } = t;
    evento(ctx, dia(0), 'vista', ids.v1.id);
    evento(ctx, dia(0), 'whatsapp', ids.v1.id);
    evento(ctx, dia(-3), 'whatsapp', ids.v1.id, 'pdf');
    evento(ctx, dia(-10), 'whatsapp', ids.v2.id);
    evento(ctx, dia(-10), 'vista', ids.v2.id, 'revista_web');
    evento(ctx, dia(-2), 'revista_descarga', '', 'revista_web');
    return t;
  }

  test('suma los últimos 7 o 30 días, por prenda y por origen, con los eventos de hoy incluidos', () => {
    const { ctx, ids } = conEventos();
    const r7 = ctx.resumen({ dias: 7 });
    expect(r7.totales).toEqual({ vistas: 1, whatsapp: 2, favoritos: 0, compartidos: 0, descargas: 1 });
    expect(r7.por_producto).toEqual([{ producto_id: ids.v1.id, codigo: 'VES-001', nombre: 'Vestido Lino', vistas: 1, whatsapp: 2, favoritos: 0, compartidos: 0, descargas: 0 }]);
    expect(r7.por_origen.pdf).toEqual({ vistas: 0, whatsapp: 1, favoritos: 0, compartidos: 0, descargas: 0 });
    const r30 = ctx.resumen({ dias: 30 });
    expect(r30.totales).toEqual({ vistas: 2, whatsapp: 3, favoritos: 0, compartidos: 0, descargas: 1 });
    expect(r30.por_producto.map((p) => p.codigo)).toEqual(['VES-001', 'VES-002']);
    expect(Object.keys(r30.por_origen).sort()).toEqual(['pdf', 'revista_web', 'web']);
  });

  test('después de consolidar da lo mismo (no cuenta dos veces)', () => {
    const { ctx } = conEventos();
    const antes = ctx.resumen({ dias: 30 });
    ctx.consolidar_(ctx.ahora_());
    expect(ctx.resumen({ dias: 30 })).toEqual(antes);
  });

  test('los días que ya no tienen eventos salen de estadisticas_diarias', () => {
    const { ctx } = panelInstalado();
    const tabla = ctx.leerTabla_('estadisticas_diarias');
    ctx.agregarFilas_('estadisticas_diarias', tabla, [
      { fecha: '2026-11-20', producto_id: 'prd_00000001', origen: 'web', vistas: 4, whatsapp: 2, favoritos: 0, compartidos: 0, descargas: 0 },
      { fecha: '2026-10-01', producto_id: 'prd_00000001', origen: 'web', vistas: 9, whatsapp: 9, favoritos: 0, compartidos: 0, descargas: 0 }, // fuera de los 30 días
    ]);
    evento(ctx, dia(0), 'whatsapp', 'prd_00000001');
    expect(ctx.resumen({ dias: 30 }).totales).toEqual({ vistas: 4, whatsapp: 3, favoritos: 0, compartidos: 0, descargas: 0 });
    expect(ctx.resumen({ dias: 7 }).totales.whatsapp).toBe(1);
  });

  test('una prenda borrada del catálogo aparece sin código', () => {
    const { ctx } = panelInstalado();
    evento(ctx, dia(0), 'vista', 'prd_ffffffff');
    expect(ctx.resumen({ dias: 7 }).por_producto[0]).toMatchObject({ producto_id: 'prd_ffffffff', codigo: '', nombre: '' });
  });

  test('dias solo puede ser 7 o 30', () => {
    const { ctx } = panelInstalado();
    for (const malo of [undefined, 0, 14, '7', null]) expect(() => ctx.resumen({ dias: malo })).toThrow(/^invalido: dias/);
    expect(() => ctx.resumen()).toThrow(/^invalido:/);
  });

  test('sin eventos devuelve ceros', () => {
    const { ctx } = panelInstalado();
    expect(ctx.resumen({ dias: 7 })).toEqual({ totales: { vistas: 0, whatsapp: 0, favoritos: 0, compartidos: 0, descargas: 0 }, por_producto: [], por_origen: {} });
  });
});

describe('diario_()', () => {
  test('consolida los eventos y vuelve a publicar', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    evento(t.ctx, dia(-1), 'whatsapp', t.ids.v1.id);
    t.dobles._url.llamadas.length = 0;
    t.ctx.diario_();
    expect(diarias(t.libro)).toHaveLength(1);
    expect(t.dobles._url.llamadas.filter((l) => /dispatches$/.test(l.url))).toHaveLength(1);
  });

  test('sin token consolida igual y no publica ni falla', () => {
    const t = tiendaDeEjemplo();
    evento(t.ctx, dia(-1), 'whatsapp', t.ids.v1.id);
    expect(() => t.ctx.diario_()).not.toThrow();
    expect(diarias(t.libro)).toHaveLength(1);
    expect(t.dobles._url.llamadas).toEqual([]);
  });

  test('si publicar falla, la consolidación ya quedó hecha y el error se propaga (el activador avisa)', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.ctx.guardarConfig('tienda_nombre', '');
    evento(t.ctx, dia(-1), 'whatsapp', t.ids.v1.id);
    expect(() => t.ctx.diario_()).toThrow(/^invalido: la tienda todavía no tiene nombre/);
    expect(diarias(t.libro)).toHaveLength(1);
  });
});

describe('reporteMensual_()', () => {
  const carpetaReportes = (t) => t.dobles.DriveApp.getFolderById(JSON.parse(t.dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next().getBlob().getDataAsString()).carpetas.reportes);

  function tiendaConMes() {
    const t = tiendaDeEjemplo();
    const { ctx, ids } = t;
    evento(ctx, '2026-11-10T10:00:00-05:00', 'vista', ids.v1.id);
    evento(ctx, '2026-11-10T11:00:00-05:00', 'whatsapp', ids.v1.id);
    evento(ctx, '2026-11-12T11:00:00-05:00', 'whatsapp', ids.v2.id, 'pdf');
    evento(ctx, '2026-11-12T11:30:00-05:00', 'whatsapp', ids.v2.id, 'pdf');
    evento(ctx, '2026-12-01T09:00:00-05:00', 'vista', ids.v2.id);
    return t;
  }

  test('crea «Reporte de consultas» en Documentos/Reportes con una pestaña del mes anterior', () => {
    const t = tiendaConMes();
    const r = t.ctx.reporteMensual_();
    expect(r.mes).toBe('2026-11');
    const archivo = t.dobles.DriveApp.getFilesByName('Reporte de consultas').next();
    expect(archivo.getParents().next().getId()).toBe(carpetaReportes(t).getId());
    const libro = t.dobles.SpreadsheetApp.openById(archivo.getId());
    expect(libro.getSheets().map((h) => h.getName())).toEqual(['2026-11']); // sin la hoja vacía por defecto
    expect(r.url).toBe(`${libro.getUrl()}#gid=${libro.getSheetByName('2026-11').getSheetId()}`);
    const v = libro.getSheetByName('2026-11').getDataRange().getValues();
    expect(v[0][0]).toBe('Reporte de consultas · 2026-11');
    expect(v[1]).toEqual(['Código / origen', 'Prenda', 'Vistas', 'WhatsApp', 'Favoritos', 'Compartidos', 'Descargas']);
    expect(v[2]).toEqual(['VES-002', 'Vestido Rojo', 0, 2, 0, 0, 0]); // la más consultada primero
    expect(v[3]).toEqual(['VES-001', 'Vestido Lino', 1, 1, 0, 0, 0]);
    const total = v[v.length - 1];
    expect(total).toEqual(['Total', '', 1, 3, 0, 0, 0]); // el evento de diciembre no cuenta
    expect(v.some((f) => f[0] === 'pdf' && f[3] === 2)).toBe(true);
  });

  test('se puede repetir: rehace la pestaña del mes sin duplicar el libro', () => {
    const t = tiendaConMes();
    t.ctx.reporteMensual_();
    t.ctx.reporteMensual_();
    let n = 0;
    const it = t.dobles.DriveApp.getFilesByName('Reporte de consultas');
    while (it.hasNext()) (it.next(), n++);
    expect(n).toBe(1);
    const libro = t.dobles.SpreadsheetApp.openById(t.dobles.DriveApp.getFilesByName('Reporte de consultas').next().getId());
    expect(libro.getSheets()).toHaveLength(1);
  });

  test('un mes nuevo agrega una pestaña al mismo libro', () => {
    const t = tiendaConMes();
    t.ctx.reporteMensual_();
    t.dobles._reloj.saltar(31 * 86400000); // 1/1/2027
    const r = t.ctx.reporteMensual_();
    expect(r.mes).toBe('2026-12');
    const libro = t.dobles.SpreadsheetApp.openById(t.dobles.DriveApp.getFilesByName('Reporte de consultas').next().getId());
    expect(libro.getSheets().map((h) => h.getName())).toEqual(['2026-11', '2026-12']);
  });

  test('el mes de enero se reporta como diciembre del año anterior', () => {
    const { ctx } = panelInstalado();
    expect(ctx.mesAnterior_('2027-01-01')).toBe('2026-12');
    expect(ctx.mesAnterior_('2026-12-01')).toBe('2026-11');
  });

  test('un nombre de prenda que parece fórmula no se convierte en fórmula', () => {
    const t = tiendaConMes();
    t.ctx.guardarCampo('productos', t.ids.v2.id, 'nombre', '=HYPERLINK("http://malo")', t.ctx.listar('productos', { filtro: { id: t.ids.v2.id } }).filas[0].version);
    t.ctx.reporteMensual_();
    const libro = t.dobles.SpreadsheetApp.openById(t.dobles.DriveApp.getFilesByName('Reporte de consultas').next().getId());
    expect(libro.getSheetByName('2026-11').getRange(3, 2).getValue()).toBe('=HYPERLINK("http://malo")');
    expect(libro.getSheetByName('2026-11').getRange(3, 2).getFormulas()[0][0]).toBe('');
  });

  test('sin consultas deja el reporte con un aviso y ceros', () => {
    const t = tiendaDeEjemplo();
    t.ctx.reporteMensual_();
    const libro = t.dobles.SpreadsheetApp.openById(t.dobles.DriveApp.getFilesByName('Reporte de consultas').next().getId());
    expect(libro.getSheetByName('2026-11').getDataRange().getValues()[2][0]).toBe('(sin consultas este mes)');
  });
});

describe('activadores: envoltorios sin usuario', () => {
  function comoActivador(t) {
    t.dobles.Session.getActiveUser = () => ({ getEmail: () => '' }); // un activador no tiene usuario activo
  }

  test('tareaDiaria, tareaDocumentos y tareaReporteMensual funcionan sin usuario activo', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    evento(t.ctx, dia(-1), 'vista', t.ids.v1.id);
    comoActivador(t);
    t.dobles._url.llamadas.length = 0;
    expect(() => t.ctx.tareaDiaria()).not.toThrow();
    expect(diarias(t.libro)).toHaveLength(1);
    expect(t.dobles._url.llamadas.filter((l) => /dispatches$/.test(l.url))).toHaveLength(1);
    expect(() => t.ctx.tareaReporteMensual()).not.toThrow();
    expect(t.dobles.DriveApp.getFilesByName('Reporte de consultas').hasNext()).toBe(true);
    expect(() => t.ctx.tareaDocumentos()).not.toThrow();
  });

  test('en cambio, el resto de las funciones públicas siguen exigiendo a la dueña', () => {
    const t = tiendaDeEjemplo();
    comoActivador(t);
    expect(() => t.ctx.listar('productos')).toThrow(/^no_autorizado:/);
    expect(() => t.ctx.publicar()).toThrow(/^no_autorizado:/);
    expect(() => t.ctx.resumen({ dias: 7 })).toThrow(/^no_autorizado:/);
  });

  test('tareaDocumentos no llama a GitHub si no hay una publicación esperando sus documentos', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.dobles._url.llamadas.length = 0;
    t.ctx.tareaDocumentos();
    expect(t.dobles._url.llamadas).toEqual([]);
  });
});
