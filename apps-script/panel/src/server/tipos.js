// Tipos de columna que esquema.js no cubre (listas y json), prefijos de id y entidades editables.
// Solo literales: ningún archivo lee de otro al cargarse (el orden de carga de Google no es alfabético).

const ENTIDADES = [
  'productos', 'categorias', 'secciones', 'portadas', 'ofertas', 'temporadas', 'temporada_fotos', 'paletas', 'vendedoras',
];

const PREFIJOS_ID = {
  productos: 'prd', categorias: 'cat', secciones: 'sec', portadas: 'por', ofertas: 'ofe', temporadas: 'tem',
  temporada_fotos: 'tfo', paletas: 'pal', vendedoras: 'ven', historial: 'his',
};

// Columnas «lista»: texto separado por comas en la hoja, arreglo en JSON.
const COLUMNAS_LISTA = {
  productos: ['tallas', 'tallas_agotadas', 'colores', 'fotos', 'etiquetas'],
  secciones: ['productos'],
  ofertas: ['objetivos'],
  temporada_fotos: ['productos'],
};

// Columnas «json»: texto JSON en la hoja, objeto en JSON.
const COLUMNAS_JSON = { paletas: ['tokens'] };

// Claves de `config` que se leen como número (todas las demás, como texto).
const CONFIG_NUMERICAS = ['umbral_ultimas_unidades', 'dias_nuevo', 'min_clics_mas_consultados', 'vigencia_dias_defecto'];

// Columnas que maneja el Panel solo; nadie las edita con guardarCampo.
const COLUMNAS_SISTEMA = ['id', 'version', 'creado_en', 'actualizado_en', 'publicado_en'];

const FORMATO_FECHA_HOJA = 'yyyy-mm-dd hh:mm:ss';
const MAX_CELDA = 45000; // Sheets admite 50 000 caracteres por celda
