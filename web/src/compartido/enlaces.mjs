// Rutas del sitio y enlaces a WhatsApp y redes. Contrato: docs/contracts/datos-web.md (reglas 6 y 7).

export const rutaProducto = (codigo) => `p/${codigo.toLowerCase()}/`;
export const rutaTemporada = (slug) => `temporada/${slug}/`;
export const urlProducto = (catalogo, codigo) => new URL(rutaProducto(codigo), catalogo.tienda.sitio_url).href;
export const urlTemporada = (catalogo, slug) => new URL(rutaTemporada(slug), catalogo.tienda.sitio_url).href;

export const enlaceWhatsApp = (numero, mensaje) => `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;

const REDES = {
  instagram: { chat: (u) => `https://ig.me/m/${u}`, perfil: (u) => `https://instagram.com/${u}` },
  facebook: { chat: (u) => `https://m.me/${u}`, perfil: (u) => `https://facebook.com/${u}` },
  tiktok: { chat: (u) => `https://www.tiktok.com/@${u}`, perfil: (u) => `https://www.tiktok.com/@${u}` },
};

// TikTok no tiene chat directo por enlace: «chat» lleva al perfil.
export function urlRed(red, usuario, tipo = 'chat') {
  if (!usuario || !REDES[red]) return null;
  return REDES[red][tipo](usuario);
}
