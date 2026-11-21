// El puntero `catalogo-ropa.config.json` (lo escribe instalar()): ids de la hoja y de las carpetas, y la copia publicada.

// → { archivo, datos } o falla con no_encontrado si todavía no se instaló.
function leerPuntero_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP.PUNTERO_ID);
  const archivo = abrirArchivo_(id);
  if (!archivo) fallar_('no_encontrado', 'todavía no se instaló el Panel: ejecuta instalar()');
  let datos;
  try {
    datos = JSON.parse(archivo.getBlob().getDataAsString());
  } catch (e) {
    fallar_('no_encontrado', 'el archivo de configuración está dañado: ejecuta instalar()');
  }
  return { archivo: archivo, datos: datos };
}

// Carpeta de Drive por la clave del puntero (fotos, temporadas, portadas, marca, publicado, documentos, …).
function carpeta_(clave) {
  const id = leerPuntero_().datos.carpetas[clave];
  if (!id) fallar_('no_encontrado', 'falta la carpeta «' + clave + '»: ejecuta instalar()');
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    return fallar_('no_encontrado', 'no se encontró la carpeta «' + clave + '» en Drive: ejecuta instalar()');
  }
}

function esImagen_(mime) {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

function aDataUrl_(blob) {
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// Miniatura de Drive como data URL; '' si todavía no está lista (Drive tarda un poco con fotos recién subidas).
function miniaturaDe_(archivo) {
  try {
    const blob = archivo.getThumbnail();
    return blob ? aDataUrl_(blob) : '';
  } catch (e) {
    return '';
  }
}
