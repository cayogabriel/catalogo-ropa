// Abrir y cerrar <dialog> con animación interrumpible (clase .abierta + transform/opacity).
// Esc y un toque en el fondo cierran. Al cerrar, el foco vuelve a quien lo abrió.
const CIERRE_MS = 320;

export function abrir(dialogo) {
  clearTimeout(dialogo._cierre);
  if (!dialogo.open) dialogo.showModal();
  // Un cuadro para que la transición parta del estado cerrado.
  requestAnimationFrame(() => requestAnimationFrame(() => dialogo.classList.add('abierta')));
}

export function cerrar(dialogo) {
  if (!dialogo.open) return;
  dialogo.classList.remove('abierta');
  clearTimeout(dialogo._cierre);
  const terminar = () => {
    if (!dialogo.classList.contains('abierta')) dialogo.close();
  };
  dialogo.addEventListener('transitionend', terminar, { once: true });
  dialogo._cierre = setTimeout(terminar, CIERRE_MS);
}

export function prepararDialogo(dialogo) {
  if (dialogo._listo) return;
  dialogo._listo = true;
  dialogo.addEventListener('cancel', (e) => {
    e.preventDefault();
    cerrar(dialogo);
  });
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrar(dialogo);
    if (e.target instanceof Element && e.target.closest('[data-cerrar]')) cerrar(dialogo);
  });
}
