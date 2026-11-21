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
