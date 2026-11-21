// Activadores programados. Un activador corre SIN persona delante (no hay usuario activo), así que estas
// funciones no pueden pedir requireAdmin_(). Por eso son envoltorios públicos con un único trabajo, seguro
// e idempotente y sin datos de entrada; lo que hacen está en helpers privados (diario_, guardarDocumentos_,
// reporteMensual_). Los nombres públicos evitan depender de que Google acepte activadores sobre funciones
// con guion bajo. El único usuario posible es la dueña (el Panel es «solo yo»).

const DEFINICION_ACTIVADORES = [
  { funcion: 'tareaDiaria', tipo: 'diario' },
  { funcion: 'tareaDocumentos', tipo: 'cada_hora' },
  { funcion: 'tareaReporteMensual', tipo: 'mensual' },
];

function tareaDiaria() {
  diario_();
}

function tareaDocumentos() {
  tareaDocumentos_();
}

function tareaReporteMensual() {
  reporteMensual_();
}

// Solo hace algo si hay una publicación esperando sus documentos; si no, no llama a GitHub.
function tareaDocumentos_() {
  if (!PropertiesService.getScriptProperties().getProperty(PROP.DOCS_PENDIENTE) || !tokenGithub_()) return;
  calcularEstadoPublicacion_(true);
}

// Deja exactamente un activador de cada tipo (repetir instalar() no los duplica).
function asegurarActivadores_() {
  const existentes = ScriptApp.getProjectTriggers();
  DEFINICION_ACTIVADORES.forEach(function (def) {
    const propios = existentes.filter(function (t) {
      return t.getHandlerFunction() === def.funcion;
    });
    propios.slice(1).forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
    if (propios.length) return;
    const reloj = ScriptApp.newTrigger(def.funcion).timeBased();
    if (def.tipo === 'diario') reloj.everyDays(1).atHour(0).create(); // entre 00:00 y 01:00, hora de Lima
    else if (def.tipo === 'cada_hora') reloj.everyHours(1).create();
    else reloj.onMonthDay(1).atHour(2).create();
  });
}
