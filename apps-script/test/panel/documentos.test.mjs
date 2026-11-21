import { describe, test, expect } from 'vitest';
import { tiendaDeEjemplo, programarGithub, TOKEN_DE_PRUEBA } from './escenario.mjs';

const BASE = 'https://cayogabriel.github.io/catalogo-ropa/';
const PDF = 'temporada/verano-2027/revista-verano-2027.pdf';
const JPG = (n) => `temporada/verano-2027/carrusel/verano-2027-0${n}.jpg`;

function manifiesto(t, extra = {}) {
  return {
    generado_en: '2026-12-01T00:20:00-05:00',
    revistas: [{ temporada_id: t.ids.temporada.id, slug: 'verano-2027', pdf: PDF, paginas: 3, bytes: 10, carrusel: [JPG(1), JPG(2)] }],
    catalogo: { pdf: 'catalogo/catalogo.pdf', paginas: 2, bytes: 10 },
    ...extra,
  };
}

// Programa el sitio: el manifiesto y cada archivo con su contenido.
function programarSitio(t, m = manifiesto(t), archivos = {}) {
  const u = t.dobles._url;
  u.responder(/documentos\.json/, { texto: JSON.stringify(m) });
  const todos = { [PDF]: [1, 2, 3], [JPG(1)]: [4], [JPG(2)]: [5], 'catalogo/catalogo.pdf': [6], ...archivos };
  for (const [ruta, bytes] of Object.entries(todos)) {
    u.responder(new RegExp(`${ruta.replace(/\./g, '\\.')}$`), { bytes: Buffer.from(bytes), tipo: ruta.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf' });
  }
}

const puntero = (t) => JSON.parse(t.dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next().getBlob().getDataAsString());
function vivos(carpeta) {
  const r = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) r.push(f);
  }
  return r;
}
const hijo = (carpeta, nombre) => carpeta.getFoldersByName(nombre).next();
const bytesDe = (f) => [...f.getBlob().getBytes().map((b) => b & 255)];

describe('guardarDocumentos_()', () => {
  test('copia la revista, el carrusel y el catálogo a sus carpetas de Drive', () => {
    const t = tiendaDeEjemplo();
    programarSitio(t);
    expect(t.ctx.guardarDocumentos_()).toEqual({ guardados: 4 });
    const c = puntero(t).carpetas;
    const revistas = t.dobles.DriveApp.getFolderById(c.revistas);
    const carpeta = hijo(revistas, 'Verano 2027');
    const pdf = vivos(carpeta)[0];
    expect(pdf.getName()).toBe('revista-verano-2027.pdf');
    expect(pdf.getMimeType()).toBe('application/pdf');
    expect(bytesDe(pdf)).toEqual([1, 2, 3]);
    expect(vivos(hijo(carpeta, 'carrusel')).map((f) => [f.getName(), f.getMimeType(), bytesDe(f)]).sort()).toEqual([
      ['verano-2027-01.jpg', 'image/jpeg', [4]],
      ['verano-2027-02.jpg', 'image/jpeg', [5]],
    ]);
    const catalogo = vivos(t.dobles.DriveApp.getFolderById(c.catalogos));
    expect(catalogo.map((f) => [f.getName(), bytesDe(f)])).toEqual([['catalogo.pdf', [6]]]);
    // el manifiesto se pide con un parámetro para esquivar cachés
    expect(t.dobles._url.llamadas[0].url).toMatch(/^https:\/\/cayogabriel\.github\.io\/catalogo-ropa\/documentos\.json\?v=\d+$/);
  });

  test('solo se guarda la última versión: la anterior va a la papelera y sobran menos páginas', () => {
    const t = tiendaDeEjemplo();
    programarSitio(t);
    t.ctx.guardarDocumentos_();
    t.dobles._url.reiniciar();
    programarSitio(t, manifiesto(t, { revistas: [{ temporada_id: t.ids.temporada.id, slug: 'verano-2027', pdf: PDF, carrusel: [JPG(1)] }] }), { [PDF]: [9, 9], [JPG(1)]: [8] });
    t.ctx.guardarDocumentos_();
    const carpeta = hijo(t.dobles.DriveApp.getFolderById(puntero(t).carpetas.revistas), 'Verano 2027');
    expect(vivos(carpeta).map((f) => bytesDe(f))).toEqual([[9, 9]]);
    expect(vivos(hijo(carpeta, 'carrusel')).map((f) => [f.getName(), bytesDe(f)])).toEqual([['verano-2027-01.jpg', [8]]]);
    let total = 0;
    const it = carpeta.getFilesByName('revista-verano-2027.pdf');
    while (it.hasNext()) (it.next(), total++);
    expect(total).toBe(2); // una en la papelera
  });

  test('si el sitio todavía no tiene documentos.json, no guarda nada y no falla', () => {
    const t = tiendaDeEjemplo();
    t.dobles._url.responder(/documentos\.json/, { codigo: 404 });
    expect(t.ctx.guardarDocumentos_()).toEqual({ guardados: 0 });
  });

  test('un error del sitio (500) o un manifiesto roto lanza sin tocar Drive', () => {
    const a = tiendaDeEjemplo();
    a.dobles._url.responder(/documentos\.json/, { codigo: 500 });
    expect(() => a.ctx.guardarDocumentos_()).toThrow(/^github: el sitio respondió 500/);
    const b = tiendaDeEjemplo();
    b.dobles._url.responder(/documentos\.json/, { texto: '<html>' });
    expect(() => b.ctx.guardarDocumentos_()).toThrow(/^invalido: documentos.json no se puede leer/);
  });

  test('una ruta fuera de lo esperado se rechaza antes de descargar nada', () => {
    for (const mala of ['../secreto.pdf', '/abs/revista.pdf', 'con espacio.pdf', 'temporada/x/revista.exe', 'https://malo.example.com/a.pdf', 'a//..//b.pdf']) {
      const t = tiendaDeEjemplo();
      programarSitio(t, manifiesto(t, { revistas: [{ temporada_id: t.ids.temporada.id, slug: 'verano-2027', pdf: PDF, carrusel: [], }, { temporada_id: t.ids.temporada.id, slug: 'x', pdf: mala, carrusel: [] }] }));
      expect(() => t.ctx.guardarDocumentos_(), mala).toThrow(/^invalido: documentos.json trae una ruta/);
      expect(t.dobles._url.llamadas.map((l) => l.url).filter((u) => !/documentos\.json/.test(u)), mala).toEqual([]);
    }
  });

  test('si falla la descarga de un archivo, el anterior se queda donde estaba', () => {
    const t = tiendaDeEjemplo();
    programarSitio(t);
    t.ctx.guardarDocumentos_();
    t.dobles._url.reiniciar();
    t.dobles._url.responder(/documentos\.json/, { texto: JSON.stringify(manifiesto(t)) });
    t.dobles._url.responder(/revista-verano-2027\.pdf$/, { codigo: 503 });
    expect(() => t.ctx.guardarDocumentos_()).toThrow(/^github: el sitio respondió 503/);
    const carpeta = hijo(t.dobles.DriveApp.getFolderById(puntero(t).carpetas.revistas), 'Verano 2027');
    expect(vivos(carpeta).map((f) => bytesDe(f))).toEqual([[1, 2, 3]]);
  });

  test('el nombre de la temporada no puede salir de la carpeta (sin barras)', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarCampo('temporadas', t.ids.temporada.id, 'nombre', 'Verano/../2027', 2 - 1);
    programarSitio(t);
    t.ctx.guardarDocumentos_();
    const nombres = [];
    const it = t.dobles.DriveApp.getFolderById(puntero(t).carpetas.revistas).getFolders();
    while (it.hasNext()) nombres.push(it.next().getName());
    expect(nombres).toEqual(['Verano .. 2027']);
  });
});

describe('documentos()', () => {
  test('sin nada generado devuelve listas vacías', () => {
    const t = tiendaDeEjemplo();
    expect(t.ctx.documentos()).toEqual({ revistas: [], catalogo: null, reportes: [] });
  });

  test('lista la revista de cada temporada con revista, el catálogo y los reportes', () => {
    const t = tiendaDeEjemplo();
    programarSitio(t);
    t.ctx.guardarDocumentos_();
    t.ctx.reporteMensual_();
    const d = t.ctx.documentos();
    expect(d.revistas).toHaveLength(1);
    expect(d.revistas[0]).toMatchObject({ temporada_id: t.ids.temporada.id, nombre: 'Verano 2027', carrusel: { cantidad: 2 } });
    expect(d.revistas[0].pdf.url).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    expect(d.revistas[0].pdf.actualizado).toMatch(/-05:00$/);
    expect(d.revistas[0].carrusel.url).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//);
    expect(d.catalogo.url).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    expect(d.reportes).toHaveLength(1);
    expect(d.reportes[0]).toMatchObject({ mes: '2026-11' });
    expect(d.reportes[0].url).toMatch(/#gid=\d+$/);
  });

  test('una revista en la papelera no aparece; una temporada sin revista tampoco', () => {
    const t = tiendaDeEjemplo();
    programarSitio(t);
    t.ctx.guardarDocumentos_();
    const carpeta = hijo(t.dobles.DriveApp.getFolderById(puntero(t).carpetas.revistas), 'Verano 2027');
    vivos(carpeta).forEach((f) => f.setTrashed(true));
    expect(t.ctx.documentos().revistas).toEqual([]);
  });
});

describe('copia automática al terminar la publicación', () => {
  // La ejecución de GitHub nace unos segundos después del aviso (el reloj de los dobles avanza con cada escritura).
  const corrida = (t, extra) => {
    const creada = new Date(t.dobles._reloj.ahora() + 5000).toISOString();
    return { id: 555, status: 'completed', conclusion: 'success', created_at: creada, run_started_at: creada, updated_at: creada, html_url: 'https://github.com/cayogabriel/catalogo-ropa/actions/runs/555', ...extra };
  };

  function publicada(extra = {}, sitio = true) {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.ctx.publicar();
    reprogramar(t, extra, sitio);
    return t;
  }
  function reprogramar(t, extra = {}, sitio = true) {
    t.dobles._url.reiniciar();
    programarGithub(t.dobles, { runs: [corrida(t, extra)] });
    if (sitio) programarSitio(t);
  }
  const pidiosManifiesto = (t) => t.dobles._url.llamadas.filter((l) => /documentos.json/.test(l.url)).length;

  test('al ver la ejecución terminada, copia los documentos una sola vez', () => {
    const t = publicada();
    const e = t.ctx.estadoPublicacion();
    expect(e).toMatchObject({ estado: 'publicado', documentos_guardados: true, mensaje: 'Publicado y documentos guardados en Drive' });
    expect(t.ctx.estadoPublicacion().documentos_guardados).toBe(true);
    expect(pidiosManifiesto(t)).toBe(1);
    expect(t.ctx.documentos().revistas).toHaveLength(1);
  });

  test('mientras se publica no copia nada; el estado inicial tampoco (no es un trabajo pesado)', () => {
    const t = publicada({ status: 'in_progress', conclusion: null });
    expect(t.ctx.estadoPublicacion()).toMatchObject({ estado: 'publicando', documentos_guardados: false });
    expect(pidiosManifiesto(t)).toBe(0);
    const t2 = publicada();
    expect(t2.ctx.obtenerEstadoInicial().publicacion).toMatchObject({ estado: 'publicado', documentos_guardados: false });
    expect(pidiosManifiesto(t2)).toBe(0);
  });

  test('si falla la copia lo dice, reintenta en la siguiente consulta y se rinde a la tercera', () => {
    const t = publicada({}, false);
    t.dobles._url.responder(/documentos.json/, { codigo: 500 });
    const mensajes = [1, 2, 3].map(() => t.ctx.estadoPublicacion());
    for (const m of mensajes) expect(m).toMatchObject({ estado: 'publicado', documentos_guardados: false });
    expect(mensajes[0].mensaje).toMatch(/no se pudieron copiar los documentos a Drive: el sitio respondió 500/);
    expect(pidiosManifiesto(t)).toBe(3);
    t.ctx.estadoPublicacion();
    expect(pidiosManifiesto(t)).toBe(3); // ya no insiste
  });

  test('si la publicación terminó con error no copia nada ni queda pendiente', () => {
    const t = publicada({ conclusion: 'failure' });
    expect(t.ctx.estadoPublicacion().estado).toBe('error');
    expect(t.dobles._propiedades.get('CR_DOCS_PENDIENTE')).toBeUndefined();
    expect(pidiosManifiesto(t)).toBe(0);
  });

  test('el activador por hora también copia los documentos pendientes', () => {
    const t = publicada();
    t.ctx.tareaDocumentos();
    expect(t.ctx.documentos().revistas).toHaveLength(1);
    expect(t.dobles._propiedades.get('CR_DOCS_PENDIENTE')).toBeUndefined();
  });

  test('una publicación nueva vuelve a dejar los documentos pendientes', () => {
    const t = publicada();
    t.ctx.estadoPublicacion();
    t.dobles._reloj.saltar(3_600_000);
    t.ctx.publicar();
    expect(t.dobles._propiedades.get('CR_DOCS_PENDIENTE')).toBe('1');
    reprogramar(t, { id: 556 });
    expect(t.ctx.estadoPublicacion()).toMatchObject({ estado: 'publicado', documentos_guardados: true });
    expect(pidiosManifiesto(t)).toBe(1);
  });
});
