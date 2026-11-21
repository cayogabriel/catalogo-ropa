// Capa de datos sobre Sheets: filas con sus tipos según ESQUEMA, TIPOS, COLUMNAS_LISTA y COLUMNAS_JSON.
// Lee por NOMBRE de encabezado (tolera columnas reordenadas o agregadas a mano) y mantiene el
// formato de texto «@» en las columnas de texto para que Sheets no convierta nada.

const ESTADO_LIBRO = { id: null, libro: null };

function libro_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP.HOJA_ID);
  if (!id) fallar_('no_encontrado', 'todavía no se instaló la hoja: ejecuta instalar()');
  if (ESTADO_LIBRO.id !== id) {
    try {
      ESTADO_LIBRO.libro = SpreadsheetApp.openById(id);
    } catch (e) {
      fallar_('no_encontrado', 'no se pudo abrir la hoja de datos; ejecuta instalar()');
    }
    ESTADO_LIBRO.id = id;
  }
  return ESTADO_LIBRO.libro;
}

// 'texto' | 'numero' | 'booleano' | 'fecha' | 'lista' | 'json'
function tipoColumna_(entidad, columna) {
  const tipos = TIPOS[entidad] || {};
  if (tipos[columna]) return tipos[columna];
  if ((COLUMNAS_LISTA[entidad] || []).indexOf(columna) !== -1) return 'lista';
  if ((COLUMNAS_JSON[entidad] || []).indexOf(columna) !== -1) return 'json';
  return 'texto';
}

function desdeCelda_(tipo, valor) {
  const vacio = valor === '' || valor === null || valor === undefined;
  switch (tipo) {
    case 'numero': {
      if (vacio) return null;
      const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
      return isFinite(n) ? n : null;
    }
    case 'booleano':
      if (typeof valor === 'boolean') return valor;
      return /^(true|verdadero|si|sí|1)$/i.test(String(valor).trim());
    case 'fecha': {
      if (vacio) return null;
      const d = valor instanceof Date || typeof valor.getTime === 'function' ? valor : deIso_(valor);
      return d && !isNaN(d.getTime()) ? aIso_(d) : null;
    }
    case 'lista':
      if (vacio) return [];
      return String(valor).split(',').map(function (x) {
        return x.trim();
      }).filter(function (x) {
        return x !== '';
      });
    case 'json':
      if (vacio) return {};
      try {
        return JSON.parse(String(valor));
      } catch (e) {
        return {};
      }
    default:
      return vacio ? '' : String(valor);
  }
}

function haciaCelda_(tipo, valor) {
  switch (tipo) {
    case 'numero':
      return valor === null || valor === undefined || valor === '' ? '' : Number(valor);
    case 'booleano':
      return Boolean(valor);
    case 'fecha': {
      const d = typeof valor === 'string' ? deIso_(valor) : valor;
      return d ? d : '';
    }
    case 'lista':
      return (valor || []).join(',');
    case 'json':
      return JSON.stringify(valor === undefined ? {} : valor);
    default:
      return valor === null || valor === undefined ? '' : String(valor);
  }
}

// → { hoja, entidad, encabezados, indices: {columna: posición}, filas: [Fila + _n (número de fila en la hoja) + _crudo] }
function leerTabla_(entidad) {
  const columnas = ESQUEMA[entidad];
  if (!columnas) fallar_('invalido', 'entidad desconocida: ' + entidad);
  const hoja = libro_().getSheetByName(entidad);
  if (!hoja) fallar_('no_encontrado', 'falta la pestaña «' + entidad + '»; ejecuta instalar()');
  const ancho = hoja.getLastColumn();
  if (ancho < 1) fallar_('no_encontrado', 'la pestaña «' + entidad + '» no tiene encabezados; ejecuta instalar()');
  const encabezados = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  const indices = {};
  encabezados.forEach(function (nombre, i) {
    if (nombre !== '') indices[nombre] = i;
  });
  columnas.forEach(function (c) {
    if (!(c in indices)) fallar_('invalido', 'a la pestaña «' + entidad + '» le falta la columna «' + c + '»; ejecuta instalar()');
  });
  const ultima = hoja.getLastRow();
  const filas = [];
  if (ultima >= 2) {
    const valores = hoja.getRange(2, 1, ultima - 1, ancho).getValues();
    const clave = columnas[0];
    valores.forEach(function (crudo, i) {
      if (crudo[indices[clave]] === '' || crudo[indices[clave]] === null) return; // fila vacía
      const fila = { _n: i + 2, _crudo: crudo };
      columnas.forEach(function (c) {
        fila[c] = desdeCelda_(tipoColumna_(entidad, c), crudo[indices[c]]);
      });
      filas.push(fila);
    });
  }
  return { hoja: hoja, entidad: entidad, encabezados: encabezados, indices: indices, filas: filas };
}

// Quita lo interno (_n, _crudo) para devolver al navegador.
function limpiarFila_(fila) {
  const salida = {};
  Object.keys(fila).forEach(function (k) {
    if (k.charAt(0) !== '_') salida[k] = fila[k];
  });
  return salida;
}

function valoresDeFila_(entidad, tabla, fila) {
  const valores = (fila._crudo || []).slice();
  while (valores.length < tabla.encabezados.length) valores.push('');
  ESQUEMA[entidad].forEach(function (c) {
    const texto = haciaCelda_(tipoColumna_(entidad, c), fila[c]);
    if (typeof texto === 'string' && texto.length > MAX_CELDA) fallar_('limite', 'el valor de «' + c + '» es demasiado largo');
    valores[tabla.indices[c]] = texto;
  });
  return valores;
}

function formatosDeFila_(entidad, tabla) {
  return tabla.encabezados.map(function (nombre) {
    if (nombre === '' || !(nombre in tabla.indices) || ESQUEMA[entidad].indexOf(nombre) === -1) return 'General';
    const tipo = tipoColumna_(entidad, nombre);
    if (tipo === 'fecha') return FORMATO_FECHA_HOJA;
    return tipo === 'texto' || tipo === 'lista' || tipo === 'json' ? '@' : 'General';
  });
}

// Reescribe la fila existente de `fila._n`. Conserva las columnas desconocidas tal cual.
function escribirFila_(entidad, tabla, fila) {
  const valores = valoresDeFila_(entidad, tabla, fila);
  tabla.hoja.getRange(fila._n, 1, 1, tabla.encabezados.length).setValues([valores]);
  fila._crudo = valores;
}

// Agrega filas al final, con el formato correcto (texto «@» en las columnas de texto).
function agregarFilas_(entidad, tabla, filas) {
  if (!filas.length) return;
  const inicio = Math.max(tabla.hoja.getLastRow(), 1) + 1;
  const fin = inicio + filas.length - 1;
  if (fin > tabla.hoja.getMaxRows()) tabla.hoja.insertRowsAfter(tabla.hoja.getMaxRows(), fin - tabla.hoja.getMaxRows());
  const formato = formatosDeFila_(entidad, tabla);
  const rango = tabla.hoja.getRange(inicio, 1, filas.length, tabla.encabezados.length);
  rango.setNumberFormats(filas.map(function () {
    return formato;
  }));
  rango.setValues(filas.map(function (f) {
    return valoresDeFila_(entidad, tabla, f);
  }));
  filas.forEach(function (f, i) {
    f._n = inicio + i;
    f._crudo = valoresDeFila_(entidad, tabla, f);
    tabla.filas.push(f);
  });
}

function eliminarFila_(tabla, fila) {
  tabla.hoja.deleteRow(fila._n);
  tabla.filas.splice(tabla.filas.indexOf(fila), 1);
  tabla.filas.forEach(function (f) {
    if (f._n > fila._n) f._n -= 1;
  });
}

// `config` como objeto {clave: valor}: texto, salvo las claves numéricas (CONFIG_NUMERICAS).
function leerConfig_() {
  const config = {};
  leerTabla_('config').filas.forEach(function (f) {
    config[f.clave] = f.valor;
  });
  CONFIG_NUMERICAS.forEach(function (k) {
    const n = Number(config[k]);
    config[k] = config[k] === undefined || config[k] === '' || !isFinite(n) ? CONFIG_DEFECTO[k] : n;
  });
  return config;
}
