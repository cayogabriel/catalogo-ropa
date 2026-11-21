// Archivo GAS de prueba para el cargador: usa la constante de a.js y un servicio de Google.
function saludar() {
  return SALUDO;
}

function quien() {
  return Session.getActiveUser().getEmail();
}
