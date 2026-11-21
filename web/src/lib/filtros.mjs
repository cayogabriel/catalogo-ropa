// Filtros, búsqueda y orden del catálogo. Los filtros viven en la URL
// (?categoria=<slug>&talla=M&color=…&min=…&max=…&oferta=1&q=…&orden=…).
// item = { codigo, nombre, categoria, tallas, agotadas, colores, precio, oferta, orden }
const ORDENES = ['recomendado', 'precio-asc', 'precio-desc', 'nombre'];
const ESCALA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const MAX_BUSQUEDA = 60;

export const normalizar = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const unicos = (valores) => [...new Set(valores)];

function rangoTalla(t) {
  const i = ESCALA.indexOf(t.toUpperCase());
  if (i >= 0) return [0, i];
  if (/^\d+$/.test(t)) return [1, Number(t)];
  return [2, 0];
}

const compararTallas = (a, b) => {
  const [ga, va] = rangoTalla(a);
  const [gb, vb] = rangoTalla(b);
  return ga - gb || va - vb || a.localeCompare(b, 'es');
};

export function opcionesFiltro(items) {
  const precios = items.map((i) => i.precio);
  return {
    categorias: unicos(items.map((i) => i.categoria)),
    tallas: unicos(items.flatMap((i) => i.tallas)).sort(compararTallas),
    colores: unicos(items.flatMap((i) => i.colores)).sort((a, b) => a.localeCompare(b, 'es')),
    precioMin: precios.length ? Math.floor(Math.min(...precios)) : 0,
    precioMax: precios.length ? Math.ceil(Math.max(...precios)) : 0,
  };
}

const numero = (v) => {
  if (v === null || v === '' || !/^\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
};

const de = (valor, permitidos) => (valor !== null && permitidos.includes(valor) ? valor : null);

export function leerFiltros(params, opciones) {
  const orden = params.get('orden');
  return {
    categoria: de(params.get('categoria'), opciones.categorias),
    talla: de(params.get('talla'), opciones.tallas),
    color: de(params.get('color'), opciones.colores),
    min: numero(params.get('min')),
    max: numero(params.get('max')),
    oferta: params.get('oferta') === '1',
    q: (params.get('q') ?? '').slice(0, MAX_BUSQUEDA),
    orden: ORDENES.includes(orden) ? orden : 'recomendado',
  };
}

export function escribirFiltros(f) {
  const p = new URLSearchParams();
  if (f.categoria) p.set('categoria', f.categoria);
  if (f.talla) p.set('talla', f.talla);
  if (f.color) p.set('color', f.color);
  if (f.min !== null && f.min !== undefined) p.set('min', String(f.min));
  if (f.max !== null && f.max !== undefined) p.set('max', String(f.max));
  if (f.oferta) p.set('oferta', '1');
  if (f.q && f.q.trim()) p.set('q', f.q.trim());
  if (f.orden && f.orden !== 'recomendado') p.set('orden', f.orden);
  return p.toString();
}

const COMPARADORES = {
  recomendado: (a, b) => a.orden - b.orden,
  'precio-asc': (a, b) => a.precio - b.precio || a.orden - b.orden,
  'precio-desc': (a, b) => b.precio - a.precio || a.orden - b.orden,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) || a.orden - b.orden,
};

export function aplicar(items, f) {
  const palabras = normalizar(f.q).split(' ').filter(Boolean);
  return items
    .filter((i) => {
      if (f.categoria && i.categoria !== f.categoria) return false;
      if (f.talla && !(i.tallas.includes(f.talla) && !i.agotadas.includes(f.talla))) return false;
      if (f.color && !i.colores.includes(f.color)) return false;
      if (f.min !== null && i.precio < f.min) return false;
      if (f.max !== null && i.precio > f.max) return false;
      if (f.oferta && !i.oferta) return false;
      if (palabras.length) {
        const pajar = normalizar([i.nombre, i.codigo, ...i.colores].join(' '));
        if (!palabras.every((w) => pajar.includes(w))) return false;
      }
      return true;
    })
    .sort(COMPARADORES[f.orden] ?? COMPARADORES.recomendado);
}
