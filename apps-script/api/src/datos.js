// Lectura de la configuración y de la copia publicada. Este proyecto no tiene
// ids escritos: encuentra el puntero por nombre y recuerda su id.
// Solo cuenta un puntero PROPIO y fuera de la papelera: un archivo con el mismo
// nombre compartido por otra cuenta nunca puede cambiar lo que sirve la API.

const NOMBRE_PUNTERO = 'catalogo-ropa.config.json';
const PROP_PUNTERO = 'CR_PUNTERO_ID';
const MAX_BYTES_FOTO = 8 * 1024 * 1024;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

function abrirArchivo_(id) {
  if (!id) return null;
  try {
    const archivo = DriveApp.getFileById(id);
    return archivo.isTrashed() ? null : archivo;
  } catch (e) {
    return null;
  }
}

function leerJson_(archivo) {
  return JSON.parse(archivo.getBlob().getDataAsString());
}

// Si hay varios punteros propios (p. ej. una carpeta copiada), gana el modificado más recientemente.
function punteroMasReciente_() {
  const it = DriveApp.searchFiles('title = "' + NOMBRE_PUNTERO + '" and "me" in owners and trashed = false');
  let elegido = null;
  while (it.hasNext()) {
    const archivo = it.next();
    if (!elegido || archivo.getLastUpdated().getTime() > elegido.getLastUpdated().getTime()) elegido = archivo;
  }
  return elegido;
}

// buscarDeNuevo: true en ?r=catalogo (una búsqueda por publicación, así una
// reinstalación se nota enseguida); false en ?r=foto (usa el puntero ya encontrado).
function config_(buscarDeNuevo) {
  const props = PropertiesService.getScriptProperties();
  let archivo = buscarDeNuevo ? null : abrirArchivo_(props.getProperty(PROP_PUNTERO));
  if (!archivo) {
    archivo = punteroMasReciente_();
    if (!archivo) return null;
    props.setProperty(PROP_PUNTERO, archivo.getId());
  }
  return leerJson_(archivo);
}

function leerPublicado_(config) {
  const archivo = abrirArchivo_(config.publicado_id);
  return archivo ? leerJson_(archivo) : null;
}
