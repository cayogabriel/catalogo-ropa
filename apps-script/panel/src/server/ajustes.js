// Arranque del Panel, textos de la web, configuración de la tienda y validación de paletas.

const PATRON_CLAVE_TEXTO = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const MAX_TEXTO = 2000;

function obtenerEstadoInicial() {
  requireAdmin_();
  const config = leerConfig_();
  const textos = {};
  leerTabla_('textos').filas.forEach(function (f) {
    textos[f.clave] = f.valor;
  });
  const conteos = {};
  ENTIDADES.forEach(function (e) {
    conteos[e] = leerTabla_(e).filas.filter(function (f) {
      return !(e === 'productos' && f.estado === 'archivado');
    }).length;
  });
  return {
    usuario: usuarioActual_(),
    config: config,
    textos: textos,
    conteos: conteos,
    publicacion: estadoPublicacionSegura_(),
    cambios_sin_publicar: hayCambiosSinPublicar_(),
    sitio_url: String(config.sitio_url),
  };
}

// ---------------------------------------------------------------- textos

function guardarTexto(clave, valor) {
  requireAdmin_();
  return conCandado_(function () {
    return guardarTextoInterno_(clave, valor, 'editar');
  });
}

function validarClaveTexto_(clave) {
  if (typeof clave !== 'string' || clave.length > 100 || !PATRON_CLAVE_TEXTO.test(clave)) {
    fallar_('invalido', 'la clave «' + clave + '» no es válida: usa minúsculas y puntos, como pagina.componente.elemento');
  }
}

function guardarTextoInterno_(clave, valor, accion) {
  validarClaveTexto_(clave);
  if (valor === null || valor === undefined) valor = '';
  if (typeof valor !== 'string') fallar_('invalido', 'el texto debe ser texto');
  if (valor.length > MAX_TEXTO) fallar_('limite', 'el texto es demasiado largo (máximo ' + MAX_TEXTO + ' caracteres)');
  const tabla = leerTabla_('textos');
  const fila = tabla.filas.filter(function (f) {
    return f.clave === clave;
  })[0];
  if (!fila) {
    agregarFilas_('textos', tabla, [{ clave: clave, valor: valor, version: 1 }]);
    registrarCambios_([{ entidad: 'textos', entidad_id: clave, campo: 'valor', antes: null, despues: valor, accion: accion === 'editar' ? 'crear' : accion }]);
  } else if (fila.valor !== valor) {
    const antes = fila.valor;
    fila.valor = valor;
    fila.version = (fila.version || 0) + 1;
    escribirFila_('textos', tabla, fila);
    registrarCambios_([{ entidad: 'textos', entidad_id: clave, campo: 'valor', antes: antes, despues: valor, accion: accion }]);
  } else {
    return { clave: clave, valor: valor };
  }
  marcarCambio_();
  return { clave: clave, valor: valor };
}

function restaurarTexto_(cambio, antes) {
  if (cambio.accion === 'crear' || antes === null) {
    const tabla = leerTabla_('textos');
    const fila = tabla.filas.filter(function (f) {
      return f.clave === cambio.entidad_id;
    })[0];
    if (!fila) fallar_('no_encontrado', 'ese texto ya no existe');
    eliminarFila_(tabla, fila);
    registrarCambios_([{ entidad: 'textos', entidad_id: cambio.entidad_id, campo: 'valor', antes: fila.valor, despues: null, accion: 'deshacer' }]);
    return null;
  }
  return guardarTextoInterno_(cambio.entidad_id, antes, 'deshacer');
}

// ---------------------------------------------------------------- configuración

function guardarConfig(clave, valor) {
  requireAdmin_();
  return conCandado_(function () {
    return guardarConfigInterno_(clave, valor, 'editar');
  });
}

function usuarioDeRed_(valor) {
  let v = String(valor === null || valor === undefined ? '' : valor).trim();
  const enlace = /^https?:\/\/[^\/]+\/@?([^\/?#]+)/i.exec(v);
  if (enlace) v = enlace[1];
  return v.replace(/^@/, '');
}

// Valida y normaliza el valor de una clave de `config`. Devuelve texto o, para las numéricas, número.
function validarConfig_(clave, valor) {
  const mal = function (detalle) {
    fallar_('invalido', clave + ': ' + detalle);
  };
  if (CONFIG_NUMERICAS.indexOf(clave) !== -1) {
    const n = typeof valor === 'number' ? valor : Number(valor);
    if (valor === '' || valor === null || typeof valor === 'boolean' || !isFinite(n) || Math.floor(n) !== n || n < 0) {
      mal('debe ser un número entero, 0 o mayor');
    }
    if (clave === 'vigencia_dias_defecto' && (n < 1 || n > 365)) mal('debe estar entre 1 y 365 días');
    if (clave === 'min_clics_mas_consultados' && n < 1) mal('debe ser al menos 1');
    return n;
  }
  const texto = String(valor === null || valor === undefined ? '' : valor).trim();
  const largo = function (max) {
    if (texto.length > max) mal('máximo ' + max + ' caracteres');
  };
  switch (clave) {
    case 'tienda_nombre':
      largo(80);
      return texto;
    case 'tienda_eslogan':
      largo(160);
      return texto;
    case 'horario':
      largo(200);
      return texto;
    case 'envios':
      largo(400);
      return texto;
    case 'logo':
      if (texto !== '' && !PATRON_FOTO_ID.test(texto)) mal('no es una foto válida');
      return texto;
    case 'moneda_simbolo':
      if (texto.length < 1 || texto.length > 4) mal('debe tener de 1 a 4 caracteres');
      return texto;
    case 'moneda_codigo':
      if (!/^[A-Z]{3}$/.test(texto)) mal('debe ser un código de 3 letras mayúsculas (PEN)');
      return texto;
    case 'pais_codigo':
      if (!/^[0-9]{1,3}$/.test(texto)) mal('debe ser solo dígitos, sin + (51)');
      return texto;
    case 'zona_horaria':
      if (texto.length < 3 || texto.length > 60) mal('no es una zona horaria válida');
      return texto;
    case 'redondeo':
      if (['ninguno', 'entero', '90'].indexOf(texto) === -1) mal('debe ser ninguno, entero, 90');
      return texto;
    case 'inicio_modo':
      if (['temporada', 'secciones'].indexOf(texto) === -1) mal('debe ser temporada o secciones');
      return texto;
    case 'instagram':
    case 'facebook':
    case 'tiktok': {
      const usuario = usuarioDeRed_(texto);
      if (usuario !== '' && !/^[A-Za-z0-9._]{1,60}$/.test(usuario)) mal('escribe solo el usuario (letras, números, punto y guion bajo)');
      return usuario;
    }
    case 'sitio_url': {
      const url = texto.charAt(texto.length - 1) === '/' ? texto : texto + '/';
      if (!/^https:\/\/[^\s\/]+(\/[^\s]*)?\/$/.test(url)) mal('debe ser una dirección https, como https://mitienda.example.com/');
      return url;
    }
    case 'github_repo':
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(texto)) mal('debe verse así: usuario/repositorio');
      return texto;
    case 'paleta_defecto':
      if (!existeId_({}, 'paletas', texto)) mal('la paleta «' + texto + '» no existe');
      return texto;
  }
  return fallar_('invalido', 'no existe la configuración «' + clave + '»');
}

function guardarConfigInterno_(clave, valor, accion) {
  if (!Object.prototype.hasOwnProperty.call(CONFIG_DEFECTO, clave)) fallar_('invalido', 'no existe la configuración «' + clave + '»');
  const nuevo = validarConfig_(clave, valor);
  const tabla = leerTabla_('config');
  const fila = tabla.filas.filter(function (f) {
    return f.clave === clave;
  })[0];
  const antes = fila ? (CONFIG_NUMERICAS.indexOf(clave) !== -1 ? leerConfig_()[clave] : fila.valor) : null;
  if (fila && String(antes) === String(nuevo)) return { clave: clave, valor: nuevo };
  if (fila) {
    fila.valor = String(nuevo);
    escribirFila_('config', tabla, fila);
  } else {
    agregarFilas_('config', tabla, [{ clave: clave, valor: String(nuevo) }]);
  }
  registrarCambios_([{ entidad: 'config', entidad_id: clave, campo: 'valor', antes: antes, despues: nuevo, accion: accion }]);
  marcarCambio_();
  return { clave: clave, valor: nuevo };
}

function restaurarConfig_(cambio, antes) {
  if (antes === null) fallar_('invalido', 'ese cambio no se puede deshacer');
  return guardarConfigInterno_(cambio.entidad_id, antes, 'deshacer');
}

// ---------------------------------------------------------------- paletas (contraste WCAG)

function luminancia_(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lineal = function (c8) {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lineal((n >> 16) & 255) + 0.7152 * lineal((n >> 8) & 255) + 0.0722 * lineal(n & 255);
}

function contrasteEntre_(a, b) {
  const la = luminancia_(a);
  const lb = luminancia_(b);
  return ((la > lb ? la : lb) + 0.05) / ((la > lb ? lb : la) + 0.05);
}

// Mismas reglas que revisarPaleta de @catalogo/contratos (un test las compara).
function validarPaleta(tokens) {
  requireAdmin_();
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) fallar_('invalido', 'tokens: debe ser un objeto con los colores');
  Object.keys(tokens).forEach(function (t) {
    if (typeof tokens[t] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(tokens[t])) fallar_('invalido', t + ' debe ser un color #RRGGBB');
  });
  const faltantes = TOKENS_CONTRATO.filter(function (t) {
    return !(t in tokens);
  });
  const fallos = [];
  PARES_CONTRASTE.forEach(function (par) {
    if (!(par.a in tokens) || !(par.b in tokens)) return;
    const valor = contrasteEntre_(tokens[par.a], tokens[par.b]);
    if (valor < par.min) fallos.push({ a: par.a, b: par.b, min: par.min, valor: Math.round(valor * 100) / 100 });
  });
  return { ok: faltantes.length === 0 && fallos.length === 0, faltantes: faltantes, fallos: fallos };
}
