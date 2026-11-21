// Documentos en Drive: lista lo que hay y copia las revistas, el catálogo y los JPG del sitio (documentos.json).
// Ver docs/contracts/documentos.md.

const PATRON_RUTA_DOCUMENTO = /^[A-Za-z0-9_.\/-]+$/;

function archivosVivos_(carpeta, nombre) {
  const it = nombre === undefined ? carpeta.getFiles() : carpeta.getFilesByName(nombre);
  const salida = [];
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) salida.push(f);
  }
  return salida;
}

function carpetaVivaPorNombre_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  while (it.hasNext()) {
    const c = it.next();
    if (!c.isTrashed()) return c;
  }
  return null;
}

// El nombre de la temporada se usa como nombre de carpeta: sin barras ni caracteres raros.
function nombreDeCarpeta_(nombre) {
  return String(nombre).replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Temporada';
}

function documentos() {
  requireAdmin_();
  const revistas = [];
  const raizRevistas = carpeta_('revistas');
  leerTabla_('temporadas').filas.forEach(function (t) {
    if (!t.revista) return;
    const carpeta = carpetaVivaPorNombre_(raizRevistas, nombreDeCarpeta_(t.nombre));
    if (!carpeta) return;
    const pdf = archivosVivos_(carpeta, 'revista-' + t.slug + '.pdf')[0];
    if (!pdf) return;
    const carrusel = carpetaVivaPorNombre_(carpeta, 'carrusel');
    revistas.push({
      temporada_id: t.id,
      nombre: t.nombre,
      pdf: { url: pdf.getUrl(), actualizado: aIso_(pdf.getLastUpdated()) },
      carrusel: { url: carrusel ? carrusel.getUrl() : '', cantidad: carrusel ? archivosVivos_(carrusel).length : 0 },
    });
  });
  const catalogoPdf = archivosVivos_(carpeta_('catalogos'), 'catalogo.pdf')[0];
  const archivoReporte = buscarHoja_(carpeta_('reportes'), NOMBRE_REPORTE);
  const reportes = [];
  if (archivoReporte) {
    const libro = SpreadsheetApp.openById(archivoReporte.getId());
    libro.getSheets().forEach(function (h) {
      if (/^\d{4}-\d{2}$/.test(h.getName())) reportes.push({ mes: h.getName(), url: libro.getUrl() + '#gid=' + h.getSheetId() });
    });
    reportes.sort(function (a, b) {
      return a.mes < b.mes ? 1 : -1;
    });
  }
  return {
    revistas: revistas,
    catalogo: catalogoPdf ? { url: catalogoPdf.getUrl(), actualizado: aIso_(catalogoPdf.getLastUpdated()) } : null,
    reportes: reportes,
  };
}

function rutaDeDocumento_(ruta, extension) {
  if (typeof ruta !== 'string' || !PATRON_RUTA_DOCUMENTO.test(ruta) || ruta.charAt(0) === '/' || ruta.indexOf('..') !== -1 || ruta.slice(-extension.length - 1) !== '.' + extension) {
    fallar_('invalido', 'documentos.json trae una ruta que no es válida: ' + String(ruta).slice(0, 80));
  }
  return ruta;
}

function bajarDelSitio_(base, ruta) {
  let respuesta;
  try {
    respuesta = UrlFetchApp.fetch(base + ruta, { muteHttpExceptions: true });
  } catch (e) {
    return fallar_('github', 'no se pudo conectar con el sitio para bajar ' + ruta);
  }
  if (respuesta.getResponseCode() !== 200) fallar_('github', 'el sitio respondió ' + respuesta.getResponseCode() + ' al bajar ' + ruta);
  return respuesta;
}

// Crea la copia nueva y recién entonces manda a la papelera la anterior (si falla la descarga, la anterior se queda).
function copiarArchivo_(carpeta, base, ruta, nombre, mime) {
  const blob = bajarDelSitio_(base, ruta).getBlob().setName(nombre).setContentType(mime);
  const anteriores = archivosVivos_(carpeta, nombre);
  const nuevo = carpeta.createFile(blob);
  anteriores.forEach(function (f) {
    f.setTrashed(true);
  });
  return nuevo;
}

// Copia a Drive lo que lista documentos.json del sitio; solo se guarda la última versión.
// → { guardados: cantidad de archivos }
function guardarDocumentos_() {
  const base = String(leerConfig_().sitio_url);
  let respuesta;
  try {
    respuesta = UrlFetchApp.fetch(base + 'documentos.json?v=' + ahora_().getTime(), { muteHttpExceptions: true });
  } catch (e) {
    return fallar_('github', 'no se pudo conectar con el sitio para leer documentos.json');
  }
  if (respuesta.getResponseCode() === 404) return { guardados: 0 };
  if (respuesta.getResponseCode() !== 200) fallar_('github', 'el sitio respondió ' + respuesta.getResponseCode() + ' al leer documentos.json');
  let manifiesto;
  try {
    manifiesto = JSON.parse(respuesta.getContentText());
  } catch (e) {
    return fallar_('invalido', 'documentos.json no se puede leer');
  }
  // Primero se valida todo el manifiesto: una ruta rara no deja la copia a medias.
  const revistas = (manifiesto.revistas || []).map(function (r) {
    return {
      temporada_id: r.temporada_id,
      slug: r.slug,
      pdf: rutaDeDocumento_(r.pdf, 'pdf'),
      carrusel: (r.carrusel || []).map(function (ruta) {
        return rutaDeDocumento_(ruta, 'jpg');
      }),
    };
  });
  const catalogo = manifiesto.catalogo && manifiesto.catalogo.pdf ? rutaDeDocumento_(manifiesto.catalogo.pdf, 'pdf') : null;

  const temporadas = {};
  leerTabla_('temporadas').filas.forEach(function (t) {
    temporadas[t.id] = t;
  });
  let guardados = 0;
  revistas.forEach(function (r) {
    const t = temporadas[r.temporada_id];
    const carpetaTemporada = subcarpeta_(carpeta_('revistas'), nombreDeCarpeta_(t ? t.nombre : r.slug));
    copiarArchivo_(carpetaTemporada, base, r.pdf, r.pdf.split('/').pop(), 'application/pdf');
    guardados++;
    if (r.carrusel.length) {
      const carpetaCarrusel = subcarpeta_(carpetaTemporada, 'carrusel');
      const nombres = r.carrusel.map(function (ruta) {
        return ruta.split('/').pop();
      });
      r.carrusel.forEach(function (ruta, i) {
        copiarArchivo_(carpetaCarrusel, base, ruta, nombres[i], 'image/jpeg');
        guardados++;
      });
      // Si la revista ahora tiene menos páginas, las sobrantes de antes también van a la papelera.
      archivosVivos_(carpetaCarrusel).forEach(function (f) {
        if (nombres.indexOf(f.getName()) === -1) f.setTrashed(true);
      });
    }
  });
  if (catalogo) {
    copiarArchivo_(carpeta_('catalogos'), base, catalogo, 'catalogo.pdf', 'application/pdf');
    guardados++;
  }
  return { guardados: guardados };
}
