// PDF mínimo hecho a mano para las pruebas (sin Chromium): páginas con un
// texto y enlaces URI. paginas: [{ ancho, alto, texto, enlaces: [url] }]
export function pdfMinimo(paginas) {
  const objetos = [];
  const agregar = (cuerpo) => objetos.push(cuerpo) && objetos.length;
  const catalogoId = agregar(null);
  const arbolId = agregar(null);
  const fuenteId = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const hijos = paginas.map(({ ancho, alto, texto = '', enlaces = [] }) => {
    const flujo = `BT /F1 12 Tf 20 20 Td (${texto.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    const contenidoId = agregar(`<< /Length ${Buffer.byteLength(flujo, 'latin1')} >>\nstream\n${flujo}\nendstream`);
    const anotaciones = enlaces.map((url, i) =>
      agregar(`<< /Type /Annot /Subtype /Link /Rect [10 ${40 + i * 30} 200 ${60 + i * 30}] /Border [0 0 0] /A << /S /URI /URI (${url}) >> >>`),
    );
    return agregar(
      `<< /Type /Page /Parent ${arbolId} 0 R /MediaBox [0 0 ${ancho} ${alto}] /Contents ${contenidoId} 0 R ` +
        `/Resources << /Font << /F1 ${fuenteId} 0 R >> >> /Annots [${anotaciones.map((a) => `${a} 0 R`).join(' ')}] >>`,
    );
  });
  objetos[catalogoId - 1] = `<< /Type /Catalog /Pages ${arbolId} 0 R >>`;
  objetos[arbolId - 1] = `<< /Type /Pages /Kids [${hijos.map((h) => `${h} 0 R`).join(' ')}] /Count ${hijos.length} >>`;

  let pdf = '%PDF-1.4\n';
  const posiciones = objetos.map((cuerpo, i) => {
    const pos = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
    return pos;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
