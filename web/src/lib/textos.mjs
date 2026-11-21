// Textos de la web: catalogo.textos y, si falta una clave, el respaldo de S5 (content/textos.json).
// Contrato: datos-web.md, regla 9. Son texto plano: nunca se insertan como HTML.
import { interpolar } from '../compartido/mensajes.mjs';

// «N prendas» con su singular. textos.json no trae la forma singular: si S5 agrega
// 'catalogo.resultado_uno', se usa esa.
export function cantidadPrendas(t, cantidad) {
  if (cantidad === 1) return t('catalogo.resultado_uno') || '1 prenda';
  return t('catalogo.resultados', { cantidad });
}

export function crearTextos(catalogo, respaldo = {}, reloj = () => new Date()) {
  const base = { tienda: catalogo.tienda.nombre, anio: String(reloj().getFullYear()) };
  return (clave, variables = {}) => {
    if (clave.startsWith('_')) return '';
    const plantilla = catalogo.textos[clave] ?? respaldo[clave] ?? '';
    return interpolar(plantilla, { ...base, ...variables });
  };
}
