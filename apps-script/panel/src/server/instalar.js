// instalar(): crea (o completa) la hoja, las carpetas de Drive, la configuración
// por defecto y el puntero que usa la API pública. Se puede repetir sin miedo.

function instalar() {
  requireAdmin_();
  const props = PropertiesService.getScriptProperties();
  let nueva = false;

  let raiz = abrirCarpeta_(props.getProperty(PROP.CARPETA_RAIZ_ID));
  if (!raiz) {
    raiz = DriveApp.createFolder(NOMBRE_CARPETA_RAIZ);
    nueva = true;
  }
  const carpetas = asegurarCarpetas_(raiz);

  let libro = abrirLibro_(props.getProperty(PROP.HOJA_ID));
  if (!libro) {
    libro = SpreadsheetApp.create(NOMBRE_HOJA);
    DriveApp.getFileById(libro.getId()).moveTo(raiz);
    nueva = true;
  }
  libro.setSpreadsheetTimeZone(CONFIG_DEFECTO.zona_horaria);
  asegurarPestanas_(libro);
  asegurarConfig_(libro);

  const puntero = escribirPuntero_(raiz, libro.getId(), carpetas, props.getProperty(PROP.PUNTERO_ID));
  props.setProperties({
    [PROP.HOJA_ID]: libro.getId(),
    [PROP.CARPETA_RAIZ_ID]: raiz.getId(),
    [PROP.PUNTERO_ID]: puntero.getId(),
  });
  return { hojaId: libro.getId(), hojaUrl: libro.getUrl(), carpetaRaizId: raiz.getId(), nueva: nueva };
}

function abrirCarpeta_(id) {
  if (!id) return null;
  try {
    const carpeta = DriveApp.getFolderById(id);
    return carpeta.isTrashed() ? null : carpeta;
  } catch (e) {
    return null;
  }
}

function abrirArchivo_(id) {
  if (!id) return null;
  try {
    const archivo = DriveApp.getFileById(id);
    return archivo.isTrashed() ? null : archivo;
  } catch (e) {
    return null;
  }
}

function abrirLibro_(id) {
  if (!abrirArchivo_(id)) return null;
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    return null;
  }
}

function subcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function asegurarCarpetas_(raiz) {
  const ids = { raiz: raiz.getId() };
  Object.keys(CARPETAS).forEach(function (clave) {
    const carpeta = CARPETAS[clave].split('/').reduce(subcarpeta_, raiz);
    ids[clave] = carpeta.getId();
  });
  return ids;
}

function asegurarPestanas_(libro) {
  const nombres = Object.keys(ESQUEMA);
  nombres.forEach(function (nombre, indice) {
    let hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre, indice);
    asegurarEncabezados_(hoja, ESQUEMA[nombre]);
    hoja.setFrozenRows(1);
  });
  // Quita la pestaña vacía que trae un libro nuevo («Hoja 1» o «Sheet1»).
  libro.getSheets().forEach(function (hoja) {
    if (nombres.indexOf(hoja.getName()) === -1 && hoja.getLastRow() === 0) libro.deleteSheet(hoja);
  });
}

function asegurarEncabezados_(hoja, columnas) {
  const ancho = Math.max(hoja.getLastColumn(), 1);
  const actuales = hoja.getRange(1, 1, 1, ancho).getValues()[0].filter(function (v) {
    return v !== '';
  });
  if (actuales.length === 0) {
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold');
    return;
  }
  // Agrega al final las columnas que falten, sin tocar las que ya existen.
  const faltan = columnas.filter(function (c) {
    return actuales.indexOf(c) === -1;
  });
  if (faltan.length) hoja.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
}

function asegurarConfig_(libro) {
  const hoja = libro.getSheetByName('config');
  const existentes = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().map(function (f) {
    return f[0];
  }) : [];
  Object.keys(CONFIG_DEFECTO).forEach(function (clave) {
    if (existentes.indexOf(clave) === -1) hoja.appendRow([clave, CONFIG_DEFECTO[clave]]);
  });
}

function escribirPuntero_(raiz, hojaId, carpetas, punteroId) {
  let archivo = abrirArchivo_(punteroId);
  if (!archivo) {
    const it = raiz.getFilesByName(NOMBRE_PUNTERO);
    archivo = it.hasNext() ? it.next() : null;
  }
  let publicadoId = null;
  if (archivo) {
    try {
      publicadoId = JSON.parse(archivo.getBlob().getDataAsString()).publicado_id || null;
    } catch (e) {
      publicadoId = null;
    }
  }
  const contenido = JSON.stringify({ version: 1, hoja_id: hojaId, carpetas: carpetas, publicado_id: publicadoId }, null, 2);
  if (archivo) return archivo.setContent(contenido);
  return raiz.createFile(NOMBRE_PUNTERO, contenido, 'application/json');
}
