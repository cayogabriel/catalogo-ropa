// Fotos del simulador: miniaturas y la misma regla de EXIF que el servidor real.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const IMG = fileURLToPath(new URL('../../../fixtures/img/', import.meta.url));

const PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#d9d4cc"/></svg>',
  ).toString('base64');

// Recorre los segmentos del JPEG hasta el inicio de la imagen (SOS) y busca un APP1 que empiece con «Exif».
export function tieneExif(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marcador = buf[i + 1];
    if (marcador === 0xda) break;
    const largo = buf.readUInt16BE(i + 2);
    if (marcador === 0xe1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') return true;
    i += 2 + largo;
  }
  return false;
}

export function esImagen(buf, mime) {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png') return buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  if (mime === 'image/webp') return buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  return false;
}

const cache = new Map();

export function bufferDeSemilla(id) {
  const ruta = `${IMG}${id}.jpg`;
  return existsSync(ruta) ? readFileSync(ruta) : null;
}

// Data URL de unos 320 px. Si la imagen no se puede leer, un cuadro gris.
export async function miniaturaDe(id, buffer) {
  if (cache.has(id)) return cache.get(id);
  const buf = buffer ?? bufferDeSemilla(id);
  let url = PLACEHOLDER;
  if (buf) {
    try {
      const png = await sharp(buf).rotate().resize(320, 320, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
      url = `data:image/jpeg;base64,${png.toString('base64')}`;
    } catch {
      url = PLACEHOLDER;
    }
  }
  cache.set(id, url);
  return url;
}
