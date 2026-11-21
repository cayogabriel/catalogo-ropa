// Lo común a todas las páginas en el navegador: eventos, Mi lista, aviso y textos.
import { crearEventos, idSesion, limpiarRuta } from '../lib/eventos.mjs';
import { crearLista } from '../lib/lista.mjs';
import { interpolar } from '../compartido/mensajes.mjs';

const almacen = (tipo) => {
  try {
    return window[tipo];
  } catch {
    return null;
  }
};

const leerJson = (texto, respaldo) => {
  try {
    return JSON.parse(texto);
  } catch {
    return respaldo;
  }
};

export const tienda = () => leerJson(document.body.dataset.tienda, { tienda: {}, textos: {}, vendedoras: [] });

let diccionario = null;
export function texto(clave, variables = {}) {
  diccionario ??= leerJson(document.body.dataset.textos, {});
  return interpolar(diccionario[clave] ?? '', variables);
}

export const lista = crearLista(almacen('localStorage'));

let enviarEvento = () => false;
export const origen = () => document.body.dataset.origen ?? 'web';

// t = vista | whatsapp | favorito | compartir | revista_descarga
export const evento = (t, { p = null, s = null } = {}) =>
  enviarEvento({ t, p, s: s ?? document.body.dataset.temporadaId ?? null, o: origen() });

export const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let temporizadorAviso;
export function avisar(mensaje, { exito = true } = {}) {
  const p = document.querySelector('[data-aviso] p');
  if (!p) return;
  clearTimeout(temporizadorAviso);
  p.textContent = mensaje;
  p.classList.toggle('exito', exito);
  p.classList.add('visible');
  temporizadorAviso = setTimeout(() => p.classList.remove('visible'), 2400);
}

export function actualizarContador() {
  const n = lista.leer().length;
  for (const el of document.querySelectorAll('[data-contador-lista]')) {
    el.textContent = String(n);
    el.hidden = n === 0;
    el.setAttribute('aria-label', `${n}`);
  }
}

export const avisarCambioLista = () => {
  actualizarContador();
  document.dispatchEvent(new CustomEvent('lista:cambio'));
};

export function iniciarComun() {
  const url = import.meta.env.PUBLIC_API_URL;
  enviarEvento = crearEventos({
    url,
    beacon: typeof navigator.sendBeacon === 'function' ? navigator.sendBeacon.bind(navigator) : null,
    sesion: url ? idSesion(almacen('sessionStorage')) : '',
    ruta: limpiarRuta(location.pathname, import.meta.env.BASE_URL),
  });

  evento('vista', { p: document.body.dataset.productoId ?? null });

  // Clics que se cuentan: [data-evento="whatsapp" | "revista_descarga"], con data-p / data-s.
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-evento]') : null;
    if (!el) return;
    evento(el.dataset.evento, { p: el.dataset.p ?? null, s: el.dataset.s ?? null });
  });

  actualizarContador();
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === 'catalogo-ropa:lista') avisarCambioLista();
  });
}
