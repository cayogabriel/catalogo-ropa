// Revisa el sitio construido antes de desplegarlo:
// - cada producto tiene su página con og:image absoluto, y esa imagen existe y
//   pesa ≤ 300 KB (límite de WhatsApp);
// - tienda.sitio_url es la URL donde se publica el sitio;
// - los documentos (documentos.mjs) cumplen docs/contracts/documentos.md: PDF de
//   1080 × 1350 px, ≤ 10 MB, con los enlaces del plan (todos a ir/ o a la web) y
//   la nota de vigencia en cada página; JPG de carrusel de 1080 × 1350 y
//   ≤ 600 KB; cada enlace ir/ tiene su página.
// Uso: node scripts/verificar-build.mjs [--con-documentos]
//   --con-documentos: los documentos son obligatorios (publicar.yml). Sin el
//   flag se revisan solo si existe dist/documentos.json (CI sin Chromium).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL_BASE } from '../sitio.config.mjs';
import { leerPdf, revisarPdf, revisarJpg, revisarSitioUrl } from './lib/verificar-pdf.mjs';
import { RUTA_MANIFIESTO, rutasRevista, RUTA_CATALOGO } from './lib/documentos.mjs';
import { planRevista, planCatalogo, revistasDe } from '../src/components/imprimir/plan.mjs';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(WEB, 'dist');
const datos = JSON.parse(readFileSync(join(WEB, 'src', 'data', 'catalogo.json'), 'utf8'));
const documentosObligatorios = process.argv.includes('--con-documentos');
const errores = [];

if (!existsSync(join(DIST, 'index.html'))) errores.push('falta dist/index.html');
errores.push(...revisarSitioUrl(datos.tienda.sitio_url, URL_BASE));

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

async function revisarDocumento(ruta, plan, nombre, entrada) {
  const archivo = join(DIST, ruta);
  if (!existsSync(archivo)) return errores.push(`${nombre}: falta ${ruta}`);
  const buffer = readFileSync(archivo);
  if (entrada.bytes !== buffer.length) errores.push(`${nombre}: documentos.json dice ${entrada.bytes} bytes y el PDF pesa ${buffer.length}`);
  if (entrada.paginas !== plan.paginas.length) errores.push(`${nombre}: documentos.json dice ${entrada.paginas} páginas y se esperaban ${plan.paginas.length}`);
  errores.push(...revisarPdf(await leerPdf(buffer), { bytes: buffer.length, plan, sitio: datos.tienda.sitio_url, nombre }));
}

// Cada enlace ir/ de un PDF necesita su página con la redirección de respaldo.
function revisarPaginasIr(planes) {
  const enlaces = new Set(planes.flatMap((plan) => plan.paginas.flatMap((p) => p.enlaces)));
  const irBase = new URL('ir/', datos.tienda.sitio_url).href;
  for (const enlace of enlaces) {
    if (!enlace.startsWith(irBase)) continue;
    const ruta = new URL(enlace).pathname.slice(new URL(datos.tienda.sitio_url).pathname.length);
    const pagina = join(DIST, ruta, 'index.html');
    if (!existsSync(pagina)) errores.push(`falta la página ${ruta} (la usa un botón de los PDF)`);
    else if (!readFileSync(pagina, 'utf8').includes('http-equiv="refresh"')) errores.push(`${ruta} no tiene el meta refresh de respaldo`);
  }
}

let resumenDocumentos = ', sin documentos (no se generaron)';
const manifiestoRuta = join(DIST, RUTA_MANIFIESTO);
if (!existsSync(manifiestoRuta)) {
  if (documentosObligatorios) errores.push(`falta ${RUTA_MANIFIESTO}: corre npm run documentos -w web después del build`);
} else {
  {
    const manifiesto = JSON.parse(readFileSync(manifiestoRuta, 'utf8'));
    // El mismo instante que usó el build (lo guarda documentos.mjs), para que
    // una oferta que termina justo entre el build y la verificación no cambie el plan.
    const ahora = Date.parse(manifiesto.generado_en);
    const planes = [];
    for (const temporada of revistasDe(datos)) {
      const nombre = `revista ${temporada.slug}`;
      const plan = planRevista(datos, temporada, ahora);
      planes.push(plan);
      const entrada = manifiesto.revistas.find((r) => r.slug === temporada.slug);
      if (!entrada) {
        errores.push(`${nombre}: no está en ${RUTA_MANIFIESTO}`);
        continue;
      }
      if (entrada.temporada_id !== temporada.id) errores.push(`${nombre}: temporada_id distinto en ${RUTA_MANIFIESTO}`);
      await revisarDocumento(rutasRevista(temporada.slug).pdf, plan, nombre, entrada);
      if (entrada.carrusel.length !== plan.paginas.length) errores.push(`${nombre}: ${entrada.carrusel.length} JPG de carrusel para ${plan.paginas.length} páginas`);
      for (const jpg of entrada.carrusel) {
        if (!existsSync(join(DIST, jpg))) errores.push(`${nombre}: falta ${jpg}`);
        else errores.push(...(await revisarJpg(readFileSync(join(DIST, jpg)), jpg)));
      }
    }
    const planCat = planCatalogo(datos, ahora);
    planes.push(planCat);
    await revisarDocumento(RUTA_CATALOGO, planCat, 'catálogo', manifiesto.catalogo);
    revisarPaginasIr(planes);
    for (const carpeta of ['imprimir', join('img', 'imprimir')]) {
      if (existsSync(join(DIST, carpeta))) errores.push(`dist/${carpeta}/ no se borró: lo de impresión no se despliega`);
    }
    resumenDocumentos = `, ${manifiesto.revistas.length} revista(s) y el catálogo PDF`;
  }
}

if (errores.length) {
  console.error(`✗ El sitio no está listo:\n- ${errores.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: ${datos.productos.length} páginas de producto con vista previa válida${resumenDocumentos} (${URL_BASE}).`);
