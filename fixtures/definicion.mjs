// Definición única de los datos de ejemplo. La usan generar-imagenes.mjs y
// generar-catalogo.mjs, así que imágenes y catálogo nunca se desalinean.
// Todo es ficticio: productos, números de WhatsApp (51 + ceros) y fotos.

export const fotoId = (n) => `fx_${n.toString(16).padStart(8, '0')}`;
export const idDe = (prefijo, n) => `${prefijo}_${n.toString(16).padStart(8, '0')}`;

export const CATEGORIAS = [
  { n: 1, nombre: 'Vestidos', slug: 'vestidos', prefijo: 'VES', colores: ['#E8A598', '#8A3E30'] },
  { n: 2, nombre: 'Blusas y tops', slug: 'blusas-tops', prefijo: 'BLU', colores: ['#EFE2C8', '#8C6D46'] },
  { n: 3, nombre: 'Pantalones y faldas', slug: 'pantalones-faldas', prefijo: 'PAN', colores: ['#C9D6DF', '#3E5869'] },
  { n: 4, nombre: 'Accesorios', slug: 'accesorios', prefijo: 'ACC', colores: ['#E9D8A6', '#6B5B2E'] },
];

// cat = n de categoría; fotos = cantidad de fotos del producto.
export const PRODUCTOS = [
  { cat: 1, nombre: 'Vestido Lino Coral', precio: 89, tallas: ['S', 'M', 'L'], colores: ['Coral'], nuevo: true, fotos: 2, popularidad: 1 },
  { cat: 1, nombre: 'Vestido Midi Floral', precio: 119, tallas: ['S', 'M', 'L', 'XL'], colores: ['Floral azul'], fotos: 1 },
  { cat: 1, nombre: 'Vestido Camisero Arena', precio: 99, tallas: ['S', 'M', 'L'], agotadas: ['S'], colores: ['Arena'], fotos: 1 },
  { cat: 1, nombre: 'Vestido Wrap Esmeralda', precio: 129, tallas: ['M', 'L'], colores: ['Esmeralda'], nuevo: true, fotos: 1 },
  { cat: 1, nombre: 'Vestido Niña Margaritas', precio: 69, tallas: ['4', '6', '8', '10'], colores: ['Blanco'], nuevo: true, fotos: 2 },
  { cat: 1, nombre: 'Vestido Satinado Noche', precio: 149, tallas: ['S', 'M'], colores: ['Negro'], ultimas: true, fotos: 1 },
  { cat: 2, nombre: 'Blusa Seda Marfil', precio: 79, tallas: ['S', 'M', 'L'], colores: ['Marfil'], fotos: 2, popularidad: 2 },
  { cat: 2, nombre: 'Blusa Off-Shoulder Mostaza', precio: 59, tallas: ['S', 'M', 'L'], colores: ['Mostaza'], nuevo: true, fotos: 1 },
  { cat: 2, nombre: 'Blusa Bordada Andina', precio: 89, tallas: ['S', 'M', 'L', 'XL'], colores: ['Blanco', 'Multicolor'], fotos: 1 },
  { cat: 2, nombre: 'Blusa Lazo Rosa Palo', precio: 69, tallas: ['S', 'M'], colores: ['Rosa palo'], fotos: 1 },
  { cat: 2, nombre: 'Top Crochet Crudo', precio: 49, tallas: ['S', 'M'], colores: ['Crudo'], liquidacion: 29, fotos: 1 },
  { cat: 3, nombre: 'Pantalón Palazzo Lino', precio: 99, tallas: ['S', 'M', 'L'], colores: ['Lino natural'], fotos: 2 },
  { cat: 3, nombre: 'Jean Mom Celeste', precio: 109, tallas: ['26', '28', '30', '32'], colores: ['Celeste'], fotos: 1, popularidad: 3 },
  { cat: 3, nombre: 'Short Sastrero Beige', precio: 69, tallas: ['S', 'M', 'L'], colores: ['Beige'], nuevo: true, fotos: 1 },
  { cat: 3, nombre: 'Pantalón Cargo Oliva', precio: 89, tallas: ['S', 'M', 'L'], colores: ['Oliva'], liquidacion: 49, fotos: 1 },
  { cat: 3, nombre: 'Falda Plisada Lila', precio: 79, tallas: ['S', 'M', 'L'], colores: ['Lila'], agotado: true, fotos: 1 },
  { cat: 3, nombre: 'Conjunto Niña Lino', precio: 79, tallas: ['4', '6', '8'], colores: ['Celeste'], fotos: 1 },
  { cat: 4, nombre: 'Cartera Tejida Paja', precio: 89, tallas: ['Única'], colores: ['Natural'], fotos: 2 },
  { cat: 4, nombre: 'Sombrero Ala Ancha', precio: 59, tallas: ['Única'], colores: ['Beige'], liquidacion: 35, fotos: 1 },
  { cat: 4, nombre: 'Aretes Dorados Sol', precio: 39, tallas: ['Única'], colores: ['Dorado'], nuevo: true, fotos: 1 },
];

export const AMBIENTES = [
  { texto: 'Lino al sol', alt: 'Modelo con vestido de lino coral y sombrero frente al mar', colores: ['#F4C7A1', '#C2674B'] },
  { texto: 'Tarde en la plaza', alt: 'Dos modelos con blusa marfil y pantalón palazzo caminando por una plaza', colores: ['#EADBC8', '#7D5A44'] },
  { texto: 'Esmeralda', alt: 'Modelo con vestido wrap esmeralda junto a una pared blanca', colores: ['#9FD8C3', '#1F5E4B'] },
  { texto: 'Bordado andino', alt: 'Modelo con blusa bordada y jean celeste en un mercado', colores: ['#F2E9DA', '#9B4F2A'] },
  { texto: 'Floral', alt: 'Modelo con vestido midi floral azul en un jardín', colores: ['#C7D7F2', '#2F4E8C'] },
];

// Asigna ids de foto en orden: productos (cada uno sus fotos), ambientes,
// portada de temporada, portadas (escritorio y móvil, de a pares).
export function planDeFotos() {
  let n = 0;
  const productos = PRODUCTOS.map((p) => Array.from({ length: p.fotos }, () => fotoId(++n)));
  const ambientes = AMBIENTES.map(() => fotoId(++n));
  const portadaTemporada = fotoId(++n);
  const portadas = [
    { escritorio: fotoId(++n), movil: fotoId(++n) },
    { escritorio: fotoId(++n), movil: fotoId(++n) },
  ];
  return { productos, ambientes, portadaTemporada, portadas };
}

export function codigos() {
  const contador = {};
  return PRODUCTOS.map((p) => {
    const cat = CATEGORIAS.find((c) => c.n === p.cat);
    contador[cat.prefijo] = (contador[cat.prefijo] ?? 0) + 1;
    return `${cat.prefijo}-${String(contador[cat.prefijo]).padStart(3, '0')}`;
  });
}
