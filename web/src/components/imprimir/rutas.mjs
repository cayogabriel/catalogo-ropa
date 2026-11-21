// Fotos para imprimir (revista y catálogo PDF). Son JPG porque Chromium los
// incrusta en el PDF sin volver a codificarlos; un WebP se guardaría sin
// pérdida y el PDF pesaría mucho más. Los genera web/scripts/lib/fotos.mjs.
export const ANCHOS_IMPRESION = [1080, 540];

// Ruta relativa a la base del sitio. Si el original es más chico, el archivo
// conserva el nombre pero no se agranda.
export const rutaImpresion = (id, ancho) => `img/imprimir/${id}-${ancho}.jpg`;
