// vistaPreviaPrecios simplificada para el simulador. El motor real es de S2 (y de web/src/compartido).

function redondear(p, modo) {
  if (modo === 'entero') return Math.round(p);
  if (modo === '90') return Math.floor(p - 0.9) + 0.9;
  return Math.round(p * 100) / 100;
}

export function precioConOferta(regular, oferta, redondeo = 'ninguno') {
  let p;
  if (oferta.tipo === 'porcentaje') p = regular * (1 - oferta.valor / 100);
  else if (oferta.tipo === 'monto') p = regular - oferta.valor;
  else if (oferta.tipo === 'precio_final') p = oferta.valor;
  else return null;
  p = Math.round(redondear(p, redondeo) * 100) / 100;
  return p > 0 && p < regular ? p : null;
}

const ventana = (extra = {}) => ({
  desde: null, hasta: null, precio: null, antes: null, descuento_pct: null, etiqueta: null,
  liquidacion: false, cuenta_regresiva: false, oferta_id: null, ...extra,
});

export function ventanasDe(regular, oferta, redondeo) {
  const precio = oferta ? precioConOferta(regular, oferta, redondeo) : null;
  if (precio === null) return [ventana({ precio: regular })];
  const pct = Math.floor((1 - precio / regular) * 100 + 1e-9);
  const desde = oferta.desde || null;
  const hasta = oferta.hasta || null;
  const ventanas = [];
  if (desde) ventanas.push(ventana({ hasta: desde, precio: regular }));
  ventanas.push(
    ventana({
      desde, hasta, precio, antes: regular, descuento_pct: pct,
      etiqueta: oferta.etiqueta || `-${pct}%`,
      liquidacion: !!oferta.es_liquidacion,
      cuenta_regresiva: !!oferta.cuenta_regresiva && !!hasta,
      oferta_id: oferta.id ?? null,
    }),
  );
  if (hasta) ventanas.push(ventana({ desde: hasta, precio: regular }));
  return ventanas;
}

// De las ofertas activas que alcanzan al producto, gana la de mayor prioridad y, si empatan, la de mayor descuento.
export function ofertaGanadora(candidatas, regular, redondeo) {
  const puntuadas = candidatas
    .map((o) => ({ o, precio: precioConOferta(regular, o, redondeo) }))
    .filter((x) => x.precio !== null)
    .sort((a, b) => (b.o.prioridad ?? 0) - (a.o.prioridad ?? 0) || a.precio - b.precio);
  return puntuadas[0]?.o ?? null;
}
