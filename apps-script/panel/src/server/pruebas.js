// publicarPrueba(): prueba de punta a punta con Google real (S1).
// Toma el catálogo de ejemplo del repo, sube 3 fotos de ejemplo a Drive/Fotos,
// reemplaza todos los ids de foto por esas 3 y guarda la copia publicada que
// sirve la API. Se puede repetir: reutiliza las fotos y la copia.
// S2 la reemplaza por publicar() real; puede borrarla cuando ya no sirva.

const RAW_FIXTURES = 'https://raw.githubusercontent.com/cayogabriel/catalogo-ropa/main/fixtures/';
const ISO_LIMA = "yyyy-MM-dd'T'HH:mm:ssXXX";

function publicarPrueba() {
  requireAdmin_();
  const props = PropertiesService.getScriptProperties();
  const puntero = abrirArchivo_(props.getProperty(PROP.PUNTERO_ID));
  if (!puntero) throw new Error('invalido: primero ejecuta instalar()');
  const config = JSON.parse(puntero.getBlob().getDataAsString());

  const catalogo = JSON.parse(descargar_(RAW_FIXTURES + 'catalogo.ejemplo.json').getContentText());
  const originales = Object.keys(catalogo.fotos).sort();
  const reales = originales.slice(0, 3).map(function (id, i) {
    return subirFotoDePrueba_(DriveApp.getFolderById(config.carpetas.fotos), 'prueba-' + (i + 1) + '.jpg', id);
  });

  // Cada id de ejemplo pasa a una de las 3 fotos reales, en rueda.
  const mapa = {};
  originales.forEach(function (id, i) {
    mapa[id] = reales[i % reales.length];
  });
  const texto = JSON.stringify(catalogo).replace(/"(fx_[0-9a-f]{8})"/g, function (todo, id) {
    return JSON.stringify(mapa[id] || id);
  });
  const publicado = JSON.parse(texto);
  publicado.generado_en = Utilities.formatDate(new Date(), 'America/Lima', ISO_LIMA);
  // Contrato: «actualizado» es la última modificación del archivo en Drive (clave de la caché de fotos).
  publicado.fotos = {};
  reales.forEach(function (id) {
    publicado.fotos[id] = { actualizado: Utilities.formatDate(DriveApp.getFileById(id).getLastUpdated(), 'America/Lima', ISO_LIMA) };
  });

  const contenido = JSON.stringify(publicado);
  let archivo = abrirArchivo_(config.publicado_id);
  if (archivo) archivo.setContent(contenido);
  else archivo = DriveApp.getFolderById(config.carpetas.publicado).createFile(NOMBRE_PUBLICADO, contenido, 'application/json');

  config.publicado_id = archivo.getId();
  puntero.setContent(JSON.stringify(config, null, 2));
  return { productos: publicado.productos.length, fotos: reales.length, archivoId: archivo.getId() };
}

function descargar_(url) {
  const respuesta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (respuesta.getResponseCode() !== 200) {
    throw new Error('github: no se pudo descargar ' + url + ' (HTTP ' + respuesta.getResponseCode() + ')');
  }
  return respuesta;
}

function subirFotoDePrueba_(carpeta, nombre, idEjemplo) {
  const existentes = carpeta.getFilesByName(nombre);
  while (existentes.hasNext()) {
    const archivo = existentes.next();
    if (!archivo.isTrashed()) return archivo.getId();
  }
  const blob = descargar_(RAW_FIXTURES + 'img/' + idEjemplo + '.jpg').getBlob().setName(nombre);
  return carpeta.createFile(blob).getId();
}
