// Estadísticas anónimas: eventos → estadisticas_diarias, resumen del Panel y reporte mensual en Drive.
// La API pública agrega las filas de `eventos`; aquí se consolidan, se podan y se leen.

const DIAS_RETENCION_EVENTOS = 35;
const COLUMNA_DE_TIPO = { vista: 'vistas', whatsapp: 'whatsapp', favorito: 'favoritos', compartir: 'compartidos', revista_descarga: 'descargas' };
const COLUMNAS_CONTADOR = ['vistas', 'whatsapp', 'favoritos', 'compartidos', 'descargas'];
const NOMBRE_REPORTE = 'Reporte de consultas';
const FILAS_DE_SOBRA = 200;

function contadoresVacios_() {
  return { vistas: 0, whatsapp: 0, favoritos: 0, compartidos: 0, descargas: 0 };
}

function sumarContadores_(destino, origen) {
  COLUMNAS_CONTADOR.forEach(function (c) {
    destino[c] += origen[c] || 0;
  });
}

// Agrupa eventos por (día de Lima, prenda, origen). → [{ fecha, producto_id, origen, vistas, … }]
function agruparEventos_(eventos) {
  const grupos = {};
  const orden = [];
  eventos.forEach(function (e) {
    const columna = COLUMNA_DE_TIPO[e.tipo];
    if (!e.fecha || !columna) return;
    const fecha = e.fecha.slice(0, 10);
    const clave = fecha + '|' + e.producto_id + '|' + e.origen;
    if (!grupos[clave]) {
      grupos[clave] = Object.assign({ fecha: fecha, producto_id: e.producto_id, origen: e.origen }, contadoresVacios_());
      orden.push(clave);
    }
    grupos[clave][columna] += 1;
  });
  return orden.map(function (k) {
    return grupos[k];
  });
}

// Filas por día/prenda/origen del periodo [desdeDia, hastaDia] (AAAA-MM-DD). Los días que todavía tienen
// eventos se calculan de los eventos (incluye hoy); los demás salen de estadisticas_diarias.
function filasDelPeriodo_(desdeDia, hastaDia) {
  const dentro = function (fecha) {
    return fecha >= desdeDia && fecha <= hastaDia;
  };
  const crudos = leerTabla_('eventos').filas.filter(function (e) {
    return e.fecha && dentro(e.fecha.slice(0, 10));
  });
  const diasConEventos = {};
  crudos.forEach(function (e) {
    diasConEventos[e.fecha.slice(0, 10)] = true;
  });
  const consolidadas = leerTabla_('estadisticas_diarias').filas.filter(function (f) {
    return dentro(f.fecha) && !diasConEventos[f.fecha];
  });
  return agruparEventos_(crudos).concat(consolidadas.map(limpiarFila_));
}

function clicsPorProducto_(ahora, dias) {
  const hoy = diaLima_(ahora);
  const clics = {};
  filasDelPeriodo_(sumarDias_(hoy, -(dias - 1)), hoy).forEach(function (f) {
    if (f.producto_id && f.whatsapp) clics[f.producto_id] = (clics[f.producto_id] || 0) + f.whatsapp;
  });
  return clics;
}

function resumen(opciones) {
  requireAdmin_();
  const dias = opciones && opciones.dias;
  if (dias !== 7 && dias !== 30) fallar_('invalido', 'dias: debe ser 7 o 30');
  const hoy = diaLima_(ahora_());
  const filas = filasDelPeriodo_(sumarDias_(hoy, -(dias - 1)), hoy);
  const totales = contadoresVacios_();
  const porProducto = {};
  const porOrigen = {};
  filas.forEach(function (f) {
    sumarContadores_(totales, f);
    if (f.producto_id) {
      porProducto[f.producto_id] = porProducto[f.producto_id] || contadoresVacios_();
      sumarContadores_(porProducto[f.producto_id], f);
    }
    if (f.origen) {
      porOrigen[f.origen] = porOrigen[f.origen] || contadoresVacios_();
      sumarContadores_(porOrigen[f.origen], f);
    }
  });
  const productos = {};
  leerTabla_('productos').filas.forEach(function (p) {
    productos[p.id] = p;
  });
  const lista = Object.keys(porProducto).map(function (id) {
    const p = productos[id];
    return Object.assign({ producto_id: id, codigo: p ? p.codigo : '', nombre: p ? p.nombre : '' }, porProducto[id]);
  });
  lista.sort(function (a, b) {
    return b.whatsapp - a.whatsapp || b.vistas - a.vistas || (a.codigo < b.codigo ? -1 : 1);
  });
  return { totales: totales, por_producto: lista, por_origen: porOrigen };
}

// ---------------------------------------------------------------- consolidación diaria

// Deja la pestaña `entidad` con `nuevas` a partir de la posición `desdeIndice` (0 = primera fila de datos).
function reemplazarDesde_(entidad, tabla, desdeIndice, nuevas) {
  const inicio = 2 + desdeIndice;
  const ultima = tabla.hoja.getLastRow();
  if (nuevas.length) {
    const fin = inicio + nuevas.length - 1;
    if (fin > tabla.hoja.getMaxRows()) tabla.hoja.insertRowsAfter(tabla.hoja.getMaxRows(), fin - tabla.hoja.getMaxRows());
    const formato = formatosDeFila_(entidad, tabla);
    const rango = tabla.hoja.getRange(inicio, 1, nuevas.length, tabla.encabezados.length);
    rango.setNumberFormats(nuevas.map(function () {
      return formato;
    }));
    rango.setValues(nuevas.map(function (f) {
      return valoresDeFila_(entidad, tabla, f);
    }));
  }
  const sobran = ultima - (inicio + nuevas.length - 1);
  if (sobran > 0) tabla.hoja.getRange(inicio + nuevas.length, 1, sobran, tabla.encabezados.length).clearContent();
  // La hoja no debe seguir creciendo para siempre: se recortan las filas vacías de sobra.
  const usadas = 1 + desdeIndice + nuevas.length;
  const exceso = tabla.hoja.getMaxRows() - (usadas + FILAS_DE_SOBRA);
  if (exceso > 0) tabla.hoja.deleteRows(usadas + FILAS_DE_SOBRA + 1, exceso);
}

// Quita las filas viejas del PRINCIPIO de la hoja de eventos (los eventos entran en orden cronológico).
// No reescribe el resto: la API puede estar agregando eventos al final en este mismo momento y
// (cada proyecto tiene su propio candado) una reescritura se los llevaría por delante.
// → cantidad de eventos borrados.
function podarEventosViejos_(eventos, corte) {
  let viejos = 0;
  while (viejos < eventos.filas.length) {
    const f = eventos.filas[viejos];
    if (f._n !== viejos + 2 || (f.fecha && f.fecha.slice(0, 10) >= corte)) break; // la primera fila no vieja (o un hueco) corta el prefijo
    viejos++;
  }
  if (!viejos) return 0;
  const hoja = eventos.hoja;
  // Google no deja borrar todas las filas que no están congeladas: siempre queda al menos una.
  const quitar = Math.min(viejos, hoja.getMaxRows() - 2);
  if (quitar > 0) hoja.deleteRows(2, quitar);
  if (viejos > quitar) hoja.getRange(2, 1, viejos - quitar, eventos.encabezados.length).clearContent();
  return viejos;
}

// Eventos → estadisticas_diarias (se vuelven a calcular los días que aún tienen eventos) y poda de
// los eventos de más de 35 días. Idempotente.
function consolidar_(ahora) {
  return conCandado_(function () {
    const hoy = diaLima_(ahora);
    const eventos = leerTabla_('eventos');
    const nuevas = agruparEventos_(eventos.filas);
    const dias = {};
    nuevas.forEach(function (f) {
      dias[f.fecha] = true;
    });

    const estadisticas = leerTabla_('estadisticas_diarias');
    const primero = estadisticas.filas.findIndex(function (f) {
      return dias[f.fecha];
    });
    if (primero !== -1) {
      const conservadas = estadisticas.filas.slice(primero).filter(function (f) {
        return !dias[f.fecha];
      });
      const cola = conservadas.concat(nuevas).sort(function (a, b) {
        return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
      });
      // Desde la fila REAL de la hoja (las filas vacías que dejó la dueña no cuentan en la lista leída).
      reemplazarDesde_('estadisticas_diarias', estadisticas, estadisticas.filas[primero]._n - 2, cola);
    } else if (nuevas.length) {
      agregarFilas_('estadisticas_diarias', estadisticas, nuevas.slice().sort(function (a, b) {
        return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
      }));
    }

    const borrados = podarEventosViejos_(eventos, sumarDias_(hoy, -DIAS_RETENCION_EVENTOS));
    return { dias: Object.keys(dias).length, filas: nuevas.length, borrados: borrados };
  });
}

// Activador diario (entre 00:00 y 01:00): consolida y vuelve a publicar.
function diario_() {
  consolidar_(ahora_());
  publicarInterno_(false);
}

// ---------------------------------------------------------------- reporte mensual

function mesAnterior_(hoy) {
  const [anio, mes] = hoy.split('-').map(Number);
  const m = mes === 1 ? 12 : mes - 1;
  const a = mes === 1 ? anio - 1 : anio;
  return a + '-' + ('0' + m).slice(-2);
}

function buscarHoja_(carpeta, nombre) {
  const it = carpeta.getFilesByName(nombre);
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) return f;
  }
  return null;
}

// Una pestaña AAAA-MM del libro «Reporte de consultas» (en Documentos/Reportes). Si ya existe, se rehace.
function reporteMensual_() {
  const ahora = ahora_();
  consolidar_(ahora);
  const mes = mesAnterior_(diaLima_(ahora));
  const filas = leerTabla_('estadisticas_diarias').filas.filter(function (f) {
    return f.fecha.slice(0, 7) === mes;
  });
  const productos = {};
  leerTabla_('productos').filas.forEach(function (p) {
    productos[p.id] = p;
  });
  const porProducto = {};
  const porOrigen = {};
  const totales = contadoresVacios_();
  filas.forEach(function (f) {
    sumarContadores_(totales, f);
    if (f.producto_id) {
      porProducto[f.producto_id] = porProducto[f.producto_id] || contadoresVacios_();
      sumarContadores_(porProducto[f.producto_id], f);
    }
    porOrigen[f.origen] = porOrigen[f.origen] || contadoresVacios_();
    sumarContadores_(porOrigen[f.origen], f);
  });
  const lineaDe = function (c) {
    return [c.vistas, c.whatsapp, c.favoritos, c.compartidos, c.descargas];
  };
  const filasPrenda = Object.keys(porProducto)
    .map(function (id) {
      return { id: id, c: porProducto[id] };
    })
    .sort(function (a, b) {
      return b.c.whatsapp - a.c.whatsapp || b.c.vistas - a.c.vistas;
    })
    .map(function (x) {
      const p = productos[x.id];
      return [p ? p.codigo : '', p ? p.nombre : '(prenda eliminada)'].concat(lineaDe(x.c));
    });
  const filasOrigen = Object.keys(porOrigen).sort().map(function (o) {
    return [o, ''].concat(lineaDe(porOrigen[o]));
  });
  const encabezado = ['Código / origen', 'Prenda', 'Vistas', 'WhatsApp', 'Favoritos', 'Compartidos', 'Descargas'];
  const bloques = [
    [['Reporte de consultas · ' + mes, '', '', '', '', '', '']],
    [encabezado],
    filasPrenda.length ? filasPrenda : [['(sin consultas este mes)', '', '', '', '', '', '']],
    [['', '', '', '', '', '', '']],
    [['Por origen', '', '', '', '', '', '']],
    filasOrigen,
    [['Total', ''].concat(lineaDe(totales))],
  ];
  const valores = [].concat.apply([], bloques);

  const carpeta = carpeta_('reportes');
  let archivo = buscarHoja_(carpeta, NOMBRE_REPORTE);
  let libro;
  let hojaPorDefecto = null;
  if (archivo) {
    libro = SpreadsheetApp.openById(archivo.getId());
  } else {
    libro = SpreadsheetApp.create(NOMBRE_REPORTE);
    hojaPorDefecto = libro.getSheets()[0];
    DriveApp.getFileById(libro.getId()).moveTo(carpeta);
  }
  let hoja = libro.getSheetByName(mes);
  if (hoja) hoja.clear();
  else hoja = libro.insertSheet(mes);
  // Código/origen y nombre van como texto: nada que escriba la dueña puede volverse fórmula.
  if (valores.length > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), valores.length - hoja.getMaxRows());
  hoja.getRange(1, 1, valores.length, 2).setNumberFormat('@');
  hoja.getRange(1, 1, valores.length, 7).setValues(valores);
  if (hojaPorDefecto) libro.deleteSheet(hojaPorDefecto); // solo la pestaña vacía de un libro recién creado
  return { mes: mes, url: libro.getUrl() + '#gid=' + hoja.getSheetId() };
}
