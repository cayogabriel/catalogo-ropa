// Valida la copia publicada: primero el esquema JSON y, si pasa, las reglas
// que un esquema no puede expresar (referencias, lista blanca de fotos,
// ventanas de precio). Devuelve todos los errores juntos, en español.
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const require = createRequire(import.meta.url);
const esquema = require('./catalog.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validarEsquema = ajv.compile(esquema);

function erroresDeEsquema(errores) {
  return errores.map((e) => {
    const ruta = e.instancePath || '(raíz)';
    const extra = e.params?.missingProperty ? ` «${e.params.missingProperty}»` : '';
    return `esquema: ${ruta} ${e.message}${extra}`;
  });
}

function instante(valor, extremo) {
  if (valor === null) return extremo;
  return Date.parse(valor);
}

function revisarVentanas(producto, errores) {
  const etiqueta = `productos ${producto.codigo}`;
  const v = producto.precio.ventanas;
  if (v[0].desde !== null) errores.push(`${etiqueta}: la primera ventana debe empezar en null (sin inicio)`);
  if (v[v.length - 1].hasta !== null) errores.push(`${etiqueta}: la última ventana debe terminar en null (sin fin)`);
  v.forEach((ventana, i) => {
    const desde = instante(ventana.desde, -Infinity);
    const hasta = instante(ventana.hasta, Infinity);
    if (!(desde < hasta)) errores.push(`${etiqueta}: la ventana ${i} termina antes de empezar`);
    if (ventana.antes !== null && !(ventana.antes > ventana.precio)) {
      errores.push(`${etiqueta}: en la ventana ${i} el precio «antes» (${ventana.antes}) no es mayor que el precio (${ventana.precio})`);
    }
    if (i === 0) return;
    const finAnterior = instante(v[i - 1].hasta, Infinity);
    if (desde < finAnterior) errores.push(`${etiqueta}: las ventanas ${i - 1} y ${i} se solapan`);
    if (desde > finAnterior) errores.push(`${etiqueta}: hay un hueco entre las ventanas ${i - 1} y ${i}`);
  });
}

function fotosReferenciadas(c) {
  const usadas = [];
  const agregar = (foto, donde) => {
    if (foto) usadas.push({ id: foto.id, donde });
  };
  agregar(c.tienda.logo, 'tienda.logo');
  c.categorias.forEach((cat) => agregar(cat.foto, `categoría ${cat.slug}`));
  c.productos.forEach((p) => p.fotos.forEach((f) => agregar(f, `producto ${p.codigo}`)));
  c.portadas.forEach((po) => {
    agregar(po.foto_escritorio, `portada ${po.id}`);
    agregar(po.foto_movil, `portada ${po.id}`);
  });
  c.temporadas.forEach((t) => {
    agregar(t.foto_portada, `temporada ${t.slug}`);
    t.fotos.forEach((tf) => agregar(tf.foto, `temporada ${t.slug}`));
  });
  return usadas;
}

function repetidos(valores) {
  const vistos = new Set();
  const dup = new Set();
  for (const v of valores) (vistos.has(v) ? dup : vistos).add(v);
  return [...dup];
}

function revisarReglas(c) {
  const errores = [];
  const idsCategoria = new Set(c.categorias.map((x) => x.id));
  const idsVendedora = new Set(c.vendedoras.map((x) => x.id));
  const idsProducto = new Set(c.productos.map((x) => x.id));
  const idsTemporada = new Set(c.temporadas.map((x) => x.id));
  const idsPaleta = new Set(Object.keys(c.paletas));

  // Lista blanca exacta de fotos: todo lo usado está en el índice y nada más.
  const usadas = fotosReferenciadas(c);
  const idsUsados = new Set(usadas.map((u) => u.id));
  for (const u of usadas) {
    if (!(u.id in c.fotos)) errores.push(`fotos: ${u.id} (${u.donde}) no está en el índice «fotos»`);
  }
  for (const id of Object.keys(c.fotos)) {
    if (!idsUsados.has(id)) errores.push(`fotos: ${id} está en el índice pero nada la usa`);
  }

  // Unicidad.
  for (const cod of repetidos(c.productos.map((p) => p.codigo))) errores.push(`productos: código repetido ${cod}`);
  for (const id of repetidos(c.productos.map((p) => p.id))) errores.push(`productos: id repetido ${id}`);
  for (const s of repetidos(c.temporadas.map((t) => t.slug))) errores.push(`temporadas: slug repetido ${s}`);
  for (const s of repetidos(c.categorias.map((x) => x.slug))) errores.push(`categorias: slug repetido ${s}`);

  // Vendedora por defecto: exactamente una.
  const porDefecto = c.vendedoras.filter((v) => v.por_defecto).length;
  if (porDefecto !== 1) errores.push(`vendedoras: debe haber exactamente una con por_defecto (hay ${porDefecto})`);

  // Referencias y reglas por producto.
  for (const p of c.productos) {
    if (!idsCategoria.has(p.categoria_id)) errores.push(`productos ${p.codigo}: la categoría ${p.categoria_id} no existe`);
    if (p.vendedora_id !== null && !idsVendedora.has(p.vendedora_id)) {
      errores.push(`productos ${p.codigo}: la vendedora ${p.vendedora_id} no existe`);
    }
    for (const t of p.tallas_agotadas) {
      if (!p.tallas.includes(t)) errores.push(`productos ${p.codigo}: la talla agotada ${t} no está en tallas`);
    }
    revisarVentanas(p, errores);
  }

  for (const s of c.secciones) {
    for (const id of s.productos) {
      if (!idsProducto.has(id)) errores.push(`secciones ${s.id}: el producto ${id} no existe`);
    }
  }
  for (const po of c.portadas) {
    if (po.temporada_id !== null && !idsTemporada.has(po.temporada_id)) {
      errores.push(`portadas ${po.id}: la temporada ${po.temporada_id} no existe`);
    }
  }
  for (const t of c.temporadas) {
    if (!idsPaleta.has(t.paleta_id)) errores.push(`temporadas ${t.slug}: la paleta ${t.paleta_id} no existe`);
    for (const tf of t.fotos) {
      for (const id of tf.productos) {
        if (!idsProducto.has(id)) errores.push(`temporadas ${t.slug}: el producto ${id} no existe`);
      }
    }
  }
  if (!idsPaleta.has(c.tema_paleta_id)) errores.push(`tema_paleta_id: la paleta ${c.tema_paleta_id} no existe`);
  if (c.temporada_activa_id !== null && !idsTemporada.has(c.temporada_activa_id)) {
    errores.push(`temporada_activa_id: la temporada ${c.temporada_activa_id} no existe`);
  }
  return errores;
}

export function validarCatalogo(datos) {
  if (!validarEsquema(datos)) {
    return { ok: false, errores: erroresDeEsquema(validarEsquema.errors) };
  }
  const errores = revisarReglas(datos);
  return { ok: errores.length === 0, errores };
}
