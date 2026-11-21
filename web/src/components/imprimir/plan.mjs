// Plan de páginas de la revista y del catálogo PDF: qué va en cada página y
// qué enlaces lleva. Las páginas de imprimir/ lo dibujan y verificar-build lo
// usa para saber qué esperar de cada PDF. Contrato: docs/contracts/documentos.md
import { precioVigente, formatearMonto, formatearFecha } from '../../compartido/precio.mjs';
import { interpolar } from '../../compartido/mensajes.mjs';
import { urlTemporada } from '../../compartido/enlaces.mjs';

export const REDES = ['instagram', 'facebook', 'tiktok'];
const DIA_MS = 86_400_000;
const VIGENCIA_DIAS = 15;

const RESPALDO = {
  'revista.precios_validos_hasta': 'Precios válidos hasta el {fecha}',
  'revista.escanea_qr': 'Escanea el código y mira el catálogo completo',
  'revista.pedir': 'Pedir por WhatsApp',
  'revista.portada_etiqueta': 'Revista de temporada',
  'revista.contraportada_titulo': 'Escríbenos, te respondemos con gusto',
  'catalogo.titulo': 'Catálogo',
  'precio.descuento': '-{porcentaje}%',
  'precio.antes': 'Antes',
  'producto.codigo': 'Código {codigo}',
  'insignia.nuevo': 'Nuevo',
  'insignia.liquidacion': 'Liquidación',
  'insignia.ultimas_unidades': 'Últimas unidades',
  'insignia.mas_consultado': 'Más consultado',
  'contacto.instagram': 'Instagram',
  'contacto.facebook': 'Facebook',
  'contacto.tiktok': 'TikTok',
  'contacto.whatsapp': 'WhatsApp',
  'temporada.ver_revista': 'Ver revista web',
};

// Texto de la tienda con sus variables ({tienda} siempre disponible).
export function texto(catalogo, clave, variables = {}) {
  const plantilla = catalogo.textos[clave] ?? RESPALDO[clave] ?? '';
  return interpolar(plantilla, { tienda: catalogo.tienda.nombre, ...variables });
}

// URL absoluta de una página ir/ (las que cuentan el clic y redirigen).
export function enlaceIr(catalogo, ruta, { o, t } = {}) {
  const url = new URL(`ir/${ruta}/`, catalogo.tienda.sitio_url);
  if (o) url.searchParams.set('o', o);
  if (t) url.searchParams.set('t', t);
  return url.href;
}

export const notaVigencia = (catalogo, fecha) => texto(catalogo, 'revista.precios_validos_hasta', { fecha: formatearFecha(fecha) });

// «51987654321» → «+51 987 654 321».
export function formatearTelefono(numero, paisCodigo = '') {
  const local = paisCodigo && numero.startsWith(paisCodigo) ? numero.slice(paisCodigo.length) : numero;
  const grupos = local.match(/.{1,3}/g) ?? [];
  return `${paisCodigo ? `+${paisCodigo} ` : ''}${grupos.join(' ')}`;
}

const diaLima = (ms) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);

// El precio impreso solo puede subir cuando termina una oferta. La vigencia del
// catálogo es el último día de la oferta vigente más próxima a terminar, o
// 15 días desde la publicación (generado_en) si no hay ninguna antes: la misma
// regla de la revista. Contar desde generado_en hace que el build y la
// verificación lleguen a la misma fecha aunque corran en minutos distintos.
export function vigenciaCatalogo(catalogo, ahora) {
  let fin = diaLima(Date.parse(catalogo.generado_en) + VIGENCIA_DIAS * DIA_MS);
  for (const p of catalogo.productos) {
    const v = precioVigente(p, ahora);
    if (v.oferta_id === null || v.hasta === null) continue;
    const ultimo = diaLima(Date.parse(v.hasta) - 1);
    if (ultimo < fin) fin = ultimo;
  }
  return fin;
}

export const revistasDe = (catalogo) => catalogo.temporadas.filter((t) => t.revista);

const disponible = (p) => p.estado === 'publicado';

function insignias(catalogo, producto, v) {
  const lista = [];
  if (v.oferta_id !== null) {
    const pct = v.descuento_pct;
    if (v.etiqueta) lista.push(v.etiqueta);
    else if (pct) lista.push(texto(catalogo, 'precio.descuento', { porcentaje: pct }));
    if (v.liquidacion) lista.push(texto(catalogo, 'insignia.liquidacion'));
  }
  if (producto.ultimas_unidades) lista.push(texto(catalogo, 'insignia.ultimas_unidades'));
  if (producto.nuevo) lista.push(texto(catalogo, 'insignia.nuevo'));
  if (producto.popularidad >= 1 && producto.popularidad <= 3) lista.push(texto(catalogo, 'insignia.mas_consultado'));
  return [...new Set(lista)].slice(0, 2);
}

// Todo lo que una tarjeta de prenda necesita, ya calculado.
function tarjeta(catalogo, producto, ahora, { o, t }) {
  const v = precioVigente(producto, ahora);
  const simbolo = catalogo.tienda.moneda.simbolo;
  const categoria = catalogo.categorias.find((c) => c.id === producto.categoria_id)?.nombre ?? '';
  return {
    producto,
    foto: producto.fotos[0],
    categoria,
    tallas: producto.tallas.filter((x) => !producto.tallas_agotadas.includes(x)),
    precio: { ahora: formatearMonto(v.precio, simbolo), antes: v.antes === null ? null : formatearMonto(v.antes, simbolo) },
    insignias: insignias(catalogo, producto, v),
    enlace: enlaceIr(catalogo, producto.codigo.toLowerCase(), { o, t }),
  };
}

const enGrupos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

function redesDe(catalogo, o) {
  return REDES.filter((red) => catalogo.tienda.redes[red]).map((red) => ({
    red,
    nombre: texto(catalogo, `contacto.${red}`),
    usuario: catalogo.tienda.redes[red],
    enlace: enlaceIr(catalogo, `red/${red}`, { o }),
  }));
}

const contactos = (catalogo) =>
  catalogo.vendedoras.map((v) => ({ nombre: v.nombre, telefono: formatearTelefono(v.whatsapp, catalogo.tienda.pais_codigo) }));

const numerar = (paginas) => paginas.map((p, i) => ({ ...p, numero: i + 1, total: paginas.length }));

// Editoriales: cada destacada sola a página completa; las demás de a dos en
// su orden; una suelta (antes de una destacada o al final) va sola con su texto.
function editoriales(fotos, credito) {
  const paginas = [];
  let par = [];
  const cerrarPar = () => {
    if (par.length === 2) paginas.push({ tipo: 'editorial-doble', fotos: par });
    else if (par.length === 1) paginas.push({ tipo: 'editorial-sola', fotos: par });
    par = [];
  };
  for (const f of fotos) {
    const foto = { foto: f.foto, texto: f.texto, creditos: f.productos.map(credito).filter(Boolean) };
    if (f.destacada) {
      cerrarPar();
      paginas.push({ tipo: 'editorial-completa', fotos: [foto] });
    } else {
      par.push(foto);
      if (par.length === 2) cerrarPar();
    }
  }
  cerrarPar();
  return paginas.map((p) => ({ ...p, enlaces: p.fotos.flatMap((f) => f.creditos.map((c) => c.enlace)) }));
}

export function planRevista(catalogo, temporada, ahora) {
  const origen = { o: 'pdf', t: temporada.slug };
  const porId = new Map(catalogo.productos.filter(disponible).map((p) => [p.id, p]));
  const tarjetas = new Map();
  const credito = (id) => {
    if (!porId.has(id)) return null;
    if (!tarjetas.has(id)) tarjetas.set(id, tarjeta(catalogo, porId.get(id), ahora, origen));
    return tarjetas.get(id);
  };

  const portada = {
    tipo: 'portada',
    foto: temporada.foto_portada,
    etiqueta: texto(catalogo, 'revista.portada_etiqueta'),
    nombre: temporada.nombre,
    titulo: temporada.titulo,
    subtitulo: temporada.subtitulo,
    enlaces: [],
  };
  const paginasEditoriales = editoriales(temporada.fotos, credito);
  if (paginasEditoriales.length) paginasEditoriales[0].intro = temporada.intro;
  else portada.intro = temporada.intro;

  const prendas = enGrupos([...tarjetas.values()], 2).map((grupo) => ({
    tipo: 'prendas',
    prendas: grupo,
    enlaces: grupo.map((x) => x.enlace),
  }));

  const redes = redesDe(catalogo, 'pdf');
  const enlaceTemporada = enlaceIr(catalogo, `temporada/${temporada.slug}`, { o: 'pdf' });
  const contraportada = {
    tipo: 'contraportada',
    titulo: texto(catalogo, 'revista.contraportada_titulo'),
    cierre: temporada.cierre,
    contactos: contactos(catalogo),
    horario: catalogo.tienda.horario,
    envios: catalogo.tienda.envios,
    redes,
    url: urlTemporada(catalogo, temporada.slug),
    enlaceTemporada,
    escaneaQr: texto(catalogo, 'revista.escanea_qr'),
    enlaces: [...redes.map((r) => r.enlace), enlaceTemporada],
  };

  return {
    tipo: 'revista',
    slug: temporada.slug,
    paleta: catalogo.paletas[temporada.paleta_id],
    nota: notaVigencia(catalogo, temporada.vigencia_hasta),
    pedir: texto(catalogo, 'revista.pedir'),
    paginas: numerar([portada, ...paginasEditoriales, ...prendas, contraportada]),
  };
}

export const PRENDAS_POR_PAGINA = 4;

export function planCatalogo(catalogo, ahora) {
  const ordenCategoria = new Map(catalogo.categorias.map((c) => [c.id, c.orden]));
  const productos = catalogo.productos
    .filter(disponible)
    .sort((a, b) => (ordenCategoria.get(a.categoria_id) ?? 0) - (ordenCategoria.get(b.categoria_id) ?? 0) || a.orden - b.orden);
  const tarjetas = productos.map((p) => tarjeta(catalogo, p, ahora, { o: 'catalogo_pdf' }));
  const redes = redesDe(catalogo, 'catalogo_pdf');
  const urlCatalogo = new URL('catalogo/', catalogo.tienda.sitio_url).href;
  const activa = catalogo.temporadas.find((t) => t.id === catalogo.temporada_activa_id);

  const portada = {
    tipo: 'portada-catalogo',
    titulo: texto(catalogo, 'catalogo.titulo'),
    tienda: catalogo.tienda.nombre,
    eslogan: catalogo.textos['tienda.eslogan'] ?? catalogo.tienda.eslogan,
    foto: activa?.foto_portada ?? productos[0]?.fotos[0] ?? null,
    cantidad: productos.length,
    contactos: contactos(catalogo),
    horario: catalogo.tienda.horario,
    envios: catalogo.tienda.envios,
    redes,
    url: urlCatalogo,
    escaneaQr: texto(catalogo, 'revista.escanea_qr'),
    enlaces: [urlCatalogo, ...redes.map((r) => r.enlace)],
  };
  const paginas = enGrupos(tarjetas, PRENDAS_POR_PAGINA).map((grupo) => ({
    tipo: 'catalogo',
    prendas: grupo,
    enlaces: grupo.map((x) => x.enlace),
  }));

  return {
    tipo: 'catalogo',
    paleta: catalogo.paletas[catalogo.tema_paleta_id],
    nota: notaVigencia(catalogo, vigenciaCatalogo(catalogo, ahora)),
    pedir: texto(catalogo, 'revista.pedir'),
    paginas: numerar([portada, ...paginas]),
  };
}
