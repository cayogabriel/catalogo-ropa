// Genera los documentos de la publicación después de `astro build`:
// revista PDF + JPG de carrusel de cada temporada con revista, catálogo PDF y
// dist/documentos.json. Contrato: docs/contracts/documentos.md
// Uso: node scripts/documentos.mjs   (necesita Chromium: npx playwright install chromium --only-shell)
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BASE } from '../sitio.config.mjs';
import { servirDist } from './lib/servidor.mjs';
import { rutasRevista, RUTA_CATALOGO, RUTA_MANIFIESTO, PAGINA, armarManifiesto, jpgHasta } from './lib/documentos.mjs';
import { ajustarPaginas } from './lib/ajustar.mjs';
import { revistasDe } from '../src/components/imprimir/plan.mjs';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(WEB, 'dist');
const base = BASE.replace(/\/?$/, '/').replace(/^\/?/, '/');
const catalogo = JSON.parse(readFileSync(join(WEB, 'src', 'data', 'catalogo.json'), 'utf8'));

const escribir = (ruta, datos) => {
  mkdirSync(dirname(join(DIST, ruta)), { recursive: true });
  writeFileSync(join(DIST, ruta), datos);
  return statSync(join(DIST, ruta)).size;
};

// Abre una página de impresión y espera fuentes y fotos. Cualquier archivo
// propio que falte (404) detiene todo: un PDF con fotos rotas no se publica.
async function abrir(contexto, url, nombre) {
  const pagina = await contexto.newPage();
  try {
    await prepararPagina(pagina, url, nombre);
    return pagina;
  } catch (e) {
    await pagina.close();
    throw e;
  }
}

async function prepararPagina(pagina, url, nombre) {
  const faltantes = [];
  pagina.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(new URL(url).origin)) faltantes.push(`${r.status()} ${r.url()}`);
  });
  const respuesta = await pagina.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  if (!respuesta?.ok()) throw new Error(`no se pudo abrir ${url} (HTTP ${respuesta?.status()})`);
  await pagina.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  });
  const rotas = await pagina.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
  if (faltantes.length || rotas.length) throw new Error(`faltan archivos en ${url}:\n- ${[...faltantes, ...rotas].join('\n- ')}`);

  // Textos largos: se achican y, si no alcanza, se recortan con aviso. Se
  // mide con el estilo de impresión, el mismo del PDF y de los JPG.
  await pagina.emulateMedia({ media: 'print' });
  const avisos = await pagina.evaluate(ajustarPaginas);
  for (const a of avisos.filter((x) => x.recortado)) {
    console.warn(`! ${nombre}, página ${a.pagina}: el texto «${a.texto}…» era muy largo y se recortó. Acórtalo en el Panel.`);
  }
  const noCaben = avisos.filter((a) => !a.recortado).map((a) => `la página ${a.pagina}`);
  if (noCaben.length) {
    throw new Error(
      `${nombre}: ${noCaben.join(', ')} no cabe ni achicando los textos. Acorta en el Panel los textos de esa página (cierre, textos de las fotos, nombres o datos de contacto).`,
    );
  }
}

async function imprimirPdf(pagina, ruta) {
  const pdf = await pagina.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: false });
  return escribir(ruta, pdf);
}

// Un JPG de 1080 × 1350 por página (.pagina), con la calidad que lo deje en ≤ 600 KB.
async function exportarCarrusel(pagina, rutas) {
  const paginas = pagina.locator('.pagina');
  const total = await paginas.count();
  const archivos = [];
  for (let i = 0; i < total; i++) {
    const ruta = rutas.carrusel(i + 1);
    const jpg = await jpgHasta((calidad) => paginas.nth(i).screenshot({ type: 'jpeg', quality: calidad, animations: 'disabled' }));
    escribir(ruta, jpg);
    archivos.push(ruta);
  }
  return archivos;
}

const contarPaginas = (pagina) => pagina.locator('.pagina').count();

function avisarVigencia(temporada) {
  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  if (temporada.vigencia_hasta < hoy) {
    console.warn(`! La revista ${temporada.slug} dice precios válidos hasta ${temporada.vigencia_hasta}, que ya pasó. Revisa la vigencia en el Panel.`);
  }
}

const servidor = await servirDist(DIST, base);
const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext({ viewport: { width: PAGINA.ancho, height: PAGINA.alto }, deviceScaleFactor: 1 });
  const revistas = [];
  for (const temporada of revistasDe(catalogo)) {
    avisarVigencia(temporada);
    const rutas = rutasRevista(temporada.slug);
    const pagina = await abrir(contexto, `${servidor.url}imprimir/revista/${temporada.slug}/`, `Revista ${temporada.nombre}`);
    const bytes = await imprimirPdf(pagina, rutas.pdf);
    const paginas = await contarPaginas(pagina);
    rmSync(join(DIST, dirname(rutas.carrusel(1))), { recursive: true, force: true });
    const carrusel = await exportarCarrusel(pagina, rutas);
    await pagina.close();
    revistas.push({ temporada_id: temporada.id, slug: temporada.slug, paginas, bytes, carrusel });
    console.log(`Revista ${temporada.slug}: ${paginas} páginas, ${(bytes / 1e6).toFixed(1)} MB, ${carrusel.length} JPG.`);
  }

  const pagina = await abrir(contexto, `${servidor.url}imprimir/catalogo/`, 'Catálogo PDF');
  const bytes = await imprimirPdf(pagina, RUTA_CATALOGO);
  const paginas = await contarPaginas(pagina);
  // El instante con el que el build armó los planes (precios y vigencias).
  const construido = Number(await pagina.getAttribute('meta[name="construido"]', 'content'));
  await pagina.close();
  console.log(`Catálogo: ${paginas} páginas, ${(bytes / 1e6).toFixed(1)} MB.`);

  escribir(RUTA_MANIFIESTO, JSON.stringify(armarManifiesto({ ahora: construido || Date.now(), revistas, catalogo: { paginas, bytes } }), null, 2));

  // Las páginas y fotos de impresión solo sirven para generar los documentos.
  rmSync(join(DIST, 'imprimir'), { recursive: true, force: true });
  rmSync(join(DIST, 'img', 'imprimir'), { recursive: true, force: true });
  console.log(`Documentos listos: ${revistas.length} revista(s) y el catálogo (${RUTA_MANIFIESTO}).`);
} catch (e) {
  console.error(`✗ Documentos detenidos: ${e.message}`);
  process.exitCode = 1;
} finally {
  await navegador.close();
  await servidor.cerrar();
}
