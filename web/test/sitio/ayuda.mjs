// Constructores de datos mínimos para las pruebas del sitio (S3).
export const T = (iso) => Date.parse(iso);

export const ventana = (extra = {}) => ({
  desde: null,
  hasta: null,
  precio: 100,
  antes: null,
  descuento_pct: null,
  etiqueta: null,
  liquidacion: false,
  cuenta_regresiva: false,
  oferta_id: null,
  ...extra,
});

// Producto con precio regular 100 y, opcionalmente, una oferta del 10 al 20 de diciembre.
export function producto(extra = {}, { oferta } = {}) {
  const ventanas = oferta
    ? [
        ventana({ hasta: '2026-12-10T00:00:00-05:00' }),
        ventana({
          desde: '2026-12-10T00:00:00-05:00',
          hasta: '2026-12-20T00:00:00-05:00',
          precio: 70,
          antes: 100,
          descuento_pct: 30,
          oferta_id: 'ofe_00000001',
          ...oferta,
        }),
        ventana({ desde: '2026-12-20T00:00:00-05:00' }),
      ]
    : [ventana()];
  return {
    id: 'prd_00000001',
    codigo: 'VES-001',
    nombre: 'Vestido',
    descripcion: '',
    categoria_id: 'cat_00000001',
    tallas: ['S', 'M'],
    tallas_agotadas: [],
    colores: ['Coral'],
    fotos: [{ id: 'fx_00000001', alt: 'Vestido coral' }],
    etiquetas: [],
    estado: 'publicado',
    vendedora_id: null,
    orden: 1,
    nuevo: false,
    ultimas_unidades: false,
    popularidad: null,
    precio: { regular: 100, ventanas },
    ...extra,
  };
}

export const EN_OFERTA = T('2026-12-15T12:00:00-05:00');
export const ANTES_OFERTA = T('2026-12-01T12:00:00-05:00');
