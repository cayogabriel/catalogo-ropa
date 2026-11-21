import { describe, test, expect } from 'vitest';
import { cargarGas } from '../gas/cargar.mjs';
import { panelInstalado } from './ayudas.mjs';

// JPEG mínimo: SOI, APP0 (JFIF), [APP1 Exif], SOS, datos, EOI.
function jpeg({ exif = false, xmp = false, extra = 0 } = {}) {
  const partes = [[0xff, 0xd8], [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]];
  if (xmp) partes.push([0xff, 0xe1, 0x00, 0x08, 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f]); // «http:/» de un bloque XMP, no Exif
  if (exif) partes.push([0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02]); // «Exif\0\0»
  partes.push([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x45, 0x78, 0x69, 0x66, 0xff, 0xd9]); // «Exif» dentro de los datos: no cuenta
  const base = Buffer.concat(partes.map((p) => Buffer.from(p)));
  return extra ? Buffer.concat([base, Buffer.alloc(extra)]) : base;
}
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([20, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(20)]);

const archivo = (buf, extra = {}) => ({ nombre: 'Mi Vestido Rojo.JPG', mime: 'image/jpeg', base64: buf.toString('base64'), destino: 'producto', ...extra });

function nombresDe(carpeta) {
  const r = [];
  const it = carpeta.getFiles();
  while (it.hasNext()) r.push(it.next().getName());
  return r;
}
const punteroDe = (dobles) => JSON.parse(dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next().getBlob().getDataAsString());

describe('subirFoto()', () => {
  test('guarda un JPEG limpio en la carpeta de fotos y devuelve id, nombre y miniatura', () => {
    const { ctx, dobles } = panelInstalado();
    const r = ctx.subirFoto(archivo(jpeg()));
    expect(r.id).toMatch(/^[A-Za-z0-9_-]{10,100}$/);
    expect(r.nombre).toMatch(/^foto-mi-vestido-rojo-[0-9a-f]{4}\.jpg$/);
    expect(r.miniatura).toMatch(/^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/);
    const archivoDrive = dobles.DriveApp.getFileById(r.id);
    expect(archivoDrive.getMimeType()).toBe('image/jpeg');
    expect(archivoDrive.getParents().next().getId()).toBe(punteroDe(dobles).carpetas.fotos);
    expect([...Buffer.from(archivoDrive.getBlob().getBytes().map((b) => b & 255))]).toEqual([...jpeg()]);
  });

  test('con producto_id el nombre lleva el código de la prenda', () => {
    const { ctx } = panelInstalado();
    const cat = ctx.crear('categorias', { nombre: 'Vestidos' });
    const p = ctx.crear('productos', { categoria_id: cat.id });
    expect(ctx.subirFoto(archivo(jpeg(), { producto_id: p.id })).nombre).toMatch(/^VES-001-mi-vestido-rojo-[0-9a-f]{4}\.jpg$/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { producto_id: 'prd_ffffffff' }))).toThrow(/^no_encontrado:/);
  });

  test('una foto de temporada va a su carpeta y lleva el enlace de la temporada', () => {
    const { ctx, dobles } = panelInstalado();
    const t = ctx.crear('temporadas', { nombre: 'Verano 2027' });
    const r = ctx.subirFoto(archivo(PNG, { mime: 'image/png', nombre: 'playa.png', destino: 'temporada', temporada_id: t.id }));
    expect(r.nombre).toMatch(/^verano-2027-playa-[0-9a-f]{4}\.png$/);
    const carpeta = dobles.DriveApp.getFileById(r.id).getParents().next();
    expect(carpeta.getName()).toBe('verano-2027');
    expect(carpeta.getParents().next().getId()).toBe(punteroDe(dobles).carpetas.temporadas);
    // una segunda foto reutiliza la misma carpeta
    ctx.subirFoto(archivo(PNG, { mime: 'image/png', destino: 'temporada', temporada_id: t.id }));
    expect(nombresDe(carpeta)).toHaveLength(2);
  });

  test('portada y marca van a sus carpetas', () => {
    const { ctx, dobles } = panelInstalado();
    const c = punteroDe(dobles).carpetas;
    const portada = ctx.subirFoto(archivo(WEBP, { mime: 'image/webp', nombre: 'p.webp', destino: 'portada' }));
    const marca = ctx.subirFoto(archivo(jpeg(), { destino: 'marca' }));
    expect(dobles.DriveApp.getFileById(portada.id).getParents().next().getId()).toBe(c.portadas);
    expect(dobles.DriveApp.getFileById(marca.id).getParents().next().getId()).toBe(c.marca);
    expect(portada.nombre).toMatch(/^portada-p-[0-9a-f]{4}\.webp$/);
    expect(marca.nombre).toMatch(/^marca-/);
  });

  test('rechaza un JPEG que todavía trae EXIF (puede llevar la ubicación de la casa)', () => {
    const { ctx, dobles } = panelInstalado();
    expect(() => ctx.subirFoto(archivo(jpeg({ exif: true })))).toThrow(/^invalido: .*EXIF/);
    // un bloque APP1 que no es Exif no se rechaza
    expect(ctx.subirFoto(archivo(jpeg({ xmp: true }))).id).toBeTruthy();
    // y no quedó ningún archivo del intento rechazado
    expect(nombresDe(dobles.DriveApp.getFolderById(punteroDe(dobles).carpetas.fotos))).toHaveLength(1);
  });

  test('rechaza lo que no es imagen o no coincide con su tipo', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.subirFoto(archivo(jpeg(), { mime: 'image/gif' }))).toThrow(/^invalido: .*jpeg, png o webp/);
    expect(() => ctx.subirFoto(archivo(Buffer.from('%PDF-1.4 hola'), { mime: 'image/jpeg' }))).toThrow(/^invalido: .*no es un JPEG/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { mime: 'image/png' }))).toThrow(/^invalido: .*no es un PNG/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { mime: 'image/webp' }))).toThrow(/^invalido: .*no es un WEBP/);
  });

  test('rechaza un base64 roto, vacío o con prefijo data:', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.subirFoto(archivo(jpeg(), { base64: '***' }))).toThrow(/^invalido: .*base64/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { base64: '' }))).toThrow(/^invalido:/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { base64: 'data:image/jpeg;base64,/9j/' }))).toThrow(/^invalido: .*base64/);
  });

  test('hasta 8 MB entra; más de 8 MB es limite', () => {
    const { ctx } = panelInstalado();
    expect(ctx.subirFoto(archivo(jpeg({ extra: 8 * 1024 * 1024 - jpeg().length }))).id).toBeTruthy();
    expect(() => ctx.subirFoto(archivo(jpeg({ extra: 8 * 1024 * 1024 })))).toThrow(/^limite:/);
  });

  test('rechaza un destino desconocido, el nombre vacío y una temporada que falta o no existe', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.subirFoto(archivo(jpeg(), { destino: 'cielo' }))).toThrow(/^invalido: .*destino/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { nombre: '' }))).toThrow(/^invalido: .*nombre/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { destino: 'temporada' }))).toThrow(/^invalido: .*temporada_id/);
    expect(() => ctx.subirFoto(archivo(jpeg(), { destino: 'temporada', temporada_id: 'tem_ffffffff' }))).toThrow(/^no_encontrado:/);
    expect(() => ctx.subirFoto(null)).toThrow(/^invalido:/);
  });

  test('un nombre con ruta, tildes o símbolos queda limpio', () => {
    const { ctx } = panelInstalado();
    const r = ctx.subirFoto(archivo(jpeg(), { nombre: '../../Fotos Niñas/Vestido (1) ¡Lindo!.jpeg' }));
    expect(r.nombre).toMatch(/^foto-vestido-1-lindo-[0-9a-f]{4}\.jpg$/);
  });

  test('si la miniatura de Drive todavía no está lista, devuelve vacío y no falla', () => {
    const { ctx, dobles } = panelInstalado();
    const original = dobles.DriveApp.getFolderById;
    dobles.DriveApp.getFolderById = (id) => {
      const carpeta = original(id);
      const crear = carpeta.createFile;
      carpeta.createFile = (...args) => {
        const f = crear(...args);
        f.getThumbnail = () => null;
        return f;
      };
      return carpeta;
    };
    const mano = ctx.subirFoto(archivo(jpeg()));
    expect(mano.miniatura).toBe('');
  });

  test('sin instalar() pide instalar primero', () => {
    const { ctx } = cargarGas('panel');
    expect(() => ctx.subirFoto(archivo(jpeg()))).toThrow(/^no_encontrado: .*instalar/);
  });
});

describe('miniaturas()', () => {
  test('devuelve un data URL por foto y omite las que no existen o están en la papelera', () => {
    const { ctx, dobles } = panelInstalado();
    const a = ctx.subirFoto(archivo(jpeg()));
    const b = ctx.subirFoto(archivo(jpeg()));
    dobles.DriveApp.getFileById(b.id).setTrashed(true);
    const r = ctx.miniaturas([a.id, b.id, 'noExisteEsteId1']);
    expect(Object.keys(r)).toEqual([a.id]);
    expect(r[a.id]).toMatch(/^data:image\//);
  });

  test('máximo 40 ids; ids mal formados se ignoran; no entrega documentos que no son imágenes', () => {
    const { ctx, dobles } = panelInstalado();
    expect(() => ctx.miniaturas(Array.from({ length: 41 }, (_, i) => `idFalso${String(i).padStart(4, '0')}`))).toThrow(/^limite:/);
    expect(() => ctx.miniaturas('no es lista')).toThrow(/^invalido:/);
    const doc = dobles.DriveApp.createFile('notas', 'secreto', 'application/vnd.google-apps.document');
    expect(ctx.miniaturas([doc.getId(), '../x'])).toEqual({});
  });
});

describe('biblioteca()', () => {
  test('lista las fotos de las cuatro carpetas con su carpeta y sus usos', () => {
    const { ctx } = panelInstalado();
    const cat = ctx.crear('categorias', { nombre: 'Vestidos' });
    const p = ctx.crear('productos', { nombre: 'Vestido Lino', categoria_id: cat.id });
    const t = ctx.crear('temporadas', { nombre: 'Verano' });
    const f1 = ctx.subirFoto(archivo(jpeg(), { producto_id: p.id }));
    const f2 = ctx.subirFoto(archivo(jpeg(), { destino: 'temporada', temporada_id: t.id }));
    const f3 = ctx.subirFoto(archivo(jpeg(), { destino: 'portada' }));
    const f4 = ctx.subirFoto(archivo(jpeg(), { destino: 'marca' }));
    ctx.guardarCampo('productos', p.id, 'fotos', [f1.id], 1);
    ctx.crear('temporada_fotos', { temporada_id: t.id, foto: f2.id });
    ctx.guardarCampo('temporadas', t.id, 'foto_portada', f2.id, 1);
    ctx.guardarConfig('logo', f4.id);
    const r = ctx.biblioteca();
    expect(r).toMatchObject({ pagina: 1, total: 4 });
    const por = Object.fromEntries(r.fotos.map((x) => [x.id, x]));
    expect(por[f1.id]).toMatchObject({ carpeta: 'fotos', nombre: f1.nombre });
    expect(por[f1.id].actualizado).toMatch(/-05:00$/);
    expect(por[f1.id].usos).toEqual([{ entidad: 'productos', id: p.id, etiqueta: 'VES-001 · Vestido Lino' }]);
    expect(por[f2.id].carpeta).toBe('temporadas');
    expect(por[f2.id].usos.map((u) => u.entidad).sort()).toEqual(['temporada_fotos', 'temporadas']);
    expect(por[f3.id]).toMatchObject({ carpeta: 'portadas', usos: [] });
    expect(por[f4.id]).toMatchObject({ carpeta: 'marca', usos: [{ entidad: 'config', id: 'logo', etiqueta: 'Logo de la tienda' }] });
  });

  test('filtra por carpeta, pagina de 40 en 40, deja fuera la papelera y lo que no es imagen', () => {
    const { ctx, dobles } = panelInstalado();
    const ids = Array.from({ length: 45 }, () => ctx.subirFoto(archivo(jpeg())).id);
    ctx.subirFoto(archivo(jpeg(), { destino: 'marca' }));
    dobles.DriveApp.getFileById(ids[0]).setTrashed(true);
    const carpetas = dobles.DriveApp.getFolderById(punteroDe(dobles).carpetas.fotos);
    carpetas.createFile('lista.txt', 'hola', 'text/plain');
    const p1 = ctx.biblioteca({ carpeta: 'fotos' });
    expect(p1).toMatchObject({ pagina: 1, total: 44 });
    expect(p1.fotos).toHaveLength(40);
    const p2 = ctx.biblioteca({ carpeta: 'fotos', pagina: 2 });
    expect(p2.fotos).toHaveLength(4);
    expect(new Set([...p1.fotos, ...p2.fotos].map((f) => f.id)).size).toBe(44);
    expect(ctx.biblioteca({ carpeta: 'marca' }).total).toBe(1);
    expect(() => ctx.biblioteca({ carpeta: 'cielo' })).toThrow(/^invalido:/);
  });

  test('las más nuevas primero', () => {
    const { ctx } = panelInstalado();
    const a = ctx.subirFoto(archivo(jpeg(), { nombre: 'a.jpg' }));
    const b = ctx.subirFoto(archivo(jpeg(), { nombre: 'b.jpg' }));
    expect(ctx.biblioteca().fotos.map((f) => f.id)).toEqual([b.id, a.id]);
  });
});

describe('altaRapida()', () => {
  test('crea una prenda en borrador por foto y renombra la foto con el código', () => {
    const { ctx, dobles } = panelInstalado();
    const cat = ctx.crear('categorias', { nombre: 'Vestidos' });
    const f = [ctx.subirFoto(archivo(jpeg())), ctx.subirFoto(archivo(jpeg()))];
    const filas = ctx.altaRapida([f[0].id, f[1].id], { categoria_id: cat.id });
    expect(filas.map((x) => [x.codigo, x.estado, x.fotos, x.categoria_id])).toEqual([
      ['VES-001', 'borrador', [f[0].id], cat.id],
      ['VES-002', 'borrador', [f[1].id], cat.id],
    ]);
    expect(dobles.DriveApp.getFileById(f[0].id).getName()).toBe('VES-001-1.jpg');
    expect(ctx.listar('productos').filas).toHaveLength(2);
  });

  test('rechaza ids que no son fotos, una categoría que no existe y listas vacías o enormes', () => {
    const { ctx, dobles } = panelInstalado();
    const cat = ctx.crear('categorias', { nombre: 'Vestidos' });
    const doc = dobles.DriveApp.createFile('notas', 'x', 'application/vnd.google-apps.document');
    expect(() => ctx.altaRapida(['noExisteEsteId1'], { categoria_id: cat.id })).toThrow(/^no_encontrado:/);
    expect(() => ctx.altaRapida([doc.getId()], { categoria_id: cat.id })).toThrow(/^invalido: .*no es una imagen/);
    expect(() => ctx.altaRapida(['noExisteEsteId1'], { categoria_id: 'cat_ffffffff' })).toThrow(/categoria id/);
    expect(() => ctx.altaRapida(['noExisteEsteId1'], {})).toThrow(/^invalido: .*categoria_id/);
    expect(() => ctx.altaRapida([], { categoria_id: cat.id })).toThrow(/^invalido:/);
    expect(() => ctx.altaRapida(Array.from({ length: 41 }, (_, i) => `idFalso${String(i).padStart(4, '0')}`), { categoria_id: cat.id })).toThrow(/^limite:/);
    expect(ctx.listar('productos').filas).toEqual([]);
  });
});
