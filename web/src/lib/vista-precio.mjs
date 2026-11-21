// Precio, insignias y cuenta regresiva tal como se muestran. Lo usan el HTML (al construir)
// y el navegador (al cargar), para que una oferta empiece o termine a su hora.
// Contrato: docs/contracts/datos-web.md (reglas 1, 3 y 4).
import { ventanaVigente, formatearMonto } from '../compartido/precio.mjs';

export function presentarPrecio(producto, ahora = Date.now()) {
  const v = ventanaVigente(producto.precio.ventanas, ahora);
  const oferta = v.oferta_id !== null;
  return {
    precio: v.precio,
    antes: oferta ? v.antes : null,
    pct: oferta ? v.descuento_pct : null,
    etiqueta: oferta ? v.etiqueta : null,
    oferta,
    liquidacion: oferta && v.liquidacion,
    hasta: v.hasta,
    cuentaRegresiva: oferta && v.cuenta_regresiva && v.hasta !== null,
  };
}

// Texto para compartir con el precio vigente al momento del clic.
export const textoCompartir = (producto, simbolo, ahora = Date.now()) =>
  `${producto.nombre} · ${formatearMonto(presentarPrecio(producto, ahora).precio, simbolo)}`;

export function requisitoCumplido(requisito, ventana) {
  if (requisito === 'oferta') return ventana.oferta_id !== null;
  if (requisito === 'liquidacion') return ventana.oferta_id !== null && ventana.liquidacion === true;
  return true;
}

// textos: (clave, variables) => string. Solo insignias con dato real.
export function insignias(producto, ahora, textos) {
  const p = presentarPrecio(producto, ahora);
  const lista = [];
  if (producto.nuevo) lista.push({ tipo: 'nuevo', texto: textos('insignia.nuevo') });
  if (p.oferta && (p.etiqueta || p.pct)) {
    lista.push({
      tipo: 'descuento',
      texto: p.etiqueta ?? textos('precio.descuento', { porcentaje: p.pct }),
      // true si solo dice «-NN %»: junto a un precio que ya muestra el % se puede ocultar.
      repitePct: p.etiqueta === null || /^-?\s*\d+\s*%$/.test(p.etiqueta.trim()),
    });
  }
  if (p.liquidacion) lista.push({ tipo: 'liquidacion', texto: textos('insignia.liquidacion') });
  if (producto.ultimas_unidades) lista.push({ tipo: 'ultimas', texto: textos('insignia.ultimas_unidades') });
  if (Number.isInteger(producto.popularidad) && producto.popularidad >= 1 && producto.popularidad <= 3) {
    lista.push({ tipo: 'consultado', texto: textos('insignia.mas_consultado') });
  }
  return lista;
}

export function restante(hastaIso, ahora = Date.now()) {
  if (!hastaIso) return null;
  const ms = Date.parse(hastaIso) - ahora;
  if (!(ms > 0)) return null;
  const minutosTotales = Math.floor(ms / 60_000);
  return {
    dias: Math.floor(minutosTotales / 1440),
    horas: Math.floor((minutosTotales % 1440) / 60),
    minutos: minutosTotales % 60,
  };
}
