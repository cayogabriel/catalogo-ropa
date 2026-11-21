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

// Para las plantillas: <?!= include_('ui/estilos') ?>
// Termina en _ (privada): una función pública no puede llamarse desde el navegador sin
// requireAdmin_(), y las plantillas la usan en el servidor, donde el guion bajo no estorba.
function include_(ruta) {
  return HtmlService.createHtmlOutputFromFile(ruta).getContent();
}

// Ejecutarla una vez desde el editor hace que Google pida los permisos del manifiesto.
// EXCEPCIÓN documentada: no llama a requireAdmin_() porque no lee ni cambia nada, y la
// persona que la corre desde el editor es la dueña (la convención se vigila en
// test/panel/convenciones.test.mjs).
function autorizar() {
  return 'ok';
}
