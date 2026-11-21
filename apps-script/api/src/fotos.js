// ?r=foto&id=… : entrega una foto SOLO si figura en la copia publicada y es una imagen.
// Toda esta lógica vive aquí (y en datos.js) para poder cambiarla al plan B del diseño
// (copia compartida por enlace) sin tocar el resto de la API.
// Devuelve los bytes tal como están guardados: el Panel solo guarda imágenes sin EXIF (ver subirFoto).

const SEGUNDOS_CACHE_FOTOS = 600;

// Ids de las fotos de la copia publicada, o null si no hay copia. El índice se guarda en la caché con
// una clave que incluye la última modificación del archivo: una publicación nueva lo invalida sola.
function idsPublicados_(config) {
  const archivo = abrirArchivo_(config.publicado_id);
  if (!archivo) return null;
  const clave = 'fotos_' + archivo.getId() + '_' + archivo.getLastUpdated().getTime();
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(clave);
  if (guardado) {
    try {
      return JSON.parse(guardado);
    } catch (e) {
      // caché dañada: se vuelve a leer
    }
  }
  const publicado = leerJson_(archivo);
  const ids = Object.keys((publicado && publicado.fotos) || {});
  try {
    cache.put(clave, JSON.stringify(ids), SEGUNDOS_CACHE_FOTOS);
  } catch (e) {
    // índice demasiado grande para la caché: se sigue leyendo del archivo
  }
  return ids;
}

function foto_(config, id) {
  const ids = idsPublicados_(config);
  if (!ids) return error_('sin_publicacion');
  // Lista blanca: solo se abre en Drive un id que figura en la copia publicada.
  if (typeof id !== 'string' || ids.indexOf(id) === -1) return error_('foto_no_publicada');
  const archivo = abrirArchivo_(id);
  if (!archivo || TIPOS_FOTO.indexOf(archivo.getMimeType()) === -1) return error_('foto_no_disponible');
  if (archivo.getSize() > MAX_BYTES_FOTO) return error_('foto_muy_grande');
  const blob = archivo.getBlob();
  return ok_({ mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) });
}
