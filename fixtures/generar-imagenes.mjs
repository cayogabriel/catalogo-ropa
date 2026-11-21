// Genera las fotos de ejemplo (JPG) en fixtures/img/: degradé + texto, sin
// material de terceros. Uso: node fixtures/generar-imagenes.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CATEGORIAS, PRODUCTOS, AMBIENTES, planDeFotos, codigos } from './definicion.mjs';

const dir = new URL('./img/', import.meta.url);
mkdirSync(dir, { recursive: true });

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg({ ancho, alto, titulo, subtitulo, colores }) {
  const [c1, c2] = colores;
  const margen = Math.round(ancho * 0.06);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="${margen}" y="${margen}" width="${ancho - 2 * margen}" height="${alto - 2 * margen}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="4"/>
  <text x="50%" y="47%" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(ancho * 0.06)}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapar(titulo)}</text>
  <text x="50%" y="55%" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(ancho * 0.03)}" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${escapar(subtitulo)}</text>
</svg>`;
}

async function escribir(id, datos) {
  await sharp(Buffer.from(svg(datos)))
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(fileURLToPath(new URL(`${id}.jpg`, dir)));
}

const plan = planDeFotos();
const cods = codigos();
const tareas = [];

PRODUCTOS.forEach((p, i) => {
  const cat = CATEGORIAS.find((c) => c.n === p.cat);
  plan.productos[i].forEach((id, k) => {
    tareas.push(escribir(id, {
      ancho: 1200, alto: 1500, titulo: p.nombre,
      subtitulo: `${cods[i]} · foto ${k + 1} de ejemplo`, colores: cat.colores,
    }));
  });
});
AMBIENTES.forEach((a, i) => {
  tareas.push(escribir(plan.ambientes[i], { ancho: 1200, alto: 1500, titulo: a.texto, subtitulo: 'Foto de ambiente de ejemplo', colores: a.colores }));
});
tareas.push(escribir(plan.portadaTemporada, { ancho: 1200, alto: 1500, titulo: 'Verano 2027', subtitulo: 'Portada de temporada de ejemplo', colores: ['#F6D5B8', '#B5543C'] }));
const portadas = [
  { titulo: 'Verano en la costa', colores: ['#F6D5B8', '#B5543C'] },
  { titulo: 'Liquidación', colores: ['#222222', '#5A5A5A'] },
];
plan.portadas.forEach((par, i) => {
  tareas.push(escribir(par.escritorio, { ancho: 1920, alto: 1080, titulo: portadas[i].titulo, subtitulo: 'Portada de escritorio de ejemplo', colores: portadas[i].colores }));
  tareas.push(escribir(par.movil, { ancho: 1200, alto: 1500, titulo: portadas[i].titulo, subtitulo: 'Portada de celular de ejemplo', colores: portadas[i].colores }));
});

await Promise.all(tareas);
console.log(`Imágenes de ejemplo: ${tareas.length} en fixtures/img/`);
