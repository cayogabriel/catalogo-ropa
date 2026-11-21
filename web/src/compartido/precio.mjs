// Precio vigente y formatos. Contrato: docs/contracts/datos-web.md (reglas 1 y 9).
// Lo usan la web (S3) y la revista/PDF (S6). Cambios: vía la coordinadora.

const instante = (iso, extremo) => (iso === null ? extremo : Date.parse(iso));

// Ventana con desde ≤ ahora < hasta (null = sin límite). El contrato garantiza
// ventanas contiguas de null a null, así que siempre hay una.
export function ventanaVigente(ventanas, ahora = Date.now()) {
  return (
    ventanas.find((v) => instante(v.desde, -Infinity) <= ahora && ahora < instante(v.hasta, Infinity)) ??
    ventanas[ventanas.length - 1]
  );
}

export const precioVigente = (producto, ahora = Date.now()) => ventanaVigente(producto.precio.ventanas, ahora);

export function formatearMonto(valor, simbolo = 'S/') {
  return `${simbolo} ${Number.isInteger(valor) ? valor : valor.toFixed(2)}`;
}

// «dd/mm» en hora de Lima (UTC-5 todo el año, sin horario de verano).
// Una fecha sola (AAAA-MM-DD) se toma como fecha de calendario.
export function formatearFecha(iso) {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}`;
  const lima = new Date(Date.parse(iso) - 5 * 3_600_000);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(lima.getUTCDate())}/${dos(lima.getUTCMonth() + 1)}`;
}
