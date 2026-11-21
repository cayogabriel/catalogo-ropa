// Mensajes de WhatsApp a partir de las plantillas de la tienda (textos.whatsapp.*).
// Contrato: docs/contracts/datos-web.md (reglas 6 y 9).
import { precioVigente, formatearMonto } from './precio.mjs';
import { urlProducto } from './enlaces.mjs';

const RESPALDO = 'Hola, me interesa {producto} ({codigo}). {enlace}';

// Reemplaza {variables}. Si una variable de una línea está vacía (o no existe),
// se elimina la línea completa: así «Talla: {talla}» desaparece sin talla elegida.
export function interpolar(plantilla, variables) {
  const vacia = (nombre) => {
    const valor = variables[nombre];
    return valor === undefined || valor === null || valor === '';
  };
  return plantilla
    .split('\n')
    .filter((linea) => ![...linea.matchAll(/\{([a-z_]+)\}/g)].some(([, nombre]) => vacia(nombre)))
    .map((linea) => linea.replace(/\{([a-z_]+)\}/g, (_, nombre) => String(variables[nombre])))
    .join('\n');
}

export function vendedoraPara(producto, vendedoras) {
  return vendedoras.find((v) => v.id === producto.vendedora_id) ?? vendedoras.find((v) => v.por_defecto);
}

const monto = (catalogo, valor) => formatearMonto(valor, catalogo.tienda.moneda.simbolo);

function variablesProducto(catalogo, producto, ahora) {
  return {
    vendedora: vendedoraPara(producto, catalogo.vendedoras)?.nombre,
    producto: producto.nombre,
    codigo: producto.codigo,
    precio: monto(catalogo, precioVigente(producto, ahora).precio),
    enlace: urlProducto(catalogo, producto.codigo),
  };
}

export function mensajeProducto({ catalogo, producto, talla, color, ahora = Date.now() }) {
  const plantilla = catalogo.textos['whatsapp.producto'] ?? RESPALDO;
  return interpolar(plantilla, { ...variablesProducto(catalogo, producto, ahora), talla, color });
}

export function mensajeRevista({ catalogo, producto, ahora = Date.now() }) {
  const plantilla = catalogo.textos['whatsapp.revista'] ?? RESPALDO;
  return interpolar(plantilla, variablesProducto(catalogo, producto, ahora));
}

// items: [{ producto, talla, color }]. La vendedora es la por defecto de la tienda.
export function mensajeLista({ catalogo, items, ahora = Date.now() }) {
  const plantilla = catalogo.textos['whatsapp.lista'] ?? 'Hola, esta es mi lista:\n{lista}\nTotal: {total}';
  let total = 0;
  const lineas = items.map(({ producto, talla, color }) => {
    const precio = precioVigente(producto, ahora).precio;
    total += precio;
    const partes = [`${producto.nombre} (${producto.codigo})`, talla, color, monto(catalogo, precio)].filter(Boolean);
    return `- ${partes.join(' · ')}`;
  });
  return interpolar(plantilla, {
    vendedora: catalogo.vendedoras.find((v) => v.por_defecto)?.nombre,
    lista: lineas.join('\n'),
    total: monto(catalogo, Math.round(total * 100) / 100),
  });
}
