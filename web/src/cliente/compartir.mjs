// Compartir la ficha: Web Share API y, si no hay, copiar el enlace.
import { avisar, evento, texto } from './comun.mjs';

async function copiar(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function iniciarCompartir() {
  for (const boton of document.querySelectorAll('[data-compartir]')) {
    boton.addEventListener('click', async () => {
      const datos = { title: boton.dataset.titulo, text: boton.dataset.texto, url: boton.dataset.url };
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share(datos);
          evento('compartir', { p: boton.dataset.p ?? null });
        } catch {
          // La clienta canceló: no pasa nada.
        }
        return;
      }
      if (await copiar(datos.url)) {
        evento('compartir', { p: boton.dataset.p ?? null });
        avisar(texto('producto.copiado'));
      } else {
        avisar(texto('aviso.error_generico'), { exito: false });
      }
    });
  }
  for (const boton of document.querySelectorAll('[data-copiar]')) {
    boton.addEventListener('click', async () => {
      if (await copiar(boton.dataset.url)) {
        evento('compartir', { p: boton.dataset.p ?? null });
        avisar(texto('producto.copiado'));
      } else {
        avisar(texto('aviso.error_generico'), { exito: false });
      }
    });
  }
}
