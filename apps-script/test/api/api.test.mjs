import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const PUNTERO = 'catalogo-ropa.config.json';

// Arma un Drive con carpeta raíz y, si se pide, foto, copia publicada y puntero.
// La visita es anónima (usuario vacío), como en la web pública.
function preparar({ conPuntero = true, publicar = true, fotoBytes = [1, 2, 3, -1] } = {}) {
  const dobles = crearDobles({ usuario: '', dueno: 'duena@example.com' });
  const { DriveApp, Utilities } = dobles;
  const raiz = DriveApp.createFolder('Catálogo Ropa');
  const foto = raiz.createFile(Utilities.newBlob(fotoBytes, 'image/jpeg', 'VES-001.jpg'));
  const privada = raiz.createFile(Utilities.newBlob([9, 9, 9], 'image/jpeg', 'privada.jpg'));
  const publicado = { version_esquema: 1, productos: [], fotos: { [foto.getId()]: { actualizado: '2026-12-01T10:00:00-05:00' } } };
  const archivoPublicado = publicar ? raiz.createFile('catalogo-publicado.json', JSON.stringify(publicado), 'application/json') : null;
  const puntero = conPuntero
    ? raiz.createFile(PUNTERO, JSON.stringify({ version: 1, hoja_id: 'x', carpetas: { raiz: raiz.getId() }, publicado_id: archivoPublicado?.getId() ?? null }), 'application/json')
    : null;
  const { ctx } = cargarGas('api', { dobles });
  return { ctx, dobles, foto, privada, publicado, puntero, raiz };
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
    expect(r.datos.nombre).toBe('VES-001.jpg');
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

  test('con dos punteros usa el modificado más recientemente', () => {
    const { ctx, dobles, raiz, puntero } = preparar();
    const viejo = raiz.createFile(PUNTERO, JSON.stringify({ version: 1, hoja_id: 'x', carpetas: {}, publicado_id: null }), 'application/json');
    expect(llamar(ctx, { r: 'catalogo' }).error).toBe('sin_publicacion'); // el más nuevo no tiene publicación
    dobles._drive.fijarActualizado(viejo.getId(), '2026-01-01T00:00:00-05:00');
    dobles._drive.fijarActualizado(puntero.getId(), '2026-12-31T00:00:00-05:00');
    dobles.PropertiesService.getScriptProperties().deleteProperty('CR_PUNTERO_ID');
    expect(llamar(ctx, { r: 'catalogo' }).ok).toBe(true);
  });

  test('después de encontrarlo una vez no vuelve a buscar por nombre', () => {
    const { ctx, dobles } = preparar();
    const original = dobles.DriveApp.getFilesByName;
    let busquedas = 0;
    dobles.DriveApp.getFilesByName = (n) => (busquedas++, original(n));
    llamar(ctx, { r: 'catalogo' });
    llamar(ctx, { r: 'catalogo' });
    expect(busquedas).toBe(1);
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
