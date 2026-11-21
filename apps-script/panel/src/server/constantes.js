// Nombres fijos y valores por defecto del Panel. Ver docs/contracts/.

const NOMBRE_HOJA = 'Catálogo Ropa — Base de datos';
const NOMBRE_CARPETA_RAIZ = 'Catálogo Ropa';
const NOMBRE_PUNTERO = 'catalogo-ropa.config.json';
const NOMBRE_PUBLICADO = 'catalogo-publicado.json';

// clave del puntero → ruta dentro de la carpeta raíz
const CARPETAS = {
  fotos: 'Fotos',
  temporadas: 'Temporadas',
  portadas: 'Portadas',
  marca: 'Marca',
  publicado: 'Publicado',
  documentos: 'Documentos',
  revistas: 'Documentos/Revistas',
  catalogos: 'Documentos/Catálogos',
  reportes: 'Documentos/Reportes',
};

// Propiedades del script (privadas; nunca en la hoja ni en el repo).
const PROP = {
  HOJA_ID: 'CR_HOJA_ID',
  CARPETA_RAIZ_ID: 'CR_CARPETA_RAIZ_ID',
  PUNTERO_ID: 'CR_PUNTERO_ID',
  GITHUB_TOKEN: 'CR_GITHUB_TOKEN',
  ULTIMO_CAMBIO: 'CR_ULTIMO_CAMBIO',
  ULTIMA_PUBLICACION: 'CR_ULTIMA_PUBLICACION',
  PUBLICADO_EN: 'CR_PUBLICADO_EN',
  DOCS_PENDIENTE: 'CR_DOCS_PENDIENTE',
  DOCS_RUN: 'CR_DOCS_RUN',
  DOCS_INTENTOS: 'CR_DOCS_INTENTOS',
  HOJA_LIMPIA: 'CR_HOJA_LIMPIA',
  DOCS_EN_CURSO: 'CR_DOCS_EN_CURSO',
};

const CONFIG_DEFECTO = {
  tienda_nombre: '',
  tienda_eslogan: '',
  logo: '',
  moneda_simbolo: 'S/',
  moneda_codigo: 'PEN',
  pais_codigo: '51',
  zona_horaria: 'America/Lima',
  redondeo: 'ninguno',
  inicio_modo: 'temporada',
  instagram: '',
  facebook: '',
  tiktok: '',
  horario: '',
  envios: '',
  sitio_url: 'https://cayogabriel.github.io/catalogo-ropa/',
  github_repo: 'cayogabriel/catalogo-ropa',
  paleta_defecto: 'neutra-minimal',
  umbral_ultimas_unidades: 3,
  dias_nuevo: 30,
  min_clics_mas_consultados: 3,
  vigencia_dias_defecto: 15,
};
