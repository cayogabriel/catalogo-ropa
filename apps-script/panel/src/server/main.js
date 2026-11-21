// Entrada web del Panel. La interfaz vive en ui/ (de S4).

function doGet(e) {
  try {
    requireAdmin_();
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Acceso restringido</title>' +
        '<p style="font-family:sans-serif;padding:2rem">Acceso restringido. Este panel es solo para la administradora del catálogo.</p></html>',
    ).setTitle('Acceso restringido');
  }
  return HtmlService.createTemplateFromFile('ui/index')
    .evaluate()
    .setTitle('Panel · Catálogo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Para las plantillas: <?!= include('ui/estilos') ?>
function include(ruta) {
  return HtmlService.createHtmlOutputFromFile(ruta).getContent();
}

// Ejecutarla una vez desde el editor hace que Google pida los permisos del manifiesto.
function autorizar() {
  return 'ok';
}
