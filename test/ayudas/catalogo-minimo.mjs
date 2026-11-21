// Catálogo publicado mínimo y válido, para construir casos de prueba.
// Cada llamada devuelve una copia nueva que el test puede modificar.

const TOKENS_BASE = {
  '--color-fondo': '#FFFFFF',
  '--color-superficie': '#FAFAFA',
  '--color-texto': '#1A1A1A',
  '--color-texto-suave': '#555555',
  '--color-borde': '#E5E5E5',
  '--color-control': '#767676',
  '--color-primario': '#B3261E',
  '--color-sobre-primario': '#FFFFFF',
  '--color-acento': '#1D4ED8',
  '--color-sobre-acento': '#FFFFFF',
  '--color-oferta': '#B91C1C',
  '--color-sobre-oferta': '#FFFFFF',
  '--color-liquidacion': '#111111',
  '--color-sobre-liquidacion': '#FFE600',
  '--color-exito': '#15803D',
  '--color-foco': '#1D4ED8',
};

export function catalogoMinimo() {
  return {
    version_esquema: 1,
    generado_en: '2026-12-01T12:00:00-05:00',
    tienda: {
      nombre: 'Tienda de prueba',
      eslogan: '',
      logo: null,
      moneda: { simbolo: 'S/', codigo: 'PEN' },
      pais_codigo: '51',
      zona_horaria: 'America/Lima',
      redes: { instagram: null, facebook: null, tiktok: null },
      horario: '',
      envios: '',
      sitio_url: 'https://cayogabriel.github.io/catalogo-ropa/',
      inicio_modo: 'temporada',
    },
    tema_paleta_id: 'neutra-minimal',
    paletas: {
      'neutra-minimal': {
        nombre: 'Neutra',
        tokens: { ...TOKENS_BASE },
        fuentes: { titulos: 'Poppins', texto: 'Nunito Sans' },
        radio: '12px',
      },
    },
    textos: {},
    vendedoras: [{ id: 'ven_00000001', nombre: 'Ana', whatsapp: '51987654321', por_defecto: true }],
    categorias: [{ id: 'cat_00000001', nombre: 'Vestidos', slug: 'vestidos', orden: 1, foto: null }],
    productos: [
      {
        id: 'prd_00000001',
        codigo: 'VES-001',
        nombre: 'Vestido de prueba',
        descripcion: '',
        categoria_id: 'cat_00000001',
        tallas: ['S', 'M'],
        tallas_agotadas: [],
        colores: ['Coral'],
        fotos: [{ id: 'fx_00000001', alt: 'Vestido de prueba coral' }],
        etiquetas: [],
        estado: 'publicado',
        vendedora_id: null,
        orden: 1,
        nuevo: false,
        ultimas_unidades: false,
        popularidad: null,
        precio: {
          regular: 89,
          ventanas: [
            {
              desde: null,
              hasta: null,
              precio: 89,
              antes: null,
              descuento_pct: null,
              etiqueta: null,
              liquidacion: false,
              cuenta_regresiva: false,
              oferta_id: null,
            },
          ],
        },
      },
    ],
    secciones: [],
    portadas: [],
    temporadas: [],
    temporada_activa_id: null,
    fotos: { fx_00000001: { actualizado: '2026-11-30T10:00:00-05:00' } },
  };
}

export function ventana(desde, hasta, precio, extra = {}) {
  return {
    desde,
    hasta,
    precio,
    antes: null,
    descuento_pct: null,
    etiqueta: null,
    liquidacion: false,
    cuenta_regresiva: false,
    oferta_id: null,
    ...extra,
  };
}
