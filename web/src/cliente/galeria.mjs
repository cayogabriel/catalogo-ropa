// Galería de la ficha: puntos sincronizados con el deslizamiento y zoom a pantalla completa.
import { abrir, prepararDialogo } from './dialogos.mjs';
import { sinMovimiento } from './comun.mjs';

export function iniciarGaleria() {
  const galeria = document.querySelector('[data-galeria]');
  const dialogo = document.querySelector('[data-dialogo-zoom]');
  if (!galeria || !dialogo) return;
  const pista = galeria.querySelector('[data-pista]');
  const botones = [...galeria.querySelectorAll('[data-zoom]')];
  const puntos = [...galeria.querySelectorAll('[data-ir]')];
  const lienzo = dialogo.querySelector('[data-lienzo]');
  const img = dialogo.querySelector('[data-zoom-img]');
  let actual = 0;

  const indiceVisible = () => Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth));
  const marcar = (i) => puntos.forEach((p, j) => (j === i ? p.setAttribute('aria-current', 'true') : p.removeAttribute('aria-current')));

  let cuadro;
  pista.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => marcar(indiceVisible()));
    },
    { passive: true },
  );
  puntos.forEach((p, i) =>
    p.addEventListener('click', () => {
      pista.scrollTo({ left: i * pista.clientWidth, behavior: sinMovimiento() ? 'auto' : 'smooth' });
      marcar(i);
    }),
  );

  const mostrar = (i) => {
    actual = (i + botones.length) % botones.length;
    const b = botones[actual];
    lienzo.classList.remove('ampliada');
    img.src = b.dataset.grande;
    img.alt = b.dataset.alt ?? '';
  };

  prepararDialogo(dialogo);
  botones.forEach((b, i) =>
    b.addEventListener('click', () => {
      mostrar(i);
      abrir(dialogo);
    }),
  );

  // Tocar la foto la amplía al doble (y se puede desplazar); otro toque la vuelve a ajustar.
  lienzo.addEventListener('click', (e) => {
    if (e.target !== img) return;
    const r = img.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const ampliada = lienzo.classList.toggle('ampliada');
    if (ampliada) {
      requestAnimationFrame(() => {
        lienzo.scrollLeft = fx * img.clientWidth - lienzo.clientWidth / 2;
        lienzo.scrollTop = fy * img.clientHeight - lienzo.clientHeight / 2;
      });
    }
  });

  for (const b of dialogo.querySelectorAll('[data-zoom-paso]')) {
    b.addEventListener('click', () => mostrar(actual + Number(b.dataset.zoomPaso)));
  }
  dialogo.addEventListener('keydown', (e) => {
    if (botones.length < 2) return;
    if (e.key === 'ArrowRight') mostrar(actual + 1);
    if (e.key === 'ArrowLeft') mostrar(actual - 1);
  });
}
