// Rutas de las fotos procesadas (imagenes[id] de catalogo.json). Contrato: datos-web.md.
const anchos = (imagen) => Object.keys(imagen.webp).map(Number).sort((a, b) => a - b);

export const srcset = (imagen, base) => anchos(imagen).map((w) => `${base}${imagen.webp[w]} ${w}w`).join(', ');

export const srcMayor = (imagen, base) => base + imagen.webp[anchos(imagen).at(-1)];

export const srcMenor = (imagen, base) => base + imagen.webp[anchos(imagen)[0]];

export const ogAbsoluta = (imagen, urlBase) => urlBase + imagen.og;
