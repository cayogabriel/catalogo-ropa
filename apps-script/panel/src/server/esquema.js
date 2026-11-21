// Pestañas y columnas de la hoja, en orden. Contrato: docs/contracts/modelo-datos.md
// (un test comprueba que ambos coinciden).

const ESQUEMA = {
  productos: [
    'id', 'codigo', 'nombre', 'descripcion', 'categoria_id', 'precio_regular', 'stock', 'tallas',
    'tallas_agotadas', 'colores', 'fotos', 'texto_alt', 'etiquetas', 'estado', 'vendedora_id', 'orden',
    'creado_en', 'actualizado_en', 'publicado_en', 'version',
  ],
  categorias: ['id', 'nombre', 'slug', 'prefijo_codigo', 'orden', 'visible', 'foto', 'version'],
  secciones: [
    'id', 'titulo', 'subtitulo', 'tipo', 'parametro', 'productos', 'diseno', 'limite', 'orden', 'visible',
    'temporada_id', 'version',
  ],
  portadas: [
    'id', 'titulo', 'subtitulo', 'boton_texto', 'boton_destino', 'foto_escritorio', 'foto_movil', 'desde',
    'hasta', 'orden', 'activa', 'temporada_id', 'version',
  ],
  ofertas: [
    'id', 'nombre', 'tipo', 'valor', 'alcance', 'objetivos', 'desde', 'hasta', 'prioridad', 'etiqueta',
    'es_liquidacion', 'cuenta_regresiva', 'activa', 'version',
  ],
  temporadas: [
    'id', 'slug', 'nombre', 'titulo', 'subtitulo', 'intro', 'cierre', 'paleta_id', 'foto_portada', 'desde',
    'hasta', 'activa_manual', 'visible_en_web', 'revista', 'vigencia_dias', 'version',
  ],
  temporada_fotos: [
    'id', 'temporada_id', 'orden', 'foto', 'tipo', 'productos', 'texto', 'texto_alt', 'destacada', 'version',
  ],
  paletas: [
    'id', 'nombre', 'temporada', 'uso', 'tokens', 'fuente_titulos', 'fuente_texto', 'radio', 'origen', 'version',
  ],
  vendedoras: ['id', 'nombre', 'whatsapp', 'activa', 'por_defecto', 'version'],
  textos: ['clave', 'valor', 'version'],
  config: ['clave', 'valor'],
  eventos: ['fecha', 'tipo', 'producto_id', 'temporada_id', 'origen', 'pagina', 'sesion'],
  estadisticas_diarias: [
    'fecha', 'producto_id', 'origen', 'vistas', 'whatsapp', 'favoritos', 'compartidos', 'descargas',
  ],
  historial: ['id', 'fecha', 'usuario', 'entidad', 'entidad_id', 'campo', 'antes', 'despues', 'accion'],
};

// Columnas que NO son texto. Todas las demás llevan formato de texto plano («@»),
// para que Sheets no convierta '51' en número, '2026-12-01' en fecha ni '=…' en fórmula.
const TIPOS = {
  productos: {
    precio_regular: 'numero', stock: 'numero', orden: 'numero', creado_en: 'fecha', actualizado_en: 'fecha',
    publicado_en: 'fecha', version: 'numero',
  },
  categorias: { orden: 'numero', visible: 'booleano', version: 'numero' },
  secciones: { limite: 'numero', orden: 'numero', visible: 'booleano', version: 'numero' },
  portadas: { desde: 'fecha', hasta: 'fecha', orden: 'numero', activa: 'booleano', version: 'numero' },
  ofertas: {
    valor: 'numero', desde: 'fecha', hasta: 'fecha', prioridad: 'numero', es_liquidacion: 'booleano',
    cuenta_regresiva: 'booleano', activa: 'booleano', version: 'numero',
  },
  temporadas: {
    desde: 'fecha', hasta: 'fecha', visible_en_web: 'booleano', revista: 'booleano', vigencia_dias: 'numero',
    version: 'numero',
  },
  temporada_fotos: { orden: 'numero', destacada: 'booleano', version: 'numero' },
  paletas: { version: 'numero' },
  vendedoras: { activa: 'booleano', por_defecto: 'booleano', version: 'numero' },
  textos: { version: 'numero' },
  config: {},
  eventos: { fecha: 'fecha' },
  estadisticas_diarias: {
    vistas: 'numero', whatsapp: 'numero', favoritos: 'numero', compartidos: 'numero', descargas: 'numero',
  },
  historial: { fecha: 'fecha' },
};
