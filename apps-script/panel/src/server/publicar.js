// publicar(): arma la copia, la valida, la guarda en Drive, actualiza el puntero y avisa a GitHub.
// Ver docs/contracts/api-panel.md · Publicación.

function publicar() {
  requireAdmin_();
  return publicarInterno_(true);
}

function leerDatosParaPublicar_(ahora) {
  const filas = function (e) {
    return leerTabla_(e).filas;
  };
  return {
    config: leerConfig_(),
    productos: filas('productos'),
    categorias: filas('categorias'),
    secciones: filas('secciones'),
    portadas: filas('portadas'),
    ofertas: filas('ofertas'),
    temporadas: filas('temporadas'),
    temporada_fotos: filas('temporada_fotos'),
    paletas: filas('paletas'),
    vendedoras: filas('vendedoras'),
    textos: filas('textos'),
    clics: clicsPorProducto_(ahora, DIAS_CLICS),
  };
}

// La foto debe existir en Drive, fuera de la papelera, y ser una imagen. Devuelve su última modificación (ISO).
function resolverFotoDrive_(id, donde) {
  const archivo = abrirArchivo_(id);
  if (!archivo) fallar_('invalido', 'la foto ' + id + ' de ' + donde + ' ya no está en Drive');
  if (!esImagen_(archivo.getMimeType())) fallar_('invalido', 'la foto ' + id + ' de ' + donde + ' no es una imagen');
  return aIso_(archivo.getLastUpdated());
}

function guardarCopiaPublicada_(catalogo) {
  const puntero = leerPuntero_();
  let archivo = abrirArchivo_(puntero.datos.publicado_id);
  if (!archivo) {
    const carpeta = carpeta_('publicado');
    const it = carpeta.getFilesByName(NOMBRE_PUBLICADO);
    while (it.hasNext() && !archivo) {
      const candidato = it.next();
      if (!candidato.isTrashed()) archivo = candidato;
    }
  }
  const contenido = JSON.stringify(catalogo);
  if (archivo) archivo.setContent(contenido);
  else archivo = carpeta_('publicado').createFile(NOMBRE_PUBLICADO, contenido, 'application/json');
  puntero.datos.publicado_id = archivo.getId();
  puntero.archivo.setContent(JSON.stringify(puntero.datos, null, 2));
  return archivo;
}

// manual: lo pidió la dueña (falta de token = error). Si no, es la publicación automática de la madrugada:
// sin token no hace nada (no podría avisar a GitHub).
function publicarInterno_(manual) {
  return conCandado_(function () {
    const token = tokenGithub_();
    if (!token) {
      if (manual) fallar_('sin_token', 'falta el token de GitHub: créalo y pégalo en Configuración para poder publicar');
      return null;
    }
    const ahora = ahora_();
    const armado = armarCatalogo_(leerDatosParaPublicar_(ahora), ahora, resolverFotoDrive_);
    guardarCopiaPublicada_(armado.catalogo);
    avisarAGithub_(token);
    // Solo si GitHub aceptó el aviso se da por publicado: si falló, «cambios sin publicar» sigue prendido
    // y las prendas nuevas no empiezan a contar su ventana de «Nuevo» sin estar en la web.
    estamparPublicadoEn_(armado.nuevosPublicados, ahora);
    marcarPublicacion_();
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROP.PUBLICADO_EN, String(ahora.getTime()));
    props.setProperty(PROP.DOCS_PENDIENTE, '1');
    props.deleteProperty(PROP.DOCS_INTENTOS);
    return {
      estado: 'en_cola',
      iniciado_en: aIso_(ahora),
      terminado_en: null,
      url_ejecucion: null,
      mensaje: 'Aviso enviado a GitHub, esperando que empiece',
      documentos_guardados: false,
    };
  });
}

// publicado_en se fija la primera vez que se publica la prenda. No sube `version` ni deja historial
// (no es una edición de la dueña: no debe provocar conflictos de autoguardado).
function estamparPublicadoEn_(ids, ahora) {
  if (!ids.length) return;
  const tabla = leerTabla_('productos');
  tabla.filas.forEach(function (p) {
    if (ids.indexOf(p.id) === -1 || p.publicado_en) return;
    p.publicado_en = aIso_(ahora);
    escribirFila_('productos', tabla, p);
  });
}
