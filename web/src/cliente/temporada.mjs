// Temporada: hojas inferiores de las prendas y fundido de las fotos al entrar en pantalla.
import { abrir, prepararDialogo } from './dialogos.mjs';
import { iniciarPedidos } from './pedido.mjs';
import { sinMovimiento } from './comun.mjs';

function iniciarHojas() {
  document.addEventListener('click', (e) => {
    const disparador = e.target instanceof Element ? e.target.closest('[data-hoja]') : null;
    if (!disparador || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const hoja = document.getElementById(disparador.dataset.hoja);
    if (!(hoja instanceof HTMLDialogElement) || typeof hoja.showModal !== 'function') return;
    e.preventDefault();
    prepararDialogo(hoja);
    abrir(hoja);
  });
}

function iniciarFundido() {
  const lista = document.querySelector('[data-fotos-temporada]');
  if (!lista || sinMovimiento() || !('IntersectionObserver' in window)) return;
  const fotos = [...lista.querySelectorAll('.foto-temporada')];
  // Lo que ya se ve no parpadea: se marca visible antes de activar el fundido.
  for (const f of fotos) if (f.getBoundingClientRect().top < window.innerHeight) f.classList.add('visible');
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observador.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  fotos.filter((f) => !f.classList.contains('visible')).forEach((f) => observador.observe(f));
  lista.classList.add('anim-fotos');
}

let iniciada = false;
export function iniciarTemporada() {
  if (iniciada) return;
  iniciada = true;
  iniciarHojas();
  iniciarPedidos();
  iniciarFundido();
}
