// instalar(): crea (o completa) la hoja, las carpetas de Drive, la configuración
// por defecto y el puntero que usa la API pública. Se puede repetir sin miedo,
// aunque la vez anterior haya fallado a mitad: cada id se guarda apenas se crea,
// lo que esté en la papelera se restaura y un candado evita dos corridas a la vez.
// Además carga las semillas (paletas y textos de content/) en las pestañas que estén vacías,
// pone casillas en las columnas de sí/no e instala los activadores (sin duplicarlos).

function instalar() {
  requireAdmin_();
  const candado = LockService.getScriptLock();
  candado.waitLock(30000);
  try {
    return instalarConCandado_();
  } finally {
    candado.releaseLock();
  }
}

function instalarConCandado_() {
  const props = PropertiesService.getScriptProperties();
  let nueva = false;
  let restaurado = false;

  let raiz = porId_('carpeta', props.getProperty(PROP.CARPETA_RAIZ_ID));
  if (raiz && raiz.isTrashed()) {
    raiz.setTrashed(false);
    restaurado = true;
  }
  if (!raiz) {
    raiz = DriveApp.createFolder(NOMBRE_CARPETA_RAIZ);
    props.setProperty(PROP.CARPETA_RAIZ_ID, raiz.getId());
    nueva = true;
  }
  const carpetas = asegurarCarpetas_(raiz);

  let archivoHoja = porId_('archivo', props.getProperty(PROP.HOJA_ID));
  if (archivoHoja && archivoHoja.isTrashed()) {
    archivoHoja.setTrashed(false);
    restaurado = true;
  }
  let libro;
  if (archivoHoja) {
    libro = SpreadsheetApp.openById(archivoHoja.getId());
  } else {
    libro = SpreadsheetApp.create(NOMBRE_HOJA);
    props.setProperty(PROP.HOJA_ID, libro.getId());
    nueva = true;
  }
  asegurarDentro_(DriveApp.getFileById(libro.getId()), raiz);
  libro.setSpreadsheetTimeZone(CONFIG_DEFECTO.zona_horaria);
  // La pestaña vacía que trae un libro nuevo se borra una sola vez: la primera instalación completa.
  // (Si la corrida falló a mitad, la siguiente la borra; después nunca se borra nada que no sea del esquema.)
  asegurarPestanas_(libro, !props.getProperty(PROP.HOJA_LIMPIA));
  props.setProperty(PROP.HOJA_LIMPIA, '1');
  asegurarConfig_(libro);
  sembrarSiVacias_();
  asegurarActivadores_();

  const puntero = escribirPuntero_(raiz, libro.getId(), carpetas, props.getProperty(PROP.PUNTERO_ID));
  props.setProperty(PROP.PUNTERO_ID, puntero.getId());
  return {
    hojaId: libro.getId(),
    hojaUrl: libro.getUrl(),
    carpetaRaizId: raiz.getId(),
    nueva: nueva,
    restaurado: restaurado,
  };
}

// Carpeta o archivo por id, o null si no existe (aunque esté en la papelera, lo devuelve).
function porId_(tipo, id) {
  if (!id) return null;
  try {
    return tipo === 'carpeta' ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
  } catch (e) {
    return null;
  }
}

// Archivo por id que existe y NO está en la papelera; si no, null.
function abrirArchivo_(id) {
  const archivo = porId_('archivo', id);
  return archivo && !archivo.isTrashed() ? archivo : null;
}

function asegurarDentro_(archivo, carpeta) {
  const padres = archivo.getParents();
  while (padres.hasNext()) if (padres.next().getId() === carpeta.getId()) return;
  archivo.moveTo(carpeta);
}

function subcarpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  while (it.hasNext()) {
    const carpeta = it.next();
    if (!carpeta.isTrashed()) return carpeta;
  }
  return padre.createFolder(nombre);
}

function asegurarCarpetas_(raiz) {
  const ids = { raiz: raiz.getId() };
  Object.keys(CARPETAS).forEach(function (clave) {
    ids[clave] = CARPETAS[clave].split('/').reduce(subcarpeta_, raiz).getId();
  });
  return ids;
}

function asegurarPestanas_(libro, limpiarDefecto) {
  const nombres = Object.keys(ESQUEMA);
  nombres.forEach(function (nombre, indice) {
    let hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre, indice);
    asegurarEncabezados_(hoja, ESQUEMA[nombre]);
    formatearColumnas_(hoja, nombre);
    ponerCasillas_(hoja, nombre);
    recortarColumnas_(hoja, ESQUEMA[nombre].length);
    hoja.setFrozenRows(1);
  });
  if (!limpiarDefecto) return;
  // Solo las pestañas vacías con el nombre que Google da a las nuevas («Hoja 1», «Sheet1»).
  libro.getSheets().forEach(function (hoja) {
    if (nombres.indexOf(hoja.getName()) === -1 && /^(Hoja|Sheet) ?[0-9]+$/.test(hoja.getName()) && hoja.getLastRow() === 0) {
      libro.deleteSheet(hoja);
    }
  });
}

function asegurarColumnas_(hoja, necesarias) {
  const faltan = necesarias - hoja.getMaxColumns();
  if (faltan > 0) hoja.insertColumnsAfter(hoja.getMaxColumns(), faltan);
}

// Agrega al final (después de la última columna con algo, NO después de la última con encabezado:
// podría haber datos de la dueña en medio) las columnas del esquema que falten.
function asegurarEncabezados_(hoja, columnas) {
  const ultima = hoja.getLastColumn();
  const actuales = ultima > 0 ? hoja.getRange(1, 1, 1, ultima).getValues()[0] : [];
  const presentes = actuales.filter(function (v) {
    return v !== '';
  });
  if (presentes.length === 0) {
    asegurarColumnas_(hoja, columnas.length);
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold');
    return;
  }
  const faltan = columnas.filter(function (c) {
    return presentes.indexOf(c) === -1;
  });
  if (!faltan.length) return;
  const inicio = ultima + 1;
  asegurarColumnas_(hoja, inicio + faltan.length - 1);
  hoja.getRange(1, inicio, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
}

// Texto plano («@») en las columnas de texto (ver TIPOS en esquema.js) y formato legible en las de fecha.
function formatearColumnas_(hoja, nombre) {
  const tipos = TIPOS[nombre] || {};
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  ESQUEMA[nombre].forEach(function (columna) {
    const indice = encabezados.indexOf(columna);
    if (indice === -1) return;
    if (tipos[columna] === 'fecha') hoja.getRange(2, indice + 1, hoja.getMaxRows() - 1, 1).setNumberFormat(FORMATO_FECHA_HOJA);
    else if (!tipos[columna]) hoja.getRange(1, indice + 1, hoja.getMaxRows(), 1).setNumberFormat('@');
  });
}

// Casillas de verificación en las columnas de sí/no, para editar a mano sin escribir TRUE/FALSE.
function ponerCasillas_(hoja, nombre) {
  const tipos = TIPOS[nombre] || {};
  const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  ESQUEMA[nombre].forEach(function (columna) {
    if (tipos[columna] !== 'booleano') return;
    const indice = encabezados.indexOf(columna);
    if (indice === -1) return;
    const regla = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    hoja.getRange(2, indice + 1, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
  });
}

// Una pestaña nueva trae 26 columnas: se dejan solo las usadas (menos celdas en el libro).
function recortarColumnas_(hoja, minimo) {
  const ancho = Math.max(hoja.getLastColumn(), minimo);
  if (hoja.getMaxColumns() > ancho) hoja.deleteColumns(ancho + 1, hoja.getMaxColumns() - ancho);
}

// Paletas y textos de content/ (generados en semillas.js) y las plantillas de WhatsApp, solo si la pestaña está vacía.
function sembrarSiVacias_() {
  const sembrar = function (entidad, filas) {
    const tabla = leerTabla_(entidad);
    if (tabla.filas.length === 0) agregarFilas_(entidad, tabla, filas);
  };
  sembrar('paletas', SEMILLAS.paletas.map(function (p) {
    return Object.assign({}, p, { version: 1 });
  }));
  sembrar('textos', SEMILLAS.textos.map(function (x) {
    return { clave: x.clave, valor: x.valor, version: 1 };
  }));
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
    while (it.hasNext() && !archivo) {
      const candidato = it.next();
      if (!candidato.isTrashed()) archivo = candidato;
    }
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
