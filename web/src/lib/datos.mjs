// Selección de datos del catálogo para las páginas. Contrato: docs/contracts/datos-web.md.
import { ventanaVigente } from '../compartido/precio.mjs';
import { requisitoCumplido } from './vista-precio.mjs';

const instante = (iso, extremo) => (iso === null || iso === undefined ? extremo : Date.parse(iso));

export const vigente = ({ desde, hasta }, ahora = Date.now()) =>
  instante(desde, -Infinity) <= ahora && ahora < instante(hasta, Infinity);

const porOrden = (a, b) => a.orden - b.orden;

export function productoPorId(catalogo) {
  const mapa = new Map(catalogo.productos.map((p) => [p.id, p]));
  return (id) => mapa.get(id);
}

export const temporadaActiva = (catalogo) =>
  catalogo.temporadas.find((t) => t.id === catalogo.temporada_activa_id) ?? null;

export const temporadasPublicadas = (catalogo) =>
  catalogo.temporadas.filter((t) => t.id === catalogo.temporada_activa_id || t.visible_en_web);

export const temporadasArchivo = (catalogo) =>
  catalogo.temporadas.filter((t) => t.id !== catalogo.temporada_activa_id && t.visible_en_web);

// Las que no terminaron. Las que todavía no empiezan salen ocultas (pendiente) y
// el navegador las muestra cuando llega su hora.
export function portadasVigentes(catalogo, ahora = Date.now()) {
  return catalogo.portadas
    .filter((p) => ahora < instante(p.hasta, Infinity))
    .sort(porOrden)
    .map((p) => ({ ...p, pendiente: !vigente(p, ahora) }));
}

export function requisitoSeccion(seccion) {
  if (seccion.tipo === 'ofertas') return 'oferta';
  if (seccion.tipo === 'liquidacion') return 'liquidacion';
  return null;
}

function enlaceSeccion(seccion, productos, categorias) {
  if (seccion.tipo === 'novedades') return 'catalogo/';
  if (seccion.tipo === 'ofertas' || seccion.tipo === 'liquidacion') return 'catalogo/?oferta=1';
  if (seccion.tipo === 'categoria' && productos.length) {
    const ids = new Set(productos.map((p) => p.categoria_id));
    const cat = ids.size === 1 && categorias.find((c) => ids.has(c.id));
    return cat ? `catalogo/?categoria=${cat.slug}` : null;
  }
  return null;
}

// Regla 2: en ofertas y liquidación, `productos` son candidatas; se muestran las que
// cumplen al momento. `candidatas` va completo al HTML para que el navegador re-evalúe.
export function seccionesInicio(catalogo, ahora = Date.now()) {
  const buscar = productoPorId(catalogo);
  return [...catalogo.secciones]
    .sort(porOrden)
    .map((seccion) => {
      const requisito = requisitoSeccion(seccion);
      const candidatas = seccion.productos.map(buscar).filter(Boolean);
      const productos = candidatas.filter((p) => requisitoCumplido(requisito, ventanaVigente(p.precio.ventanas, ahora)));
      // Una oferta que empieza después del build deja la sección en el HTML, oculta:
      // el navegador la muestra a su hora (cliente/precios.mjs).
      const futura =
        requisito !== null &&
        candidatas.some((p) => p.precio.ventanas.some((v) => requisitoCumplido(requisito, v) && ahora < instante(v.hasta, Infinity)));
      return {
        seccion,
        requisito,
        candidatas,
        productos,
        oculta: productos.length === 0,
        visible: productos.length > 0 || futura,
        enlace: enlaceSeccion(seccion, candidatas, catalogo.categorias),
      };
    })
    .filter((s) => s.visible)
    .map(({ visible, ...s }) => s);
}
