// Dirección pública del sitio. Para un dominio propio: SITIO_URL=https://mitienda.pe SITIO_BASE=''
export const SITIO = process.env.SITIO_URL ?? 'https://cayogabriel.github.io';
export const BASE = process.env.SITIO_BASE ?? '/catalogo-ropa';
export const URL_BASE = `${SITIO.replace(/\/$/, '')}${BASE.replace(/\/$/, '')}/`;
