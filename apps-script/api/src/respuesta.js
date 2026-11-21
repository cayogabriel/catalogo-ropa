// Sobre de respuesta de la API pública: { ok: true, datos } o { ok: false, error }.

function json_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(datos) {
  return json_({ ok: true, datos: datos });
}

function error_(codigo) {
  return json_({ ok: false, error: codigo });
}
