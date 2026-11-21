// Eventos anónimos hacia la API pública. Contrato: docs/contracts/api-publica.md («Eventos»).
// Sin URL configurada no se envía nada. Nunca lleva datos personales.
const TIPOS = new Set(['vista', 'whatsapp', 'favorito', 'compartir', 'revista_descarga']);
const ORIGENES = new Set(['web', 'revista_web', 'pdf', 'catalogo_pdf']);
const CLAVE_SESION = 'catalogo-ropa:sesion';

export function limpiarRuta(pathname, base = '/') {
  let ruta = String(pathname ?? '');
  const b = base.endsWith('/') ? base : `${base}/`;
  if (b !== '/' && ruta.startsWith(b)) ruta = ruta.slice(b.length - 1);
  else if (b !== '/' && ruta === b.slice(0, -1)) ruta = '/';
  ruta = ruta.replace(/[^A-Za-z0-9/_.?=&%-]/g, '');
  if (!ruta.startsWith('/')) ruta = `/${ruta}`;
  return ruta.slice(0, 200);
}

const aleatorio = () => {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function idSesion(almacen) {
  try {
    const guardado = almacen?.getItem(CLAVE_SESION);
    if (guardado && /^[a-z0-9]{16}$/.test(guardado)) return guardado;
  } catch {
    // sessionStorage bloqueado: id solo para esta carga.
  }
  const nuevo = aleatorio();
  try {
    almacen?.setItem(CLAVE_SESION, nuevo);
  } catch {
    // sin almacén: no pasa nada.
  }
  return nuevo;
}

export function crearEventos({ url, beacon, sesion, ruta }) {
  return function enviar({ t, p = null, s = null, o = 'web' }) {
    if (!url || typeof beacon !== 'function' || !TIPOS.has(t) || !ORIGENES.has(o)) return false;
    try {
      return beacon(url, JSON.stringify({ t, p, s, o, pg: ruta, ss: sesion })) === true;
    } catch {
      return false;
    }
  };
}
