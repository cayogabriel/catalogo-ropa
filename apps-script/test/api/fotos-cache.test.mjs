// ?r=foto: caché del índice de fotos publicadas (no debe servir nunca una lista vieja).
import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

function preparar() {
  const dobles = crearDobles({ usuario: '', dueno: 'duena@example.com' });
  const { DriveApp, Utilities } = dobles;
  const raiz = DriveApp.createFolder('Catálogo Ropa');
  const a = raiz.createFile(Utilities.newBlob([1, 2, 3], 'image/jpeg', 'a.jpg'));
  const b = raiz.createFile(Utilities.newBlob([4, 5, 6], 'image/jpeg', 'b.jpg'));
  const publicado = raiz.createFile('catalogo-publicado.json', JSON.stringify({ fotos: { [a.getId()]: { actualizado: '2026-12-01T10:00:00-05:00' } } }), 'application/json');
  raiz.createFile('catalogo-ropa.config.json', JSON.stringify({ version: 1, hoja_id: 'x', carpetas: {}, publicado_id: publicado.getId() }), 'application/json');
  const { ctx } = cargarGas('api', { dobles });
  const lecturas = [];
  const original = DriveApp.getFileById;
  DriveApp.getFileById = (id) => {
    const f = original(id);
    if (id === publicado.getId()) {
      const blob = f.getBlob;
      f.getBlob = () => (lecturas.push(id), blob());
    }
    return f;
  };
  const foto = (id) => JSON.parse(ctx.doGet({ parameter: { r: 'foto', id } }).getContent());
  return { dobles, a, b, publicado, foto, lecturas };
}

describe('caché del índice de fotos', () => {
  test('la segunda foto no vuelve a leer ni analizar la copia publicada', () => {
    const { a, foto, lecturas } = preparar();
    expect(foto(a.getId()).ok).toBe(true);
    expect(foto(a.getId()).ok).toBe(true);
    expect(foto(a.getId()).ok).toBe(true);
    expect(lecturas).toHaveLength(1);
  });

  test('una publicación nueva invalida la caché: la foto nueva se sirve y la quitada ya no', () => {
    const { a, b, publicado, foto, dobles } = preparar();
    expect(foto(a.getId()).ok).toBe(true);
    expect(foto(b.getId())).toEqual({ ok: false, error: 'foto_no_publicada' });
    publicado.setContent(JSON.stringify({ fotos: { [b.getId()]: { actualizado: '2026-12-02T10:00:00-05:00' } } }));
    expect(dobles._reloj.ahora()).toBeGreaterThan(0);
    expect(foto(b.getId()).ok).toBe(true);
    expect(foto(a.getId())).toEqual({ ok: false, error: 'foto_no_publicada' });
  });

  test('una foto no publicada sigue rechazada sin abrir su archivo, también con la caché llena', () => {
    const { a, b, foto, dobles } = preparar();
    foto(a.getId());
    dobles._drive.llamadas.getFileById.length = 0;
    expect(foto(b.getId())).toEqual({ ok: false, error: 'foto_no_publicada' });
    expect(dobles._drive.llamadas.getFileById).not.toContain(b.getId());
  });

  test('si la caché vence o se vacía, se vuelve a leer y funciona igual', () => {
    const { a, foto, lecturas, dobles } = preparar();
    foto(a.getId());
    dobles._reloj.saltar(11 * 60 * 1000);
    expect(foto(a.getId()).ok).toBe(true);
    expect(lecturas).toHaveLength(2);
  });

  test('sin copia publicada responde sin_publicacion', () => {
    const { a, publicado, foto } = preparar();
    publicado.setTrashed(true);
    expect(foto(a.getId())).toEqual({ ok: false, error: 'sin_publicacion' });
  });

  test('un id que no es texto (por ejemplo un arreglo) no pasa la lista blanca', () => {
    const { foto } = preparar();
    expect(foto(['a'])).toEqual({ ok: false, error: 'foto_no_publicada' });
  });
});
