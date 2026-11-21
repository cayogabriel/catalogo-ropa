// Descarga y procesamiento de fotos para la web. Contrato: docs/contracts/datos-web.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const ANCHOS = [480, 960, 1440];
export const OG_ANCHO = 1200;
export const OG_MAX_BYTES = 300_000;

// Medidas ya orientadas (EXIF 5–8 intercambian ancho y alto).
async function medidas(buffer) {
  const m = await sharp(buffer).metadata();
  return m.orientation >= 5 ? { ancho: m.height, alto: m.width } : { ancho: m.width, alto: m.height };
}

export async function procesarFoto(buffer, { id, dirSalida }) {
  const { ancho, alto } = await medidas(buffer);
  mkdirSync(join(dirSalida, 'img', 'og'), { recursive: true });
  const base = () => sharp(buffer).rotate();

  const anchos = ANCHOS.filter((w) => w <= ancho);
  if (anchos.length === 0) anchos.push(ancho);
  const webp = {};
  for (const w of anchos) {
    const ruta = `img/${id}-${w}.webp`;
    await base().resize({ width: w }).webp({ quality: 78 }).toFile(join(dirSalida, ruta));
    webp[String(w)] = ruta;
  }

  // og: JPG de hasta 1200 px; baja la calidad hasta pesar ≤ 300 KB.
  let calidad = 82;
  let og;
  do {
    og = await base().resize({ width: Math.min(OG_ANCHO, ancho) }).jpeg({ quality: calidad, mozjpeg: true }).toBuffer();
    calidad -= 8;
  } while (og.length > OG_MAX_BYTES && calidad > 30);
  const rutaOg = `img/og/${id}.jpg`;
  writeFileSync(join(dirSalida, rutaOg), og);

  const mini = await base().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return { ancho, alto, lqip: `data:image/webp;base64,${mini.toString('base64')}`, webp, og: rutaOg };
}

// Dónde se usa una foto, para que un error diga a qué producto afecta.
export function usosDeFoto(catalogo, id) {
  const usos = [];
  for (const p of catalogo.productos) if (p.fotos.some((f) => f.id === id)) usos.push(p.codigo);
  for (const t of catalogo.temporadas) {
    if (t.foto_portada.id === id || t.fotos.some((f) => f.foto.id === id)) usos.push(`temporada ${t.slug}`);
  }
  for (const po of catalogo.portadas) {
    if (po.foto_escritorio.id === id || po.foto_movil?.id === id) usos.push(`portada ${po.id}`);
  }
  if (catalogo.tienda.logo?.id === id) usos.push('logo');
  return usos;
}

export function leerIndice(dirCache) {
  const ruta = join(dirCache, 'indice.json');
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {};
}

export function guardarIndice(dirCache, indice) {
  mkdirSync(dirCache, { recursive: true });
  writeFileSync(join(dirCache, 'indice.json'), JSON.stringify(indice, null, 2));
}

// Pendiente = sin entrada en el índice, con otra fecha, o sin sus archivos procesados.
export function fotosPendientes(catalogo, indice, dirCache) {
  return Object.entries(catalogo.fotos)
    .filter(([id, f]) => {
      const entrada = indice[id];
      return !entrada || entrada.actualizado !== f.actualizado || !existsSync(join(dirCache, 'img', 'og', `${id}.jpg`));
    })
    .map(([id]) => id);
}

async function descargarUna(id, { origen, apiUrl, fetch, dirFixture }) {
  if (origen === 'fixture') return readFileSync(join(dirFixture, `${id}.jpg`));
  const respuesta = await fetch(`${apiUrl}?r=foto&id=${encodeURIComponent(id)}`, { redirect: 'follow' });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  const sobre = await respuesta.json();
  if (!sobre.ok) throw new Error(sobre.error);
  return Buffer.from(sobre.datos.base64, 'base64');
}

export async function descargarFotos(catalogo, { origen, apiUrl, fetch = globalThis.fetch, dirCache, dirFixture }) {
  const pendientes = fotosPendientes(catalogo, leerIndice(dirCache), dirCache);
  const fotos = new Map();
  for (const id of pendientes) {
    try {
      fotos.set(id, await descargarUna(id, { origen, apiUrl, fetch, dirFixture }));
    } catch (e) {
      const usos = usosDeFoto(catalogo, id).join(', ') || 'sin uso';
      throw new Error(`No se pudo obtener la foto ${id} (usada en: ${usos}): ${e.message}`);
    }
  }
  return fotos;
}
