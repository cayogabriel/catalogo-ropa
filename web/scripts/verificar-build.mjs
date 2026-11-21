// Revisa el sitio construido antes de desplegarlo: cada producto tiene su página
// con og:image absoluto, y esa imagen existe y pesa ≤ 300 KB (límite de WhatsApp).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL_BASE } from '../sitio.config.mjs';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(WEB, 'dist');
const datos = JSON.parse(readFileSync(join(WEB, 'src', 'data', 'catalogo.json'), 'utf8'));
const errores = [];

if (!existsSync(join(DIST, 'index.html'))) errores.push('falta dist/index.html');

for (const p of datos.productos) {
  const pagina = join(DIST, 'p', p.codigo.toLowerCase(), 'index.html');
  if (!existsSync(pagina)) {
    errores.push(`${p.codigo}: falta su página`);
    continue;
  }
  const og = datos.imagenes[p.fotos[0].id].og;
  if (!readFileSync(pagina, 'utf8').includes(`property="og:image" content="${URL_BASE}${og}"`)) {
    errores.push(`${p.codigo}: og:image no apunta a ${URL_BASE}${og}`);
  }
  const archivo = join(DIST, og);
  if (!existsSync(archivo)) errores.push(`${p.codigo}: falta ${og}`);
  else if (statSync(archivo).size > 300_000) errores.push(`${p.codigo}: ${og} pesa más de 300 KB`);
}

if (errores.length) {
  console.error(`✗ El sitio no está listo:\n- ${errores.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: ${datos.productos.length} páginas de producto con vista previa válida (${URL_BASE}).`);
