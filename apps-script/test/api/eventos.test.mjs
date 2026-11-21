import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { panelInstalado } from '../panel/ayudas.mjs';

// El Panel ya instalado (hoja, carpetas y puntero) y la API leyendo lo mismo; la visita es anónima.
// Por defecto hay una copia publicada con la prenda y la temporada de los eventos de ejemplo.
function preparar({ publicar: conCopia = true } = {}) {
  const p = panelInstalado();
  const api = cargarGas('api', { dobles: p.dobles });
  api.ctx.ahora_ = () => new Date(p.dobles._reloj.ahora());
  const post = (cuerpo) => JSON.parse(api.ctx.doPost({ postData: { contents: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) } }).getContent());
  const filas = () => p.ctx.leerTabla_('eventos').filas;
  const listo = { ...p, api: api.ctx, post, filas };
  if (conCopia) publicar(listo);
  return listo;
}

// Escribe una copia publicada mínima y la apunta desde el puntero, como hace publicar() en el Panel.
function publicar(p, { productos = ['prd_1a2b3c4d'], temporadas = ['tem_00000001'] } = {}) {
  const { DriveApp, PropertiesService } = p.dobles;
  const puntero = DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty('CR_PUNTERO_ID'));
  const copia = DriveApp.getFolderById(p.instalacion.carpetaRaizId).createFile(
    'catalogo-publicado.json',
    JSON.stringify({ productos: productos.map((id) => ({ id })), temporadas: temporadas.map((id) => ({ id })), fotos: {} }),
    'application/json',
  );
  puntero.setContent(JSON.stringify({ ...JSON.parse(puntero.getBlob().getDataAsString()), publicado_id: copia.getId() }));
  return copia;
}

const BUENO = { t: 'whatsapp', p: 'prd_1a2b3c4d', s: null, o: 'web', pg: '/p/ves-014/', ss: 'a1b2c3d4' };

describe('doPost: eventos válidos', () => {
  test('agrega una fila con fecha, tipo, prenda, temporada, origen, página y sesión', () => {
    const { post, filas } = preparar();
    expect(post(BUENO)).toEqual({ ok: true });
    expect(filas()).toHaveLength(1);
    expect(filas()[0]).toMatchObject({ tipo: 'whatsapp', producto_id: 'prd_1a2b3c4d', temporada_id: '', origen: 'web', pagina: '/p/ves-014/', sesion: 'a1b2c3d4' });
    expect(filas()[0].fecha).toMatch(/^2026-12-01T[0-9]{2}:[0-9]{2}:[0-9]{2}-05:00$/);
  });

  test('p y s pueden faltar o ser null; con s lleva la temporada', () => {
    const { post, filas } = preparar();
    const sin = { t: 'vista', o: 'revista_web', pg: '/temporada/verano-2027/', ss: 'abcdefgh' };
    expect(post(sin)).toEqual({ ok: true });
    expect(post({ ...BUENO, t: 'compartir', p: null, s: 'tem_00000001' })).toEqual({ ok: true });
    expect(filas().map((f) => [f.producto_id, f.temporada_id])).toEqual([['', ''], ['', 'tem_00000001']]);
  });

  test('acepta todos los tipos y orígenes del contrato', () => {
    const { post, filas } = preparar();
    for (const t of ['vista', 'whatsapp', 'favorito', 'compartir', 'revista_descarga']) expect(post({ ...BUENO, t })).toEqual({ ok: true });
    for (const o of ['web', 'revista_web', 'pdf', 'catalogo_pdf']) expect(post({ ...BUENO, o })).toEqual({ ok: true });
    expect(filas()).toHaveLength(9);
  });

  test('guarda los textos como texto: una ruta que empieza con /= no se vuelve fórmula', () => {
    const { post, libro } = preparar();
    expect(post({ ...BUENO, pg: '/=1', ss: '12345678' })).toEqual({ ok: true });
    const h = libro.getSheetByName('eventos');
    expect(h.getRange(2, 6).getValue()).toBe('/=1');
    expect(h.getRange(2, 6).getFormulas()[0][0]).toBe('');
    expect(typeof h.getRange(2, 7).getValue()).toBe('string');
  });

  test('cada evento va a la fila siguiente sin pisar a los anteriores', () => {
    const { post, filas } = preparar();
    for (let i = 0; i < 5; i++) post({ ...BUENO, ss: `sesion${i}xx` });
    expect(filas().map((f) => f.sesion)).toEqual(['sesion0xx', 'sesion1xx', 'sesion2xx', 'sesion3xx', 'sesion4xx']);
    expect(filas().map((f) => f._n)).toEqual([2, 3, 4, 5, 6]);
  });

  test('no guarda nada que identifique a la clienta: solo las 7 columnas del contrato', () => {
    const { post, libro } = preparar();
    post(BUENO);
    const h = libro.getSheetByName('eventos');
    expect(h.getLastColumn()).toBe(7);
    expect(h.getRange(2, 1, 1, 7).getValues()[0].slice(1)).toEqual(['whatsapp', 'prd_1a2b3c4d', '', 'web', '/p/ves-014/', 'a1b2c3d4']);
  });
});

describe('doPost: eventos que no cumplen el formato', () => {
  const invalido = (cuerpo) => {
    const { post, filas } = preparar();
    expect(post(cuerpo)).toEqual({ ok: false, error: 'evento_invalido' });
    expect(filas()).toHaveLength(0);
  };

  test.each([
    ['tipo desconocido', { ...BUENO, t: 'compra' }],
    ['origen desconocido', { ...BUENO, o: 'tiktok' }],
    ['prenda mal formada', { ...BUENO, p: 'prd_1A2B3C4D' }],
    ['prenda de otra entidad', { ...BUENO, p: 'tem_1a2b3c4d' }],
    ['temporada mal formada', { ...BUENO, s: 'tem_1a2b3c' }],
    ['página sin / inicial', { ...BUENO, pg: 'p/ves-014/' }],
    ['página que empieza con =', { ...BUENO, pg: '=HYPERLINK("x")' }],
    ['página con espacios', { ...BUENO, pg: '/p/ves 014/' }],
    ['página con un enlace entero', { ...BUENO, pg: 'https://malo.example.com/' }],
    ['página con paréntesis o +', { ...BUENO, pg: '/=1+SUM(2)' }],
    ['página con comillas o <', { ...BUENO, pg: '/<script>' }],
    ['página de más de 200 caracteres', { ...BUENO, pg: '/' + 'a'.repeat(200) }],
    ['sesión corta', { ...BUENO, ss: 'abc1234' }],
    ['sesión larga', { ...BUENO, ss: 'a'.repeat(33) }],
    ['sesión con mayúsculas', { ...BUENO, ss: 'ABCDEFGH' }],
    ['sesión con guion', { ...BUENO, ss: 'abcd-efgh' }],
    ['falta el tipo', { o: 'web', pg: '/', ss: 'abcdefgh' }],
    ['falta el origen', { t: 'vista', pg: '/', ss: 'abcdefgh' }],
    ['falta la página', { t: 'vista', o: 'web', ss: 'abcdefgh' }],
    ['falta la sesión', { t: 'vista', o: 'web', pg: '/' }],
    ['un dato personal de más', { ...BUENO, email: 'ana@example.com' }],
    ['una IP de más', { ...BUENO, ip: '1.2.3.4' }],
    ['tipos que no son texto', { ...BUENO, t: 5, ss: 12345678 }],
    ['campos con objetos', { ...BUENO, pg: { a: 1 } }],
    ['una lista en vez de un objeto', [BUENO]],
    ['null', null],
    ['un número', 5],
    ['un texto', 'hola'],
  ])('%s', (_, cuerpo) => invalido(cuerpo));

  test.each([['JSON roto', '{t:'], ['vacío', ''], ['solo espacios', '   '], ['gigante', JSON.stringify({ ...BUENO, ss: 'a'.repeat(5000) })]])('cuerpo: %s', (_, texto) => invalido(texto));

  test('sin cuerpo (postData ausente)', () => {
    const { api, filas } = preparar();
    expect(JSON.parse(api.doPost({}).getContent())).toEqual({ ok: false, error: 'evento_invalido' });
    expect(JSON.parse(api.doPost(undefined).getContent())).toEqual({ ok: false, error: 'evento_invalido' });
    expect(filas()).toHaveLength(0);
  });
});

// Cada escritura en la hoja adelanta el reloj de los dobles 1 s: para contar minutos se fija la hora.
function conHoraFija(p) {
  const hora = { ms: Date.parse('2026-12-01T12:00:10-05:00') };
  p.api.ahora_ = () => new Date(hora.ms);
  return hora;
}

describe('doPost: límite de 120 por minuto', () => {
  test('el evento 121 del mismo minuto se descarta en silencio y no se escribe', () => {
    const p = preparar();
    conHoraFija(p);
    const { post, filas } = p;
    for (let i = 0; i < 120; i++) expect(post(BUENO)).toEqual({ ok: true });
    expect(post(BUENO)).toEqual({ ok: true, descartado: true });
    expect(post(BUENO)).toEqual({ ok: true, descartado: true });
    expect(filas()).toHaveLength(120);
  });

  test('al minuto siguiente vuelve a aceptar', () => {
    const p = preparar();
    const hora = conHoraFija(p);
    const { post, filas } = p;
    for (let i = 0; i < 121; i++) post(BUENO);
    hora.ms += 61_000;
    expect(post(BUENO)).toEqual({ ok: true });
    expect(filas()).toHaveLength(121);
  });

  test('los eventos inválidos no gastan el cupo', () => {
    const { post, filas } = preparar();
    for (let i = 0; i < 300; i++) post({ ...BUENO, t: 'malo' });
    expect(post(BUENO)).toEqual({ ok: true });
    expect(filas()).toHaveLength(1);
  });

  test('si no se consigue el candado, descarta en vez de arriesgar la hoja', () => {
    const { post, filas, dobles } = preparar();
    dobles._candado.fallar = true;
    expect(post(BUENO)).toEqual({ ok: true, descartado: true });
    expect(filas()).toHaveLength(0);
  });
});

// Un abuso sostenido no debe poder llenar el libro (10 millones de celdas, el mismo de los productos):
// ni con filas en `eventos` ni con ids inventados que luego crecen en `estadisticas_diarias`.
describe('doPost: solo prendas y temporadas publicadas', () => {
  test('descarta en silencio un evento con una prenda que no está publicada', () => {
    const { post, filas } = preparar();
    expect(post({ ...BUENO, p: 'prd_ffffffff' })).toEqual({ ok: true, descartado: true });
    expect(filas()).toHaveLength(0);
  });

  test('descarta en silencio un evento con una temporada que no está publicada', () => {
    const { post, filas } = preparar();
    expect(post({ ...BUENO, p: null, s: 'tem_ffffffff' })).toEqual({ ok: true, descartado: true });
    expect(filas()).toHaveLength(0);
  });

  test('sin copia publicada solo acepta eventos que no nombran prenda ni temporada', () => {
    const { post, filas } = preparar({ publicar: false });
    expect(post(BUENO)).toEqual({ ok: true, descartado: true });
    expect(post({ ...BUENO, p: null })).toEqual({ ok: true });
    expect(filas()).toHaveLength(1);
  });

  test('una publicación nueva actualiza la lista: la prenda recién publicada ya cuenta', () => {
    const p = preparar();
    expect(p.post({ ...BUENO, p: 'prd_99999999' })).toEqual({ ok: true, descartado: true });
    publicar(p, { productos: ['prd_1a2b3c4d', 'prd_99999999'] });
    expect(p.post({ ...BUENO, p: 'prd_99999999' })).toEqual({ ok: true });
    expect(p.filas()).toHaveLength(1);
  });

  test('no vuelve a leer la copia publicada en cada evento', () => {
    const p = preparar();
    const copia = publicar(p);
    const lecturas = [];
    const original = p.dobles.DriveApp.getFileById;
    p.dobles.DriveApp.getFileById = (id) => {
      const f = original(id);
      if (id === copia.getId()) {
        const blob = f.getBlob;
        f.getBlob = () => (lecturas.push(id), blob());
      }
      return f;
    };
    for (let i = 0; i < 5; i++) expect(p.post(BUENO)).toEqual({ ok: true });
    expect(lecturas).toHaveLength(1);
  });
});

describe('doPost: tope de filas de la pestaña eventos', () => {
  test('al llegar al tope descarta en vez de seguir agrandando el libro', () => {
    const p = preparar();
    p.api.topeFilasEventos_ = () => 3;
    for (let i = 0; i < 3; i++) expect(p.post(BUENO)).toEqual({ ok: true });
    expect(p.post(BUENO)).toEqual({ ok: true, descartado: true });
    expect(p.filas()).toHaveLength(3);
  });

  test('el tope real deja el libro muy por debajo de los 10 millones de celdas y alcanza para una tienda', () => {
    const { api } = preparar();
    expect(api.topeFilasEventos_() * 7).toBeLessThanOrEqual(1_000_000);
    expect(api.topeFilasEventos_()).toBeGreaterThanOrEqual(50_000); // ~1 400 eventos por día durante los 35 días que se guardan
  });
});

describe('errores internos', () => {
  test('sin instalar responde sin_instalacion', () => {
    const api = cargarGas('api');
    const r = JSON.parse(api.ctx.doPost({ postData: { contents: JSON.stringify(BUENO) } }).getContent());
    expect(r).toEqual({ ok: false, error: 'sin_instalacion' });
  });

  test('si la hoja no se puede abrir, doPost responde «interno» sin detalles', () => {
    const { post, dobles } = preparar();
    dobles.SpreadsheetApp.openById = () => {
      throw new Error('Exception: secreto interno con ids de Drive 1AbC');
    };
    const r = post(BUENO);
    expect(r).toEqual({ ok: false, error: 'interno' });
    expect(JSON.stringify(r)).not.toContain('secreto');
  });

  test('si Drive falla, doGet responde «interno» sin detalles', () => {
    const { api, dobles } = preparar();
    dobles.DriveApp.searchFiles = () => {
      throw new Error('Exception: detalle privado');
    };
    const r = JSON.parse(api.doGet({ parameter: { r: 'catalogo' } }).getContent());
    expect(r).toEqual({ ok: false, error: 'interno' });
  });

  test('doGet sin parámetros tampoco lanza', () => {
    const { api } = preparar();
    expect(JSON.parse(api.doGet().getContent())).toEqual({ ok: false, error: 'ruta_desconocida' });
    expect(JSON.parse(api.doGet({}).getContent())).toEqual({ ok: false, error: 'ruta_desconocida' });
  });

  test('la hoja de eventos sin su pestaña responde sin_instalacion', () => {
    const { post, libro } = preparar();
    libro.deleteSheet(libro.getSheetByName('eventos'));
    expect(post(BUENO)).toEqual({ ok: false, error: 'sin_instalacion' });
  });
});
