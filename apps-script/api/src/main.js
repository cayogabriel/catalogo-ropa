// API pública del catálogo. Contrato: docs/contracts/api-publica.md
// Solo lectura: catálogo publicado y fotos publicadas. Los eventos (doPost) los completa S2.

function doGet(e) {
  const ruta = (e && e.parameter && e.parameter.r) || '';
  if (ruta !== 'catalogo' && ruta !== 'foto') return error_('ruta_desconocida');

  const config = config_(ruta === 'catalogo');
  if (!config) return error_('sin_instalacion');
  const publicado = leerPublicado_(config);
  if (!publicado) return error_('sin_publicacion');

  if (ruta === 'catalogo') return ok_(publicado);
  return foto_(publicado, e.parameter.id);
}

// Lista blanca: solo se abre en Drive un id que figura en la copia publicada,
// y solo se entrega si es una imagen (nunca un documento convertido a PDF).
// Devuelve los bytes tal como están guardados: el Panel solo guarda imágenes
// re-codificadas en el navegador, sin EXIF (ver api-panel.md, subirFoto).
function foto_(publicado, id) {
  const indice = publicado.fotos || {};
  if (!id || !Object.prototype.hasOwnProperty.call(indice, id)) return error_('foto_no_publicada');
  const archivo = abrirArchivo_(id);
  if (!archivo || TIPOS_FOTO.indexOf(archivo.getMimeType()) === -1) return error_('foto_no_disponible');
  if (archivo.getSize() > MAX_BYTES_FOTO) return error_('foto_muy_grande');
  const blob = archivo.getBlob();
  return ok_({ mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) });
}

function doPost(e) {
  return error_('no_implementado');
}

// Ejecutarla una vez desde el editor hace que Google pida los permisos del manifiesto.
function autorizar() {
  return 'ok';
}
