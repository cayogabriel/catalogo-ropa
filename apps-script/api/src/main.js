// API pública del catálogo. Contrato: docs/contracts/api-publica.md
// Solo lectura (catálogo publicado y fotos publicadas) y una única escritura: agregar un evento anónimo.
// doGet y doPost nunca lanzan: ante cualquier fallo responden {ok:false,error:'interno'} sin detalles.

function doGet(e) {
  try {
    const ruta = (e && e.parameter && e.parameter.r) || '';
    if (ruta !== 'catalogo' && ruta !== 'foto') return error_('ruta_desconocida');

    const config = config_(ruta === 'catalogo');
    if (!config) return error_('sin_instalacion');
    if (ruta === 'foto') return foto_(config, e.parameter.id);

    const publicado = leerPublicado_(config);
    if (!publicado) return error_('sin_publicacion');
    return ok_(publicado);
  } catch (err) {
    return fallo_(err);
  }
}

function doPost(e) {
  try {
    const evento = leerEvento_(e);
    if (!evento) return error_('evento_invalido');
    const resultado = registrarEvento_(evento);
    if (resultado === 'sin_instalacion') return error_('sin_instalacion');
    return json_(resultado === 'descartado' ? { ok: true, descartado: true } : { ok: true });
  } catch (err) {
    return fallo_(err);
  }
}

// El detalle va al registro de Google (solo lo ve la dueña); la respuesta pública no lleva nada.
function fallo_(err) {
  try {
    console.error(String((err && err.message) || err));
  } catch (e) {
    // sin registro, igual se responde
  }
  return error_('interno');
}

// Ejecutarla una vez desde el editor hace que Google pida los permisos del manifiesto.
function autorizar() {
  return 'ok';
}
