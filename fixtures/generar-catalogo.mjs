// Genera fixtures/catalogo.ejemplo.json con fechas relativas a «ahora».
// Uso: node fixtures/generar-catalogo.mjs [--ahora=2026-12-01T12:00:00-05:00]
// Usa las paletas, textos y plantillas reales de content/ (S5).
import { readFileSync, writeFileSync } from 'node:fs';
import { validarCatalogo } from '@catalogo/contratos';
import { CATEGORIAS, PRODUCTOS, AMBIENTES, planDeFotos, codigos, idDe } from './definicion.mjs';

const arg = process.argv.find((a) => a.startsWith('--ahora='));
const AHORA = arg ? new Date(arg.slice('--ahora='.length)) : new Date();
const DIA = 86_400_000;

// Lima no tiene horario de verano: el desfase es siempre -05:00.
function lima(fecha) {
  const local = new Date(fecha.getTime() - 5 * 3_600_000);
  return `${local.toISOString().slice(0, 19)}-05:00`;
}
const diaLima = (fecha) => lima(fecha).slice(0, 10);
const enDias = (n) => new Date(AHORA.getTime() + n * DIA);
const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));

const contenidoPaletas = leer('../content/paletas.json').paletas;
const paletas = Object.fromEntries(contenidoPaletas.map((p) => [p.id, { nombre: p.nombre, tokens: p.tokens, fuentes: p.fuentes, radio: p.radio }]));
const textosS5 = leer('../content/textos.json');
const plantillas = leer('../content/plantillas-whatsapp.json').plantillas;
const textos = Object.fromEntries(Object.entries(textosS5).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string'));
textos['whatsapp.producto'] = plantillas.producto.mensaje;
textos['whatsapp.lista'] = plantillas.lista.mensaje;
textos['whatsapp.revista'] = plantillas.revista.mensaje;
const titulo = (clave, defecto) => textos[clave] ?? defecto;

const plan = planDeFotos();
const cods = codigos();
const idProducto = (i) => idDe('prd', i + 1);
const idCategoria = (n) => idDe('cat', n);
const OFERTA_VERANO = idDe('ofe', 1);
const OFERTA_LIQUIDACION = idDe('ofe', 2);
const inicioVerano = lima(enDias(-2));
const finVerano = lima(enDias(10));
const inicioLiquidacion = lima(enDias(-5));

function ventana(desde, hasta, precio, extra = {}) {
  return { desde, hasta, precio, antes: null, descuento_pct: null, etiqueta: null, liquidacion: false, cuenta_regresiva: false, oferta_id: null, ...extra };
}
const pct = (antes, ahora) => Math.round(((antes - ahora) / antes) * 100);

function ventanas(p) {
  if (p.liquidacion) {
    return [
      ventana(null, inicioLiquidacion, p.precio),
      ventana(inicioLiquidacion, null, p.liquidacion, {
        antes: p.precio, descuento_pct: pct(p.precio, p.liquidacion), etiqueta: 'Liquidación', liquidacion: true, oferta_id: OFERTA_LIQUIDACION,
      }),
    ];
  }
  if (p.cat === 1) {
    const enOferta = Math.round(p.precio * 0.75 * 100) / 100;
    return [
      ventana(null, inicioVerano, p.precio),
      ventana(inicioVerano, finVerano, enOferta, { antes: p.precio, descuento_pct: 25, etiqueta: '-25%', cuenta_regresiva: true, oferta_id: OFERTA_VERANO }),
      ventana(finVerano, null, p.precio),
    ];
  }
  return [ventana(null, null, p.precio)];
}

const productos = PRODUCTOS.map((p, i) => ({
  id: idProducto(i),
  codigo: cods[i],
  nombre: p.nombre,
  descripcion: `${p.nombre}. Prenda de ejemplo para probar el catálogo.`,
  categoria_id: idCategoria(p.cat),
  tallas: p.tallas,
  tallas_agotadas: p.agotadas ?? [],
  colores: p.colores,
  fotos: plan.productos[i].map((id, k) => ({ id, alt: k === 0 ? `${p.nombre} en ${p.colores[0].toLowerCase()}` : `${p.nombre}, otra vista` })),
  etiquetas: p.nuevo ? ['nuevo'] : [],
  estado: p.agotado ? 'agotado' : 'publicado',
  vendedora_id: null,
  orden: i + 1,
  nuevo: Boolean(p.nuevo),
  ultimas_unidades: Boolean(p.ultimas),
  popularidad: p.popularidad ?? null,
  precio: { regular: p.precio, ventanas: ventanas(p) },
}));

const porCodigo = Object.fromEntries(productos.map((p) => [p.codigo, p.id]));
const ids = (...cs) => cs.map((c) => porCodigo[c]);

const TEMPORADA = idDe('tem', 1);
// [tipo, foto, productos, texto, destacada]
const fotosTemporada = [
  ['ambiente', { id: plan.ambientes[0], alt: AMBIENTES[0].alt }, ids('VES-001', 'ACC-002'), 'Lino y sol para la costa.', true],
  ['producto', productos[0].fotos[1], ids('VES-001'), 'Coral, el color del verano.', false],
  ['ambiente', { id: plan.ambientes[1], alt: AMBIENTES[1].alt }, ids('BLU-001', 'PAN-001'), 'Marfil y lino, fresco todo el día.', false],
  ['producto', productos[7].fotos[0], ids('BLU-002'), 'Hombros al aire.', false],
  ['producto', productos[4].fotos[0], ids('VES-005'), 'También para ellas.', false],
  ['ambiente', { id: plan.ambientes[2], alt: AMBIENTES[2].alt }, ids('VES-004'), 'Esmeralda para la noche.', true],
  ['producto', productos[13].fotos[0], ids('PAN-003'), 'Corte sastre, tela liviana.', false],
  ['ambiente', { id: plan.ambientes[3], alt: AMBIENTES[3].alt }, ids('BLU-003', 'PAN-002'), 'Bordado hecho a mano.', false],
  ['producto', productos[17].fotos[1], ids('ACC-001'), 'Tejida en paja natural.', false],
  ['ambiente', { id: plan.ambientes[4], alt: AMBIENTES[4].alt }, ids('VES-002'), 'Flores para los días largos.', false],
].map(([tipo, foto, prods, texto, destacada], k) => ({ id: idDe('tfo', k + 1), foto, tipo, productos: prods, texto, destacada }));

const catalogo = {
  version_esquema: 1,
  generado_en: lima(AHORA),
  tienda: {
    nombre: 'Tienda de ejemplo',
    eslogan: 'Ropa para mujer y niñas, con envío desde Ayacucho.',
    logo: null,
    moneda: { simbolo: 'S/', codigo: 'PEN' },
    pais_codigo: '51',
    zona_horaria: 'America/Lima',
    redes: { instagram: null, facebook: null, tiktok: null },
    horario: 'Lunes a sábado, 9:00–20:00',
    envios: 'Coordinamos el envío por WhatsApp.',
    sitio_url: 'https://cayogabriel.github.io/catalogo-ropa/',
    inicio_modo: 'temporada',
  },
  tema_paleta_id: 'verano-costa',
  paletas,
  textos,
  vendedoras: [
    { id: idDe('ven', 1), nombre: 'Vendedora 1', whatsapp: '51000000001', por_defecto: true },
    { id: idDe('ven', 2), nombre: 'Vendedora 2', whatsapp: '51000000002', por_defecto: false },
  ],
  categorias: CATEGORIAS.map((c) => ({ id: idCategoria(c.n), nombre: c.nombre, slug: c.slug, orden: c.n, foto: null })),
  productos,
  secciones: [
    { id: idDe('sec', 1), titulo: titulo('seccion.novedades.titulo', 'Novedades'), subtitulo: titulo('seccion.novedades.subtitulo', ''), tipo: 'novedades', diseno: 'carrusel', orden: 1, productos: productos.filter((p) => p.nuevo).map((p) => p.id) },
    { id: idDe('sec', 2), titulo: titulo('seccion.ofertas.titulo', 'Ofertas'), subtitulo: titulo('seccion.ofertas.subtitulo', ''), tipo: 'ofertas', diseno: 'grilla', orden: 2, productos: productos.filter((p) => p.categoria_id === idCategoria(1)).map((p) => p.id) },
    { id: idDe('sec', 3), titulo: titulo('seccion.liquidacion.titulo', 'Liquidación'), subtitulo: titulo('seccion.liquidacion.subtitulo', ''), tipo: 'liquidacion', diseno: 'grilla', orden: 3, productos: ids('BLU-005', 'PAN-004', 'ACC-002') },
    { id: idDe('sec', 4), titulo: titulo('seccion.mas_consultados.titulo', 'Más consultados'), subtitulo: titulo('seccion.mas_consultados.subtitulo', ''), tipo: 'mas_consultados', diseno: 'carrusel', orden: 4, productos: ids('VES-001', 'BLU-001', 'PAN-002') },
    { id: idDe('sec', 5), titulo: 'Accesorios', subtitulo: '', tipo: 'categoria', diseno: 'carrusel', orden: 5, productos: productos.filter((p) => p.categoria_id === idCategoria(4)).map((p) => p.id) },
  ],
  portadas: [
    { id: idDe('por', 1), titulo: 'Verano en la costa', subtitulo: 'Prendas frescas para los días de sol.', boton_texto: 'Ver temporada', boton_destino: '/temporada/verano-2027/', foto_escritorio: { id: plan.portadas[0].escritorio, alt: 'Portada de verano' }, foto_movil: { id: plan.portadas[0].movil, alt: 'Portada de verano' }, desde: null, hasta: null, orden: 1, temporada_id: TEMPORADA },
    { id: idDe('por', 2), titulo: 'Liquidación', subtitulo: 'Precios rebajados mientras haya stock.', boton_texto: 'Ver liquidación', boton_destino: '/catalogo/?oferta=1', foto_escritorio: { id: plan.portadas[1].escritorio, alt: 'Portada de liquidación' }, foto_movil: { id: plan.portadas[1].movil, alt: 'Portada de liquidación' }, desde: inicioLiquidacion, hasta: null, orden: 2, temporada_id: null },
  ],
  temporadas: [
    {
      id: TEMPORADA,
      slug: 'verano-2027',
      nombre: 'Verano 2027',
      titulo: 'Verano en la costa',
      subtitulo: 'Prendas frescas para los días de sol.',
      intro: 'Telas ligeras y colores de playa. Elige tu talla y escríbenos.',
      cierre: '¿Te gustó algo? Escríbenos por WhatsApp y te ayudamos con tu talla.',
      paleta_id: 'verano-costa',
      foto_portada: { id: plan.portadaTemporada, alt: 'Portada de la temporada Verano 2027' },
      desde: lima(enDias(-20)),
      hasta: lima(enDias(100)),
      visible_en_web: true,
      revista: true,
      vigencia_hasta: diaLima(new Date(Math.min(enDias(15).getTime(), enDias(10).getTime()))),
      fotos: fotosTemporada,
    },
  ],
  temporada_activa_id: TEMPORADA,
  fotos: {},
};

// Índice de fotos = exactamente las usadas (lista blanca).
const actualizado = lima(enDias(-1));
const usadas = [
  ...productos.flatMap((p) => p.fotos),
  ...catalogo.portadas.flatMap((p) => [p.foto_escritorio, p.foto_movil]),
  catalogo.temporadas[0].foto_portada,
  ...fotosTemporada.map((f) => f.foto),
];
for (const f of usadas) catalogo.fotos[f.id] = { actualizado };

const r = validarCatalogo(catalogo);
if (!r.ok) {
  console.error(r.errores.join('\n'));
  process.exit(1);
}
writeFileSync(new URL('./catalogo.ejemplo.json', import.meta.url), `${JSON.stringify(catalogo, null, 2)}\n`);
console.log(`Catálogo de ejemplo: ${productos.length} productos, ${Object.keys(catalogo.fotos).length} fotos, ahora=${lima(AHORA)}`);
