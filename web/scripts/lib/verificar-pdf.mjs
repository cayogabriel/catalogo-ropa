// Revisión de los documentos generados contra su plan de páginas.
// Contrato: docs/contracts/documentos.md
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_MAX_BYTES, JPG_MAX_BYTES, PAGINA } from './documentos.mjs';

// 1080 × 1350 px a 96 px por pulgada = 810 × 1012,5 pt. Chromium redondea un poco.
const PT = { ancho: (PAGINA.ancho * 72) / 96, alto: (PAGINA.alto * 72) / 96 };
const TOLERANCIA_PT = 1;
const FUENTES = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';
const normalizar = (t) => t.replace(/\s+/g, ' ').trim();

export async function leerPdf(buffer) {
  const tarea = getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: FUENTES, isEvalSupported: false, verbosity: 0 });
  const documento = await tarea.promise;
  const paginas = [];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const [x0, y0, x1, y1] = pagina.view;
    const anotaciones = await pagina.getAnnotations();
    const contenido = await pagina.getTextContent();
    paginas.push({
      ancho: Math.round((x1 - x0) * 100) / 100,
      alto: Math.round((y1 - y0) * 100) / 100,
      enlaces: anotaciones.filter((a) => a.subtype === 'Link' && a.url).map((a) => a.url),
      texto: normalizar(contenido.items.map((i) => i.str ?? '').join(' ')),
    });
  }
  await tarea.destroy();
  return { paginas };
}

const ordenados = (lista) => [...lista].sort();

// errores[] de un PDF frente a su plan (plan.mjs): páginas, tamaño, enlaces,
// nota de vigencia en cada página y peso.
export function revisarPdf(info, { bytes, plan, sitio, nombre }) {
  const errores = [];
  const e = (msg) => errores.push(`${nombre}: ${msg}`);
  if (bytes > PDF_MAX_BYTES) e(`pesa ${(bytes / 1e6).toFixed(1)} MB (máximo 10 MB)`);
  if (info.paginas.length !== plan.paginas.length) e(`tiene ${info.paginas.length} páginas y se esperaba ${plan.paginas.length}`);
  // pdf.js puede partir el texto en trozos con o sin espacios entre ellos.
  const sinEspacios = (t) => t.replace(/\s+/g, '');
  const nota = sinEspacios(plan.nota);

  info.paginas.forEach((p, i) => {
    const n = i + 1;
    if (Math.abs(p.ancho - PT.ancho) > TOLERANCIA_PT || Math.abs(p.alto - PT.alto) > TOLERANCIA_PT) {
      e(`la página ${n} mide ${p.ancho} × ${p.alto} pt (se esperaba ${PT.ancho} × ${PT.alto}, 1080 × 1350 px)`);
    }
    for (const url of p.enlaces) {
      if (!url.startsWith(sitio)) e(`la página ${n} tiene un enlace fuera de ir/ y de la web: ${url}`);
    }
    const esperados = plan.paginas[i]?.enlaces;
    if (esperados && ordenados(p.enlaces).join('\n') !== ordenados(esperados).join('\n')) {
      const faltan = esperados.filter((u) => !p.enlaces.includes(u));
      const sobran = p.enlaces.filter((u) => !esperados.includes(u));
      e(`la página ${n} no tiene los enlaces esperados (faltan: ${faltan.join(', ') || 'ninguno'}; sobran: ${sobran.join(', ') || 'ninguno'})`);
    }
    if (!sinEspacios(p.texto).includes(nota)) e(`la página ${n} no tiene la nota de vigencia «${plan.nota}»`);
  });
  return errores;
}

export async function revisarJpg(buffer, nombre) {
  const errores = [];
  const m = await sharp(buffer).metadata();
  if (m.format !== 'jpeg') errores.push(`${nombre}: no es JPG (${m.format})`);
  if (m.width !== PAGINA.ancho || m.height !== PAGINA.alto) errores.push(`${nombre}: mide ${m.width} × ${m.height} (se esperaba 1080 × 1350)`);
  if (buffer.length > JPG_MAX_BYTES) errores.push(`${nombre}: pesa ${Math.round(buffer.length / 1000)} KB (máximo 600 KB)`);
  return errores;
}

// Los enlaces de los PDF, el QR y los mensajes usan tienda.sitio_url: tiene
// que ser la misma dirección donde se publica el sitio.
export function revisarSitioUrl(sitioUrl, urlBase) {
  return sitioUrl === urlBase ? [] : [`tienda.sitio_url (${sitioUrl}) no coincide con la URL del sitio (${urlBase}). Corrígela en Configuración del Panel.`];
}
