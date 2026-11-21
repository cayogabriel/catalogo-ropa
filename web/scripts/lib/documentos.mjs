// Rutas y manifiesto de los documentos generados. Contrato: docs/contracts/documentos.md
export const PDF_MAX_BYTES = 10_000_000;
export const JPG_MAX_BYTES = 600_000;
export const PAGINA = { ancho: 1080, alto: 1350 };
export const RUTA_CATALOGO = 'catalogo/catalogo.pdf';
export const RUTA_MANIFIESTO = 'documentos.json';

export const rutasRevista = (slug) => ({
  pdf: `temporada/${slug}/revista-${slug}.pdf`,
  carrusel: (n) => `temporada/${slug}/carrusel/${slug}-${String(n).padStart(2, '0')}.jpg`,
});

// ISO con el desfase de Lima (UTC-5 todo el año).
export const isoLima = (ms) => `${new Date(ms - 5 * 3_600_000).toISOString().slice(0, 19)}-05:00`;

export function armarManifiesto({ ahora, revistas, catalogo }) {
  return {
    generado_en: isoLima(ahora),
    revistas: revistas.map((r) => ({
      temporada_id: r.temporada_id,
      slug: r.slug,
      pdf: rutasRevista(r.slug).pdf,
      paginas: r.paginas,
      bytes: r.bytes,
      carrusel: r.carrusel,
    })),
    catalogo: { pdf: RUTA_CATALOGO, paginas: catalogo.paginas, bytes: catalogo.bytes },
  };
}

// Captura con calidad decreciente hasta que el JPG pese ≤ maxBytes.
export async function jpgHasta(capturar, maxBytes = JPG_MAX_BYTES, { desde = 90, hasta = 50, paso = 8 } = {}) {
  for (let calidad = desde; calidad >= hasta; calidad -= paso) {
    const jpg = await capturar(calidad);
    if (jpg.length <= maxBytes) return jpg;
  }
  throw new Error(`la imagen pesa más de ${maxBytes / 1000} KB aun con calidad ${hasta}`);
}
