import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const PUNTERO = 'catalogo-ropa.config.json';

// Arma un Drive con carpeta raíz y, si se pide, foto, copia publicada y puntero.
// La visita es anónima (usuario vacío), como en la web pública.
function preparar({ conPuntero = true, publicar = true, fotoBytes = [1, 2, 3, -1], documentoPublicado = false } = {}) {
  const dobles = crearDobles({ usuario: '', dueno: 'duena@example.com' });
  const { DriveApp, Utilities } = dobles;
  const raiz = DriveApp.createFolder('Catálogo Ropa');
  const foto = raiz.createFile(Utilities.newBlob(fotoBytes, 'image/jpeg', 'VES-001.jpg'));
  const privada = raiz.createFile(Utilities.newBlob([9, 9, 9], 'image/jpeg', 'privada.jpg'));
  const documento = raiz.createFile('notas privadas', 'secreto', 'application/vnd.google-apps.document');
  const fotos = { [foto.getId()]: { actualizado: '2026-12-01T10:00:00-05:00' } };
  if (documentoPublicado) fotos[documento.getId()] = { actualizado: '2026-12-01T10:00:00-05:00' };
  const publicado = { version_esquema: 1, productos: [], fotos };
  const archivoPublicado = publicar ? raiz.createFile('catalogo-publicado.json', JSON.stringify(publicado), 'application/json') : null;
  const puntero = conPuntero
    ? raiz.createFile(PUNTERO, JSON.stringify({ version: 1, hoja_id: 'x', carpetas: { raiz: raiz.getId() }, publicado_id: archivoPublicado?.getId() ?? null }), 'application/json')
    : null;
  const { ctx } = cargarGas('api', { dobles });
  return { ctx, dobles, foto, privada, documento, publicado, puntero, raiz };
}

const llamar = (ctx, parametros) => JSON.parse(ctx.doGet({ parameter: parametros }).getContent());

describe('?r=catalogo', () => {
  test('sin puntero responde sin_instalacion', () => {
    const { ctx } = preparar({ conPuntero: false });
    expect(llamar(ctx, { r: 'catalogo' })).toEqual({ ok: false, error: 'sin_instalacion' });
  });

  test('con puntero pero sin publicación responde sin_publicacion', () => {
    const { ctx } = preparar({ publicar: false });
    expect(llamar(ctx, { r: 'catalogo' })).toEqual({ ok: false, error: 'sin_publicacion' });
  });

  test('devuelve la copia publicada tal cual', () => {
    const { ctx, publicado } = preparar();
    expect(llamar(ctx, { r: 'catalogo' })).toEqual({ ok: true, datos: publicado });
  });

  test('responde en JSON', () => {
    const { ctx, dobles } = preparar();
    expect(ctx.doGet({ parameter: { r: 'catalogo' } }).getMimeType()).toBe(dobles.ContentService.MimeType.JSON);
  });
});

describe('?r=foto', () => {
  test('una foto publicada vuelve en base64 con sus bytes exactos', () => {
    const { ctx, foto } = preparar();
    const r = llamar(ctx, { r: 'foto', id: foto.getId() });
    expect(r.ok).toBe(true);
    expect(r.datos.mime).toBe('image/jpeg');
    expect(Object.keys(r.datos).sort()).toEqual(['base64', 'mime']);
    expect([...Buffer.from(r.datos.base64, 'base64')]).toEqual([1, 2, 3, 255]);
  });

  test('una foto que existe pero no está publicada se rechaza sin abrirla', () => {
    const { ctx, dobles, privada } = preparar();
    expect(llamar(ctx, { r: 'foto', id: privada.getId() })).toEqual({ ok: false, error: 'foto_no_publicada' });
    expect(dobles._drive.llamadas.getFileById).not.toContain(privada.getId());
  });

  test('sin id se rechaza como no publicada', () => {
    const { ctx } = preparar();
    expect(llamar(ctx, { r: 'foto' })).toEqual({ ok: false, error: 'foto_no_publicada' });
  });

  test('una foto publicada de más de 8 MB se rechaza', () => {
    const { ctx, foto } = preparar({ fotoBytes: Buffer.alloc(9 * 1024 * 1024) });
    expect(llamar(ctx, { r: 'foto', id: foto.getId() })).toEqual({ ok: false, error: 'foto_muy_grande' });
  });

  test('un id publicado que no es una imagen (p. ej. un Doc) no se entrega', () => {
    const { ctx, documento } = preparar({ documentoPublicado: true });
    expect(llamar(ctx, { r: 'foto', id: documento.getId() })).toEqual({ ok: false, error: 'foto_no_disponible' });
  });

  test('una foto publicada que se borró de Drive responde foto_no_disponible', () => {
    const { ctx, foto } = preparar();
    foto.setTrashed(true);
    expect(llamar(ctx, { r: 'foto', id: foto.getId() })).toEqual({ ok: false, error: 'foto_no_disponible' });
  });
});

describe('rutas y puntero', () => {
  test('una ruta desconocida o vacía responde ruta_desconocida', () => {
    const { ctx } = preparar();
    expect(llamar(ctx, { r: 'admin' })).toEqual({ ok: false, error: 'ruta_desconocida' });
    expect(llamar(ctx, {})).toEqual({ ok: false, error: 'ruta_desconocida' });
  });

  test('con dos punteros usa el modificado más recientemente, también si ya había uno guardado', () => {
    const { ctx, dobles, raiz, puntero } = preparar();
    expect(llamar(ctx, { r: 'catalogo' }).ok).toBe(true); // guarda el puntero bueno
    const nuevo = raiz.createFile(PUNTERO, JSON.stringify({ version: 1, hoja_id: 'x', carpetas: {}, publicado_id: null }), 'application/json');
    expect(llamar(ctx, { r: 'catalogo' }).error).toBe('sin_publicacion'); // el más nuevo no tiene publicación
    dobles._drive.fijarActualizado(nuevo.getId(), '2026-01-01T00:00:00-05:00');
    dobles._drive.fijarActualizado(puntero.getId(), '2026-12-31T00:00:00-05:00');
    expect(llamar(ctx, { r: 'catalogo' }).ok).toBe(true);
  });

  test('?r=catalogo vuelve a buscar el puntero; ?r=foto usa el ya encontrado', () => {
    const { ctx, dobles, foto } = preparar();
    llamar(ctx, { r: 'catalogo' });
    llamar(ctx, { r: 'foto', id: foto.getId() });
    llamar(ctx, { r: 'foto', id: foto.getId() });
    expect(dobles._drive.llamadas.searchFiles).toHaveLength(1);
    llamar(ctx, { r: 'catalogo' });
    expect(dobles._drive.llamadas.searchFiles).toHaveLength(2);
  });

  test('un puntero en la papelera no cuenta', () => {
    const { ctx, puntero } = preparar();
    puntero.setTrashed(true);
    expect(llamar(ctx, { r: 'catalogo' })).toEqual({ ok: false, error: 'sin_instalacion' });
  });

  test('un puntero compartido por otra cuenta no cuenta, aunque sea más nuevo', () => {
    const { ctx, dobles, publicado } = preparar();
    const falso = dobles._drive.crearAjeno('catalogo-publicado.json', JSON.stringify({ fotos: {} }), 'application/json', 'intrusa@example.com');
    dobles._drive.crearAjeno(PUNTERO, JSON.stringify({ version: 1, hoja_id: 'x', carpetas: {}, publicado_id: falso.getId() }), 'application/json', 'intrusa@example.com');
    expect(llamar(ctx, { r: 'catalogo' })).toEqual({ ok: true, datos: publicado });
  });

  test('si el puntero guardado ya no existe, lo vuelve a buscar', () => {
    const { ctx, dobles } = preparar();
    dobles.PropertiesService.getScriptProperties().setProperty('CR_PUNTERO_ID', 'ya-no-existe');
    expect(llamar(ctx, { r: 'catalogo' }).ok).toBe(true);
  });
});

describe('el proyecto público es de solo lectura', () => {
  test('doPost todavía no registra eventos (lo completa S2)', () => {
    const { ctx } = preparar();
    expect(JSON.parse(ctx.doPost({ postData: { contents: '{}' } }).getContent())).toEqual({ ok: false, error: 'no_implementado' });
  });

  test('no define funciones de escritura ni de administración', () => {
    const dir = new URL('../../api/src/', import.meta.url);
    for (const nombre of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const codigo = readFileSync(new URL(nombre, dir), 'utf8');
      expect(codigo, nombre).not.toMatch(/function\s+(crear|guardar|eliminar|publicar|instalar)\w*/i);
    }
  });

  test('usa el mismo nombre de puntero que el Panel', () => {
    const api = cargarGas('api').valor('NOMBRE_PUNTERO');
    const panel = cargarGas('panel').valor('NOMBRE_PUNTERO');
    expect(api).toBe(panel);
  });

  test('el manifiesto la abre a cualquiera, ejecutando como la dueña, con permisos mínimos', () => {
    const manifiesto = JSON.parse(readFileSync(new URL('../../api/src/appsscript.json', import.meta.url), 'utf8'));
    expect(manifiesto.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
    expect(manifiesto.oauthScopes.sort()).toEqual([
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
    ]);
  });
});
