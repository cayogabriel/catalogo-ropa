// Historial de cambios y «Deshacer». Cada escritura del Panel deja filas en la pestaña `historial`.

function usuarioActual_() {
  try {
    return String(Session.getActiveUser().getEmail() || '');
  } catch (e) {
    return '';
  }
}

const LIMITE_HISTORIAL_DEFECTO = 50;
const LIMITE_HISTORIAL_MAX = 500;

// entradas: [{ entidad, entidad_id, campo, antes, despues, accion }]. `antes` y `despues` son valores
// (se guardan como JSON) o null cuando no aplican.
function registrarCambios_(entradas) {
  if (!entradas.length) return;
  const tabla = abrirTabla_('historial'); // el autoguardado no debe leer todo el historial en cada cambio
  const ahora = ahora_();
  const filas = entradas.map(function (e) {
    return {
      id: idNuevo_('his'),
      fecha: aIso_(ahora),
      usuario: usuarioActual_(),
      entidad: e.entidad,
      entidad_id: e.entidad_id === null || e.entidad_id === undefined ? '' : String(e.entidad_id),
      campo: e.campo || '',
      antes: e.antes === null || e.antes === undefined ? '' : JSON.stringify(e.antes),
      despues: e.despues === null || e.despues === undefined ? '' : JSON.stringify(e.despues),
      accion: e.accion,
    };
  });
  agregarFilas_('historial', tabla, filas);
}

function historial(opciones) {
  requireAdmin_();
  opciones = opciones || {};
  let limite = opciones.limite === undefined || opciones.limite === null ? LIMITE_HISTORIAL_DEFECTO : Number(opciones.limite);
  if (!isFinite(limite) || limite < 1) fallar_('invalido', 'limite debe ser un número positivo');
  limite = Math.min(Math.floor(limite), LIMITE_HISTORIAL_MAX);
  const filas = leerTabla_('historial').filas.filter(function (f) {
    if (opciones.entidad && f.entidad !== opciones.entidad) return false;
    if (opciones.id && f.entidad_id !== opciones.id) return false;
    return true;
  });
  // La más reciente primero; a igual fecha, la que se escribió después.
  return filas
    .map(function (f, i) {
      return { f: f, i: i };
    })
    .sort(function (a, b) {
      const da = a.f.fecha || '';
      const db = b.f.fecha || '';
      return da < db ? 1 : da > db ? -1 : b.i - a.i;
    })
    .slice(0, limite)
    .map(function (x) {
      return limpiarFila_(x.f);
    });
}

function valorDeJson_(texto) {
  if (texto === '' || texto === null || texto === undefined) return null;
  try {
    return JSON.parse(texto);
  } catch (e) {
    return null;
  }
}

function deshacer(historialId) {
  requireAdmin_();
  return conCandado_(function () {
    const cambio = leerTabla_('historial').filas.filter(function (f) {
      return f.id === historialId;
    })[0];
    if (!cambio) fallar_('no_encontrado', 'no existe ese cambio en el historial');
    const antes = valorDeJson_(cambio.antes);
    const despues = valorDeJson_(cambio.despues);
    let fila = null;
    switch (cambio.entidad) {
      case 'textos':
        fila = restaurarTexto_(cambio, antes);
        break;
      case 'config':
        fila = restaurarConfig_(cambio, antes);
        break;
      default:
        fila = restaurarFila_(cambio, antes, despues);
    }
    marcarCambio_();
    return { fila: fila };
  });
}

function restaurarFila_(cambio, antes, despues) {
  const entidad = cambio.entidad;
  if (ENTIDADES.indexOf(entidad) === -1) fallar_('invalido', 'ese cambio no se puede deshacer');
  if ((cambio.accion === 'editar' || cambio.accion === 'deshacer') && cambio.campo) {
    const cambios = {};
    cambios[cambio.campo] = antes;
    return limpiarFila_(guardarCamposInterno_(entidad, cambio.entidad_id, cambios, null, 'deshacer').fila);
  }
  if (cambio.accion === 'crear') return eliminarInterno_(entidad, cambio.entidad_id, 'deshacer').fila;
  if (cambio.accion === 'eliminar') return reponerFila_(entidad, antes);
  if (cambio.accion === 'reordenar') return restaurarOrden_(entidad, antes);
  fallar_('invalido', 'ese cambio no se puede deshacer');
}

// Deshacer una eliminación: si la fila sigue en la hoja (producto archivado) se restaura su estado; si no, se vuelve a escribir.
function reponerFila_(entidad, antes) {
  if (!antes || !antes.id) fallar_('invalido', 'ese cambio no guardó la fila, no se puede deshacer');
  const existente = leerTabla_(entidad).filas.filter(function (f) {
    return f.id === antes.id;
  })[0];
  if (existente) {
    if (entidad !== 'productos') fallar_('invalido', 'esa fila ya existe');
    return limpiarFila_(guardarCamposInterno_(entidad, antes.id, { estado: antes.estado }, null, 'deshacer').fila);
  }
  return limpiarFila_(insertarFilaInterna_(entidad, antes, 'deshacer'));
}

function restaurarOrden_(entidad, antes) {
  if (!antes || typeof antes !== 'object') fallar_('invalido', 'ese cambio no guardó el orden anterior');
  aplicarOrden_(entidad, antes, 'deshacer');
  return null;
}
