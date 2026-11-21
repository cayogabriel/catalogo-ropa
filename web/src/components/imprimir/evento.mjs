// Evento de las páginas ir/ (botones de los PDF). Formato: docs/contracts/api-publica.md
export const ORIGENES = ['pdf', 'catalogo_pdf'];

export function origenDe(search) {
  const o = new URLSearchParams(search).get('o');
  return ORIGENES.includes(o) ? o : 'pdf';
}

// Ruta sin la base del sitio, con solo los caracteres que acepta la API
// (^/[A-Za-z0-9/_.?=&%-]{0,199}$).
export function rutaEvento(pathname, base = '/') {
  const sinBase = pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
  const limpia = sinBase.replace(/[^A-Za-z0-9/_.?=&%-]/g, '').replace(/^\/*/, '/');
  return limpia.slice(0, 200);
}

export function idSesion(azar = Math.random) {
  const letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => letras[Math.floor(azar() * letras.length)]).join('');
}

export const construirEvento = ({ t, p = null, s = null, o, pg, ss }) => ({ t, p, s, o, pg, ss });

// Envía el evento (si hay API) y redirige. sendBeacon deja el envío en cola
// aunque la página se vaya enseguida; si falla, la redirección sigue igual.
export function redirigir({ destino, evento, apiUrl, navegador, ubicacion }) {
  if (apiUrl) {
    try {
      navegador.sendBeacon(apiUrl, JSON.stringify(evento));
    } catch {
      // Sin evento: lo importante es que la clienta llegue a su destino.
    }
  }
  ubicacion.replace(destino);
}
