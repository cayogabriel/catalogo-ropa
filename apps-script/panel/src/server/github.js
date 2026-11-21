// Conexión con GitHub: token, aviso de publicación y estado de la ejecución.
// El token vive en las propiedades del script (CR_GITHUB_TOKEN): nunca se devuelve, ni se escribe en la hoja,
// ni aparece en un mensaje de error.

const URL_API_GITHUB = 'https://api.github.com';
const PATRON_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ESPERA_INICIO_RUN_MS = 5 * 60 * 1000;

function tokenGithub_() {
  return PropertiesService.getScriptProperties().getProperty(PROP.GITHUB_TOKEN) || '';
}

function repoGithub_() {
  const repo = String(leerConfig_().github_repo || '');
  if (!PATRON_REPO.test(repo)) fallar_('invalido', 'github_repo no es válido: debe verse así: usuario/repositorio');
  return repo;
}

// → { codigo, datos } (datos = JSON de la respuesta o null). Nunca incluye el token en un error.
function llamarGithub_(metodo, ruta, token, cuerpo) {
  const opciones = {
    method: metodo,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
  if (cuerpo !== undefined) {
    opciones.contentType = 'application/json';
    opciones.payload = JSON.stringify(cuerpo);
  }
  let respuesta;
  try {
    respuesta = UrlFetchApp.fetch(URL_API_GITHUB + ruta, opciones);
  } catch (e) {
    return fallar_('github', 'no se pudo conectar con GitHub; revisa tu conexión e inténtalo de nuevo');
  }
  const codigo = respuesta.getResponseCode();
  let datos = null;
  try {
    datos = JSON.parse(respuesta.getContentText());
  } catch (e) {
    datos = null;
  }
  return { codigo: codigo, datos: datos };
}

function mensajeDeCodigoGithub_(codigo, repo) {
  if (codigo === 401) return 'GitHub no aceptó el token: puede estar mal copiado o haber vencido';
  if (codigo === 403) return 'el token no tiene permiso para esta acción en ' + repo;
  if (codigo === 404) return 'no se encontró ' + repo + ' o el token no tiene acceso a ese repositorio';
  if (codigo === 422) return 'GitHub rechazó el aviso (código 422)';
  return 'GitHub respondió con el código ' + codigo;
}

function guardarTokenGithub(token) {
  requireAdmin_();
  if (typeof token !== 'string' || !/^[A-Za-z0-9_\-]{20,255}$/.test(token.trim())) {
    fallar_('invalido', 'el token no tiene el formato de un token de GitHub (letras, números y guiones, sin espacios)');
  }
  const limpio = token.trim();
  const repo = repoGithub_();
  const r = llamarGithub_('get', '/repos/' + repo, limpio);
  if (r.codigo !== 200) fallar_('github', mensajeDeCodigoGithub_(r.codigo, repo));
  if (r.datos && r.datos.permissions && r.datos.permissions.push === false) {
    fallar_('github', 'el token solo puede leer ' + repo + ': necesita el permiso «Contents: write»');
  }
  PropertiesService.getScriptProperties().setProperty(PROP.GITHUB_TOKEN, limpio);
  return { ok: true, repo: repo };
}

function estadoTokenGithub() {
  requireAdmin_();
  return { configurado: Boolean(tokenGithub_()), repo: String(leerConfig_().github_repo) };
}

// repository_dispatch: responde 204 sin cuerpo.
function avisarAGithub_(token) {
  const repo = repoGithub_();
  const r = llamarGithub_('post', '/repos/' + repo + '/dispatches', token, { event_type: 'publicar' });
  if (r.codigo !== 204) fallar_('github', mensajeDeCodigoGithub_(r.codigo, repo));
}

const ESTADO_VACIO_PUBLICACION = { estado: 'nunca', iniciado_en: null, terminado_en: null, url_ejecucion: null, mensaje: '', documentos_guardados: false };

function estadoPublicacion() {
  requireAdmin_();
  return calcularEstadoPublicacion_(true);
}

// Para el arranque: nunca lanza (un fallo de red no debe impedir abrir el Panel).
function estadoPublicacionSegura_() {
  try {
    return calcularEstadoPublicacion_(false);
  } catch (e) {
    return Object.assign({}, ESTADO_VACIO_PUBLICACION, { estado: 'error', mensaje: String(e.message || e).replace(/^[a-z_]+: /, '') });
  }
}

// conDocumentos: si la ejecución terminó bien y faltan las copias a Drive, las hace ahora.
function calcularEstadoPublicacion_(conDocumentos) {
  const props = PropertiesService.getScriptProperties();
  const enviadoMs = Number(props.getProperty(PROP.PUBLICADO_EN) || 0);
  const base = Object.assign({}, ESTADO_VACIO_PUBLICACION);
  const token = tokenGithub_();
  if (!token) {
    base.estado = enviadoMs ? 'publicado' : 'nunca';
    base.mensaje = 'Falta el token de GitHub: pégalo en Configuración';
    return base;
  }
  const repo = repoGithub_();
  const r = llamarGithub_('get', '/repos/' + repo + '/actions/runs?event=repository_dispatch&per_page=1', token);
  if (r.codigo !== 200) fallar_('github', mensajeDeCodigoGithub_(r.codigo, repo));
  const runs = (r.datos && r.datos.workflow_runs) || [];
  const run = runs[0] || null;
  const ahoraMs = ahora_().getTime();

  // Todavía no aparece la ejecución de nuestro último aviso (GitHub tarda unos segundos en crearla).
  if (!run || (enviadoMs && Date.parse(run.created_at) < enviadoMs - 60000)) {
    if (!enviadoMs) return base;
    base.iniciado_en = aIso_(new Date(enviadoMs));
    if (ahoraMs - enviadoMs < ESPERA_INICIO_RUN_MS) {
      base.estado = 'en_cola';
      base.mensaje = 'Aviso enviado a GitHub, esperando que empiece';
    } else {
      base.estado = 'error';
      base.mensaje = 'GitHub no inició la publicación. Revisa el token y vuelve a publicar';
    }
    return base;
  }

  base.iniciado_en = aIso_(new Date(Date.parse(run.run_started_at || run.created_at)));
  base.url_ejecucion = typeof run.html_url === 'string' && run.html_url.indexOf('https://github.com/') === 0 ? run.html_url : null;
  if (run.status !== 'completed') {
    base.estado = run.status === 'in_progress' ? 'publicando' : 'en_cola';
    base.mensaje = base.estado === 'publicando' ? 'Publicando…' : 'En cola en GitHub';
    return base;
  }
  base.terminado_en = aIso_(new Date(Date.parse(run.updated_at)));
  if (run.conclusion !== 'success') {
    base.estado = 'error';
    base.mensaje = 'La publicación terminó con error (' + run.conclusion + '). Revisa la ejecución en GitHub';
    if (props.getProperty(PROP.DOCS_PENDIENTE)) props.deleteProperty(PROP.DOCS_PENDIENTE);
    return base;
  }
  base.estado = 'publicado';
  const corrida = String(run.id);
  base.documentos_guardados = props.getProperty(PROP.DOCS_RUN) === corrida;
  base.mensaje = 'Publicado';
  if (!base.documentos_guardados && conDocumentos && props.getProperty(PROP.DOCS_PENDIENTE)) {
    try {
      guardarDocumentos_();
      props.setProperty(PROP.DOCS_RUN, corrida);
      props.deleteProperty(PROP.DOCS_PENDIENTE);
      props.deleteProperty(PROP.DOCS_INTENTOS);
      base.documentos_guardados = true;
    } catch (e) {
      const intentos = Number(props.getProperty(PROP.DOCS_INTENTOS) || 0) + 1;
      props.setProperty(PROP.DOCS_INTENTOS, String(intentos));
      if (intentos >= 3) props.deleteProperty(PROP.DOCS_PENDIENTE);
      base.mensaje = 'Publicado, pero no se pudieron copiar los documentos a Drive: ' + String(e.message || e).replace(/^[a-z_]+: /, '');
      return base;
    }
  }
  if (base.documentos_guardados) base.mensaje = 'Publicado y documentos guardados en Drive';
  return base;
}
