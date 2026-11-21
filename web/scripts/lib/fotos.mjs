// Descarga y procesamiento de fotos para la web. Contrato: docs/contracts/datos-web.md
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ANCHOS_IMPRESION, rutaImpresion } from '../../src/components/imprimir/rutas.mjs';
import { leerJsonDeApi } from './obtener.mjs';

export const ANCHOS = [480, 960, 1440];
export const OG_ANCHO = 1200;
export const OG_MAX_BYTES = 300_000;
// Súbela cuando cambie lo que produce procesarFoto: la caché se rehace entera.
export const VERSION_PROCESO = 2;
export const DESCARGAS_EN_PARALELO = 4;

// Medidas ya orientadas (EXIF 5–8 intercambian ancho y alto).
async function leerMedidas(buffer) {
  const m = await sharp(buffer).metadata();
  const giro = m.orientation >= 5;
  return { ancho: giro ? m.height : m.width, alto: giro ? m.width : m.height, transparencia: Boolean(m.hasAlpha) };
}

// Anchos del srcset: los de la lista que no superan el original, más el
// original si pasa de 960 y no está en la lista. Nunca se agranda.
export function anchosWebp(ancho) {
  const anchos = ANCHOS.filter((w) => w <= ancho);
  if (anchos.length === 0) return [ancho];
  if (ancho > 960 && !anchos.includes(ancho)) anchos.push(ancho);
  return anchos;
}

// og: JPG de hasta 1200 px y ≤ 300 KB. Primero baja la calidad; si no alcanza,
// baja el ancho. Si ni así entra, falla: WhatsApp no mostraría la vista previa.
async function generarOg(base, ancho) {
  for (let w = Math.min(OG_ANCHO, ancho); w >= 400; w = Math.round(w * 0.8)) {
    for (let calidad = 82; calidad >= 50; calidad -= 8) {
      const og = await base().resize({ width: w }).jpeg({ quality: calidad, mozjpeg: true }).toBuffer();
      if (og.length <= OG_MAX_BYTES) return og;
    }
  }
  throw new Error(`la vista previa (og) no baja de ${OG_MAX_BYTES / 1000} KB`);
}

export async function procesarFoto(buffer, { id, dirSalida }) {
  const { ancho, alto, transparencia } = await leerMedidas(buffer);
  mkdirSync(join(dirSalida, 'img', 'og'), { recursive: true });
  mkdirSync(join(dirSalida, 'img', 'imprimir'), { recursive: true });
  // Un PNG con transparencia se apoya sobre blanco (el JPG no tiene alfa y
  // quedaría negro).
  const base = () => {
    const s = sharp(buffer).rotate();
    return transparencia ? s.flatten({ background: '#ffffff' }) : s;
  };

  const webp = {};
  for (const w of anchosWebp(ancho)) {
    const ruta = `img/${id}-${w}.webp`;
    await base().resize({ width: w }).webp({ quality: 78 }).toFile(join(dirSalida, ruta));
    webp[String(w)] = ruta;
  }

  const rutaOg = `img/og/${id}.jpg`;
  writeFileSync(join(dirSalida, rutaOg), await generarOg(base, ancho));

  for (const w of ANCHOS_IMPRESION) {
    await base()
      .resize({ width: Math.min(w, ancho) })
      .jpeg({ quality: w > 600 ? 80 : 74, mozjpeg: true })
      .toFile(join(dirSalida, rutaImpresion(id, w)));
  }

  const mini = await base().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return { ancho, alto, lqip: `data:image/webp;base64,${mini.toString('base64')}`, webp, og: rutaOg };
}

// Archivos que deja procesarFoto para una foto (para copiarlos o borrarlos).
export const archivosDeFoto = (id, meta) => [...Object.values(meta.webp ?? {}), meta.og, ...ANCHOS_IMPRESION.map((w) => rutaImpresion(id, w))].filter(Boolean);

// Dónde se usa una foto, para que un error diga a qué producto afecta.
export function usosDeFoto(catalogo, id) {
  const usos = [];
  for (const p of catalogo.productos) if (p.fotos.some((f) => f.id === id)) usos.push(p.codigo);
  for (const c of catalogo.categorias) if (c.foto?.id === id) usos.push(`categoría ${c.slug}`);
  for (const t of catalogo.temporadas) {
    if (t.foto_portada.id === id || t.fotos.some((f) => f.foto.id === id)) usos.push(`temporada ${t.slug}`);
  }
  for (const po of catalogo.portadas) {
    if (po.foto_escritorio.id === id || po.foto_movil?.id === id) usos.push(`portada ${po.id}`);
  }
  if (catalogo.tienda.logo?.id === id) usos.push('logo');
  return usos;
}

const describirUsos = (catalogo, id) => usosDeFoto(catalogo, id).join(', ') || 'sin uso';

// Índice de la caché: { version, fotos: { <id>: { actualizado, meta } } }.
// Un índice de otra versión (o del formato viejo, sin versión) se descarta.
export function leerIndice(dirCache) {
  const ruta = join(dirCache, 'indice.json');
  const vacio = { version: VERSION_PROCESO, fotos: {} };
  if (!existsSync(ruta)) return vacio;
  try {
    const indice = JSON.parse(readFileSync(ruta, 'utf8'));
    return indice.version === VERSION_PROCESO && indice.fotos ? indice : vacio;
  } catch {
    return vacio;
  }
}

export function guardarIndice(dirCache, indice) {
  mkdirSync(dirCache, { recursive: true });
  writeFileSync(join(dirCache, 'indice.json'), JSON.stringify(indice, null, 2));
}

// Pendiente = sin entrada en el índice, con otra fecha, o sin sus archivos procesados.
export function fotosPendientes(catalogo, indice, dirCache) {
  return Object.entries(catalogo.fotos)
    .filter(([id, f]) => {
      const entrada = indice.fotos[id];
      return !entrada || entrada.actualizado !== f.actualizado || !existsSync(join(dirCache, 'img', 'og', `${id}.jpg`));
    })
    .map(([id]) => id);
}

// Procesa las fotos recién descargadas, borra de la caché las que el catálogo
// ya no usa y guarda el índice. Devuelve el índice al día.
export async function procesarPendientes(catalogo, nuevas, { dirCache }) {
  const indice = leerIndice(dirCache);
  for (const [id, buffer] of nuevas) {
    try {
      indice.fotos[id] = { actualizado: catalogo.fotos[id].actualizado, meta: await procesarFoto(buffer, { id, dirSalida: dirCache }) };
    } catch (e) {
      throw new Error(`No se pudo procesar la foto ${id} (usada en: ${describirUsos(catalogo, id)}): ${e.message}`);
    }
  }
  for (const [id, entrada] of Object.entries(indice.fotos)) {
    if (id in catalogo.fotos) continue;
    for (const ruta of archivosDeFoto(id, entrada.meta)) rmSync(join(dirCache, ruta), { force: true });
    delete indice.fotos[id];
  }
  guardarIndice(dirCache, indice);
  return indice;
}

// Único punto que sabe de dónde salen los bytes de una foto. Si la ruta por la
// API falla con Google real, el plan B del spec (copia compartida por enlace)
// se implementa aquí sin tocar nada más.
async function descargarUna(id, { origen, apiUrl, fetch, dirFixture }) {
  if (origen === 'fixture') return readFileSync(join(dirFixture, `${id}.jpg`));
  const sobre = await leerJsonDeApi(`${apiUrl}?r=foto&id=${encodeURIComponent(id)}`, fetch);
  if (!sobre.ok) throw new Error(sobre.error);
  return Buffer.from(sobre.datos.base64, 'base64');
}

// Ejecuta tarea(item) con a lo sumo `limite` en curso. Corta en el primer error.
async function enParalelo(items, limite, tarea) {
  const cola = [...items];
  let fallo = false;
  const trabajador = async () => {
    while (cola.length && !fallo) {
      try {
        await tarea(cola.shift());
      } catch (e) {
        fallo = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
}

export async function descargarFotos(
  catalogo,
  { origen, apiUrl, fetch = globalThis.fetch, dirCache, dirFixture, concurrencia = DESCARGAS_EN_PARALELO },
) {
  const pendientes = fotosPendientes(catalogo, leerIndice(dirCache), dirCache);
  const fotos = new Map();
  await enParalelo(pendientes, concurrencia, async (id) => {
    try {
      fotos.set(id, await descargarUna(id, { origen, apiUrl, fetch, dirFixture }));
    } catch (e) {
      throw new Error(`No se pudo obtener la foto ${id} (usada en: ${describirUsos(catalogo, id)}): ${e.message}`);
    }
  });
  return fotos;
}
