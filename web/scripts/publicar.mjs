// Prepara los datos del sitio antes de `astro build`:
// catálogo validado + fotos procesadas → web/src/data/catalogo.json y web/public/img/.
// Uso: node scripts/publicar.mjs --origen=api|fixture   (api usa CATALOG_API_URL)
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtenerCatalogo } from './lib/obtener.mjs';
import { descargarFotos, procesarFoto, leerIndice, guardarIndice } from './lib/fotos.mjs';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const rutas = {
  fixture: join(RAIZ, 'fixtures', 'catalogo.ejemplo.json'),
  fixtureImg: join(RAIZ, 'fixtures', 'img'),
  cache: join(WEB, '.cache', 'fotos'),
  publico: join(WEB, 'public'),
  datos: join(WEB, 'src', 'data', 'catalogo.json'),
};

const origen = (process.argv.find((a) => a.startsWith('--origen=')) ?? '--origen=api').split('=')[1];
const apiUrl = process.env.CATALOG_API_URL;

try {
  const catalogo = await obtenerCatalogo({ origen, apiUrl, rutaFixture: rutas.fixture });
  const nuevas = await descargarFotos(catalogo, { origen, apiUrl, dirCache: rutas.cache, dirFixture: rutas.fixtureImg });

  const indice = leerIndice(rutas.cache);
  for (const [id, buffer] of nuevas) {
    indice[id] = { actualizado: catalogo.fotos[id].actualizado, meta: await procesarFoto(buffer, { id, dirSalida: rutas.cache }) };
  }
  guardarIndice(rutas.cache, indice);

  // Solo las fotos del catálogo actual pasan al sitio.
  rmSync(join(rutas.publico, 'img'), { recursive: true, force: true });
  mkdirSync(join(rutas.publico, 'img', 'og'), { recursive: true });
  const imagenes = {};
  for (const id of Object.keys(catalogo.fotos)) {
    const { meta } = indice[id];
    for (const ruta of [...Object.values(meta.webp), meta.og]) cpSync(join(rutas.cache, ruta), join(rutas.publico, ruta));
    imagenes[id] = meta;
  }

  mkdirSync(dirname(rutas.datos), { recursive: true });
  writeFileSync(rutas.datos, JSON.stringify({ ...catalogo, imagenes }, null, 2));
  console.log(`Datos listos: ${catalogo.productos.length} productos, ${Object.keys(imagenes).length} fotos (${nuevas.size} procesadas ahora).`);
} catch (e) {
  console.error(`✗ Publicación detenida: ${e.message}`);
  process.exit(1);
}
