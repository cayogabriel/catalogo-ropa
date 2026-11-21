// Convierte fixtures/catalogo.ejemplo.json (la copia publicada) en filas con la forma del modelo de datos.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const leer = (ruta) => JSON.parse(readFileSync(RAIZ + ruta, 'utf8'));
const idDe = (foto) => (foto && typeof foto === 'object' ? foto.id : foto || '');

export const USUARIO_SIM = 'duena@ejemplo.test';

export function semilla() {
  const c = leer('fixtures/catalogo.ejemplo.json');
  const paletas = leer('content/paletas.json').paletas;
  const textosJson = leer('content/textos.json');
  const plantillas = leer('content/plantillas-whatsapp.json').plantillas;
  const creado = c.generado_en;

  // Prefijo de código de cada categoría, según los códigos de ejemplo («VES-001» → VES).
  const prefijo = {};
  for (const p of c.productos) prefijo[p.categoria_id] ??= p.codigo.split('-')[0];

  const productos = c.productos.map((p, i) => ({
    id: p.id, codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, categoria_id: p.categoria_id,
    precio_regular: p.precio.regular, stock: p.ultimas_unidades ? 2 : null, tallas: p.tallas,
    tallas_agotadas: p.tallas_agotadas, colores: p.colores, fotos: p.fotos.map((f) => f.id), texto_alt: '',
    etiquetas: p.etiquetas, estado: p.estado, vendedora_id: p.vendedora_id ?? '', orden: p.orden ?? i + 1,
    creado_en: creado, actualizado_en: creado, publicado_en: p.estado === 'borrador' ? null : creado, version: 1,
  }));
  const extra = (n, codigo, categoria_id, campos) => ({
    id: `prd_a000000${n}`, codigo, nombre: '', descripcion: '', categoria_id, precio_regular: null, stock: null,
    tallas: [], tallas_agotadas: [], colores: [], fotos: [], texto_alt: '', etiquetas: [], estado: 'borrador',
    vendedora_id: '', orden: productos.length + n, creado_en: creado, actualizado_en: creado, publicado_en: null,
    version: 1, ...campos,
  });
  productos.push(
    extra(1, `${prefijo.cat_00000001}-021`, 'cat_00000001', { nombre: 'Vestido Lila (borrador)', precio_regular: 79, tallas: ['S', 'M'] }),
    extra(2, `${prefijo.cat_00000002}-022`, 'cat_00000002', { fotos: ['fx_00000003'] }),
    extra(3, `${prefijo.cat_00000004}-023`, 'cat_00000004', { nombre: 'Cinturón viejo', precio_regular: 25, estado: 'archivado' }),
  );

  const categorias = c.categorias.map((k) => ({
    id: k.id, nombre: k.nombre, slug: k.slug, prefijo_codigo: prefijo[k.id], orden: k.orden, visible: true,
    foto: idDe(k.foto), version: 1,
  }));

  const secciones = c.secciones.map((s) => ({
    id: s.id, titulo: s.titulo, subtitulo: s.subtitulo ?? '', tipo: s.tipo,
    parametro: s.tipo === 'categoria' ? 'cat_00000004' : '',
    productos: s.tipo === 'manual' ? s.productos : [], diseno: s.diseno, limite: null, orden: s.orden,
    visible: true, temporada_id: '', version: 1,
  }));

  const portadas = c.portadas.map((p) => ({
    id: p.id, titulo: p.titulo, subtitulo: p.subtitulo ?? '', boton_texto: p.boton_texto, boton_destino: p.boton_destino,
    foto_escritorio: idDe(p.foto_escritorio), foto_movil: idDe(p.foto_movil), desde: p.desde, hasta: p.hasta,
    orden: p.orden, activa: true, temporada_id: p.temporada_id ?? '', version: 1,
  }));

  // Las ofertas se reconstruyen desde las ventanas de precio de ejemplo.
  const ofertas = [];
  for (const oid of ['ofe_00000001', 'ofe_00000002']) {
    const usados = c.productos.filter((p) => p.precio.ventanas.some((v) => v.oferta_id === oid));
    const v = usados[0].precio.ventanas.find((x) => x.oferta_id === oid);
    ofertas.push({
      id: oid, nombre: v.liquidacion ? 'Liquidación de verano' : 'Descuento de temporada', tipo: 'porcentaje',
      valor: v.descuento_pct, alcance: 'producto', objetivos: usados.map((p) => p.id), desde: v.desde, hasta: v.hasta,
      prioridad: v.liquidacion ? 2 : 1, etiqueta: v.liquidacion ? 'Liquidación' : '', es_liquidacion: v.liquidacion,
      cuenta_regresiva: v.cuenta_regresiva, activa: true, version: 1,
    });
  }

  const t = c.temporadas[0];
  const temporadas = c.temporadas.map((x) => ({
    id: x.id, slug: x.slug, nombre: x.nombre, titulo: x.titulo, subtitulo: x.subtitulo, intro: x.intro,
    cierre: x.cierre, paleta_id: x.paleta_id, foto_portada: idDe(x.foto_portada), desde: x.desde, hasta: x.hasta,
    activa_manual: '', visible_en_web: x.visible_en_web, revista: x.revista, vigencia_dias: null, version: 1,
  }));
  const temporada_fotos = t.fotos.map((f, i) => ({
    id: f.id, temporada_id: t.id, orden: i + 1, foto: idDe(f.foto), tipo: f.tipo, productos: f.productos,
    texto: f.texto ?? '', texto_alt: '', destacada: f.destacada, version: 1,
  }));

  const filasPaletas = paletas.map((p) => ({
    id: p.id, nombre: p.nombre, temporada: p.temporada, uso: p.uso.join(', '), tokens: p.tokens,
    fuente_titulos: p.fuentes.titulos, fuente_texto: p.fuentes.texto, radio: p.radio, origen: 'predefinida', version: 1,
  }));

  const vendedoras = c.vendedoras.map((v) => ({ ...v, activa: true, version: 1 }));

  const tienda = c.tienda;
  const config = {
    tienda_nombre: tienda.nombre, tienda_eslogan: tienda.eslogan, logo: '', moneda_simbolo: tienda.moneda.simbolo,
    moneda_codigo: tienda.moneda.codigo, pais_codigo: tienda.pais_codigo, zona_horaria: tienda.zona_horaria,
    redondeo: 'ninguno', inicio_modo: tienda.inicio_modo, instagram: '', facebook: '', tiktok: '',
    horario: tienda.horario, envios: tienda.envios, sitio_url: tienda.sitio_url,
    github_repo: 'cayogabriel/catalogo-ropa', paleta_defecto: 'neutra-minimal', umbral_ultimas_unidades: '3',
    dias_nuevo: '30', min_clics_mas_consultados: '3', vigencia_dias_defecto: '15',
  };

  const textos = Object.fromEntries(Object.entries(textosJson).filter(([k]) => !k.startsWith('_')));
  for (const [nombre, p] of Object.entries(plantillas)) textos[`whatsapp.${nombre}`] = p.mensaje;

  // Biblioteca: carpeta según dónde se usa cada archivo de ejemplo.
  const enPortadas = new Set(portadas.flatMap((p) => [p.foto_escritorio, p.foto_movil]));
  const enTemporadas = new Set([
    ...temporadas.map((x) => x.foto_portada),
    ...temporada_fotos.filter((f) => f.tipo === 'ambiente').map((f) => f.foto),
  ]);
  const codigoDe = {};
  for (const p of productos) p.fotos.forEach((f, i) => (codigoDe[f] ??= `${p.codigo}-${i + 1}`));
  const fotos = {};
  for (const archivo of readdirSync(`${RAIZ}fixtures/img`).filter((a) => a.endsWith('.jpg'))) {
    const id = archivo.replace(/\.jpg$/, '');
    fotos[id] = {
      id,
      nombre: `${codigoDe[id] ?? id}.jpg`,
      carpeta: enPortadas.has(id) ? 'portadas' : enTemporadas.has(id) ? 'temporadas' : 'fotos',
      actualizado: c.fotos?.[id]?.actualizado ?? creado,
      subida: false,
    };
  }

  // Estadísticas de ejemplo (30 y 7 días), deterministas. Solo existen en el simulador.
  const estadisticas = {};
  c.productos.forEach((p, i) => {
    const base = ((i * 7) % 11) + (p.popularidad ?? 1);
    const t30 = { vistas: base * 9, whatsapp: base % 5, favoritos: base % 4, compartidos: base % 3, descargas: 0 };
    const t7 = { vistas: Math.floor(t30.vistas / 4), whatsapp: Math.floor(t30.whatsapp / 3), favoritos: Math.floor(t30.favoritos / 3), compartidos: 0, descargas: 0 };
    estadisticas[p.id] = { 30: t30, 7: t7 };
  });

  return {
    filas: {
      productos, categorias, secciones, portadas, ofertas, temporadas, temporada_fotos,
      paletas: filasPaletas, vendedoras,
    },
    config, textos, fotos, estadisticas, historial: [], prefijos: prefijo,
    publicacion: {
      estado: 'publicado', iniciado_en: creado, terminado_en: creado, url_ejecucion: '', mensaje: '',
      documentos_guardados: true,
    },
    cambiosSinPublicar: false, tokenGithub: null, instalada: true,
  };
}
