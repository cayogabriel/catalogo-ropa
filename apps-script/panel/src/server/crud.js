// CRUD de las entidades editables (api-panel.md · Edición). Todo con candado, control de `version`
// e historial. Las funciones públicas empiezan con requireAdmin_(); el trabajo está en helpers privados.

function entidadValida_(entidad) {
  if (ENTIDADES.indexOf(entidad) === -1) fallar_('invalido', 'entidad desconocida: ' + entidad);
}

function memoDe_(tabla) {
  const memo = {};
  memo[tabla.entidad] = tabla;
  return memo;
}

function buscarFila_(tabla, id) {
  const fila = tabla.filas.filter(function (f) {
    return f.id === id;
  })[0];
  if (!fila) fallar_('no_encontrado', 'no existe «' + id + '» en ' + tabla.entidad);
  return fila;
}

function clonarFila_(fila) {
  const copia = {};
  Object.keys(fila).forEach(function (k) {
    const v = fila[k];
    copia[k] = Array.isArray(v) ? v.slice() : v && typeof v === 'object' && k !== '_crudo' ? JSON.parse(JSON.stringify(v)) : v;
  });
  return copia;
}

function iguales_(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------- listar

function listar(entidad, opciones) {
  requireAdmin_();
  entidadValida_(entidad);
  opciones = opciones || {};
  const filtro = opciones.filtro || {};
  let filas = leerTabla_(entidad).filas.filter(function (f) {
    if (entidad === 'productos' && !opciones.incluir_archivados && f.estado === 'archivado') return false;
    return Object.keys(filtro).every(function (campo) {
      if (ESQUEMA[entidad].indexOf(campo) === -1) fallar_('invalido', 'no existe la columna «' + campo + '»');
      return Array.isArray(f[campo]) ? f[campo].indexOf(filtro[campo]) !== -1 : f[campo] === filtro[campo];
    });
  });
  if (ESQUEMA[entidad].indexOf('orden') !== -1) {
    filas = filas
      .map(function (f, i) {
        return { f: f, i: i };
      })
      .sort(function (a, b) {
        const x = a.f.orden === null ? Infinity : a.f.orden;
        const y = b.f.orden === null ? Infinity : b.f.orden;
        return x === y ? a.i - b.i : x < y ? -1 : 1;
      })
      .map(function (x) {
        return x.f;
      });
  }
  return { filas: filas.map(limpiarFila_), leido_en: aIso_(ahora_()) };
}

// ---------------------------------------------------------------- crear

function slugDe_(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function slugUnico_(tabla, texto) {
  const base = slugDe_(texto);
  if (!base) fallar_('invalido', 'escribe un nombre para generar el enlace');
  const usados = tabla.filas.map(function (f) {
    return f.slug;
  });
  let slug = base;
  for (let n = 2; usados.indexOf(slug) !== -1; n++) slug = base.slice(0, 56) + '-' + n;
  return slug;
}

function prefijoUnico_(tabla, nombre) {
  const letras = String(nombre)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  const L = (letras + 'XXX').split('');
  const usados = tabla.filas.map(function (f) {
    return f.prefijo_codigo;
  });
  const libre = function (p) {
    return usados.indexOf(p) === -1;
  };
  for (let k = 2; k < L.length; k++) if (libre(L[0] + L[1] + L[k])) return L[0] + L[1] + L[k];
  for (let j = 1; j < L.length; j++) for (let k = j + 1; k < L.length; k++) if (libre(L[0] + L[j] + L[k])) return L[0] + L[j] + L[k];
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  for (let i = 0; i < abc.length; i++) for (let j = 0; j < abc.length; j++) if (libre(L[0] + abc[i] + abc[j])) return L[0] + abc[i] + abc[j];
  return fallar_('invalido', 'no se pudo generar un prefijo libre; escribe uno de 3 letras');
}

// Prefijo + correlativo: sigue al mayor número usado con ese prefijo (incluye archivadas), mínimo 3 dígitos.
function codigoNuevo_(tablaProductos, prefijo) {
  let mayor = 0;
  tablaProductos.filas.forEach(function (p) {
    const m = /^([A-Z]{3})-([0-9]+)$/.exec(p.codigo);
    if (m && m[1] === prefijo) mayor = Math.max(mayor, Number(m[2]));
  });
  const n = String(mayor + 1);
  return prefijo + '-' + (n.length < 3 ? ('000' + n).slice(-3) : n);
}

function prefijoDeCategoria_(memo, categoriaId) {
  if (!categoriaId) return 'PRD';
  if (!memo.categorias) memo.categorias = leerTabla_('categorias');
  const cat = memo.categorias.filas.filter(function (c) {
    return c.id === categoriaId;
  })[0];
  return cat && cat.prefijo_codigo ? cat.prefijo_codigo : 'PRD';
}

function siguienteOrden_(tabla, aplica) {
  let mayor = 0;
  tabla.filas.forEach(function (f) {
    if ((!aplica || aplica(f)) && f.orden !== null && f.orden > mayor) mayor = f.orden;
  });
  return mayor + 1;
}

function defectosDe_(entidad, ahoraIso) {
  switch (entidad) {
    case 'productos':
      return {
        codigo: '', nombre: '', descripcion: '', categoria_id: '', precio_regular: null, stock: null, tallas: [],
        tallas_agotadas: [], colores: [], fotos: [], texto_alt: '', etiquetas: [], estado: 'borrador', vendedora_id: '',
        orden: null, creado_en: ahoraIso, actualizado_en: ahoraIso, publicado_en: null,
      };
    case 'categorias':
      return { nombre: '', slug: '', prefijo_codigo: '', orden: null, visible: true, foto: '' };
    case 'secciones':
      return {
        titulo: '', subtitulo: '', tipo: 'manual', parametro: '', productos: [], diseno: 'carrusel', limite: null, orden: null,
        visible: true, temporada_id: '',
      };
    case 'portadas':
      return {
        titulo: '', subtitulo: '', boton_texto: '', boton_destino: '/', foto_escritorio: '', foto_movil: '', desde: null,
        hasta: null, orden: null, activa: false, temporada_id: '',
      };
    case 'ofertas':
      return {
        nombre: '', tipo: 'porcentaje', valor: null, alcance: 'tienda', objetivos: [], desde: null, hasta: null, prioridad: 0,
        etiqueta: '', es_liquidacion: false, cuenta_regresiva: false, activa: false,
      };
    case 'temporadas':
      return {
        slug: '', nombre: '', titulo: '', subtitulo: '', intro: '', cierre: '', paleta_id: '', foto_portada: '', desde: null,
        hasta: null, activa_manual: '', visible_en_web: false, revista: false, vigencia_dias: null,
      };
    case 'temporada_fotos':
      return { temporada_id: '', orden: null, foto: '', tipo: 'producto', productos: [], texto: '', texto_alt: '', destacada: false };
    case 'paletas':
      return {
        nombre: '', temporada: '', uso: '', tokens: {}, fuente_titulos: 'Poppins', fuente_texto: 'Nunito Sans', radio: '12px',
        origen: 'propia',
      };
    default:
      return { nombre: '', whatsapp: '', activa: false, por_defecto: false };
  }
}

function crear(entidad, datos) {
  requireAdmin_();
  entidadValida_(entidad);
  return limpiarFila_(crearInterno_(entidad, datos || {}, 'crear'));
}

// Devuelve la fila creada (con campos internos). `accion` es lo que se anota en el historial.
function crearInterno_(entidad, datos, accion) {
  return conCandado_(function () {
    const tabla = leerTabla_(entidad);
    const memo = memoDe_(tabla);
    const ahoraIso = aIso_(ahora_());
    const fila = defectosDe_(entidad, ahoraIso);
    Object.keys(datos).forEach(function (campo) {
      if (ESQUEMA[entidad].indexOf(campo) === -1) fallar_('invalido', 'no existe la columna «' + campo + '»');
      if (COLUMNAS_SISTEMA.indexOf(campo) !== -1 && campo !== 'id') fallar_('invalido', campo + ': lo maneja el Panel, no se puede fijar');
      if (campo === 'id') fallar_('invalido', 'el id lo genera el Panel');
      if (entidad === 'paletas' && campo === 'origen') return;
      fila[campo] = validarValor_(entidad, campo, datos[campo], memo);
    });
    fila.id = nuevoIdUnico_(entidad, tabla);
    fila.version = 1;
    efectosAlCrear_(entidad, fila, datos, tabla, memo);
    validarFila_(entidad, fila, memo);
    const otras = quitarPorDefectoAjeno_(entidad, fila, tabla);
    agregarFilas_(entidad, tabla, [fila]);
    registrarCambios_(
      [{ entidad: entidad, entidad_id: fila.id, campo: '', antes: null, despues: limpiarFila_(fila), accion: accion }].concat(otras),
    );
    marcarCambio_();
    return fila;
  });
}

// Inserta una fila ya completa (para deshacer una eliminación): conserva su id; la versión sube.
function insertarFilaInterna_(entidad, datos, accion) {
  return conCandado_(function () {
    const tabla = leerTabla_(entidad);
    const memo = memoDe_(tabla);
    const fila = {};
    ESQUEMA[entidad].forEach(function (c) {
      fila[c] = c in datos ? datos[c] : defectosDe_(entidad, aIso_(ahora_()))[c];
    });
    fila.version = (Number(datos.version) || 0) + 1;
    if (tabla.filas.some(function (f) {
      return f.id === fila.id;
    })) fallar_('invalido', 'esa fila ya existe');
    validarFila_(entidad, fila, memo);
    agregarFilas_(entidad, tabla, [fila]);
    registrarCambios_([{ entidad: entidad, entidad_id: fila.id, campo: '', antes: null, despues: limpiarFila_(fila), accion: accion }]);
    return fila;
  });
}

function nuevoIdUnico_(entidad, tabla) {
  const prefijo = PREFIJOS_ID[entidad];
  for (let i = 0; i < 20; i++) {
    const id = idNuevo_(prefijo);
    if (!tabla.filas.some(function (f) {
      return f.id === id;
    })) return id;
  }
  return fallar_('invalido', 'no se pudo generar un id nuevo; intenta otra vez');
}

function efectosAlCrear_(entidad, fila, datos, tabla, memo) {
  if (fila.orden === null && ESQUEMA[entidad].indexOf('orden') !== -1) {
    fila.orden = siguienteOrden_(tabla, entidad === 'temporada_fotos' ? function (f) {
      return f.temporada_id === fila.temporada_id;
    } : null);
  }
  switch (entidad) {
    case 'productos':
      fila.estado = 'borrador';
      if (!fila.codigo) fila.codigo = codigoNuevo_(tabla, prefijoDeCategoria_(memo, fila.categoria_id));
      break;
    case 'categorias':
      if (!fila.slug) fila.slug = slugUnico_(tabla, fila.nombre);
      if (!fila.prefijo_codigo) fila.prefijo_codigo = prefijoUnico_(tabla, fila.nombre);
      break;
    case 'temporadas':
      if (!fila.slug) fila.slug = slugUnico_(tabla, fila.nombre);
      if (!fila.paleta_id) fila.paleta_id = String(leerConfig_().paleta_defecto);
      break;
    case 'ofertas':
      if (fila.alcance === 'tienda') fila.objetivos = [];
      break;
    case 'vendedoras': {
      if (fila.whatsapp && !('activa' in datos)) fila.activa = true;
      const hayDefecto = tabla.filas.some(function (v) {
        return v.por_defecto && v.activa;
      });
      if (!hayDefecto && fila.activa) fila.por_defecto = true;
      break;
    }
  }
}

// Si la fila nueva o editada es la vendedora por defecto, las demás dejan de serlo (queda exactamente una).
function quitarPorDefectoAjeno_(entidad, fila, tabla) {
  const entradas = [];
  if (entidad !== 'vendedoras' || !fila.por_defecto) return entradas;
  tabla.filas.forEach(function (v) {
    if (v.id === fila.id || !v.por_defecto) return;
    const antes = clonarFila_(v);
    v.por_defecto = false;
    v.version = (v.version || 0) + 1;
    escribirFila_('vendedoras', tabla, v);
    entradas.push({ entidad: 'vendedoras', entidad_id: v.id, campo: 'por_defecto', antes: antes.por_defecto, despues: false, accion: 'editar' });
  });
  return entradas;
}

// ---------------------------------------------------------------- guardar

function guardarCampo(entidad, id, campo, valor, version) {
  requireAdmin_();
  const cambios = {};
  cambios[campo] = valor;
  const r = guardarCamposInterno_(entidad, id, cambios, version, 'editar');
  return { fila: limpiarFila_(r.fila), version: r.version };
}

function guardarCampos(entidad, id, cambios, version) {
  requireAdmin_();
  const r = guardarCamposInterno_(entidad, id, cambios, version, 'editar');
  return { fila: limpiarFila_(r.fila), version: r.version };
}

// version === null: sin control de versión (deshacer). → { fila (con internos), version }
function guardarCamposInterno_(entidad, id, cambios, version, accion) {
  entidadValida_(entidad);
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios) || !Object.keys(cambios).length) {
    fallar_('invalido', 'no hay nada que guardar');
  }
  return conCandado_(function () {
    const tabla = leerTabla_(entidad);
    const memo = memoDe_(tabla);
    const fila = buscarFila_(tabla, id);
    if (version !== null && (fila.version || 0) !== (Number(version) || 0)) {
      fallar_('conflicto', 'esta fila cambió en otra pestaña o equipo; recárgala para ver la versión nueva');
    }
    const previa = clonarFila_(fila);
    const nueva = clonarFila_(fila);
    Object.keys(cambios).forEach(function (campo) {
      if (ESQUEMA[entidad].indexOf(campo) === -1) fallar_('invalido', 'no existe la columna «' + campo + '»');
      if (COLUMNAS_SISTEMA.indexOf(campo) !== -1) fallar_('invalido', campo + ': lo maneja el Panel, no se puede editar');
      nueva[campo] = validarValor_(entidad, campo, cambios[campo], memo);
    });
    efectosAlEditar_(entidad, nueva, previa, cambios, tabla, memo);
    validarFila_(entidad, nueva, memo);
    const cambiados = ESQUEMA[entidad].filter(function (c) {
      return COLUMNAS_SISTEMA.indexOf(c) === -1 && !iguales_(previa[c], nueva[c]);
    });
    if (!cambiados.length) return { fila: fila, version: fila.version || 0 };
    nueva.version = (fila.version || 0) + 1;
    if (ESQUEMA[entidad].indexOf('actualizado_en') !== -1) nueva.actualizado_en = aIso_(ahora_());
    const otras = quitarPorDefectoAjeno_(entidad, nueva, tabla);
    Object.keys(nueva).forEach(function (k) {
      fila[k] = nueva[k];
    });
    escribirFila_(entidad, tabla, fila);
    const entradas = cambiados.map(function (c) {
      return { entidad: entidad, entidad_id: id, campo: c, antes: previa[c], despues: nueva[c], accion: accion };
    });
    registrarCambios_(entradas.concat(otras));
    marcarCambio_();
    return { fila: fila, version: fila.version };
  });
}

function efectosAlEditar_(entidad, nueva, previa, cambios, tabla, memo) {
  switch (entidad) {
    case 'productos': {
      if ('codigo' in cambios && nueva.codigo !== previa.codigo && previa.publicado_en) {
        fallar_('invalido', 'el código no cambia después de publicar la prenda (los enlaces compartidos dejarían de funcionar)');
      }
      if ('tallas' in cambios && !('tallas_agotadas' in cambios)) {
        nueva.tallas_agotadas = nueva.tallas_agotadas.filter(function (t) {
          return nueva.tallas.indexOf(t) !== -1;
        });
      }
      nueva.tallas_agotadas.forEach(function (t) {
        if (nueva.tallas.indexOf(t) === -1) fallar_('invalido', 'tallas agotadas: «' + t + '» no está en las tallas de la prenda');
      });
      if ('categoria_id' in cambios && nueva.categoria_id !== previa.categoria_id && !previa.publicado_en && !('codigo' in cambios)) {
        nueva.codigo = codigoNuevo_(tabla, prefijoDeCategoria_(memo, nueva.categoria_id));
      }
      break;
    }
    case 'ofertas':
      if (nueva.alcance === 'tienda') nueva.objetivos = [];
      break;
    case 'vendedoras':
      if (previa.por_defecto && !nueva.por_defecto) fallar_('invalido', 'tiene que haber una vendedora por defecto: márcala en otra vendedora');
      if (previa.por_defecto && !nueva.activa) fallar_('invalido', 'la vendedora por defecto no se puede desactivar: elige otra primero');
      break;
    case 'paletas':
      if (nueva.origen !== previa.origen) fallar_('invalido', 'origen: no se puede cambiar');
      break;
  }
}

// ---------------------------------------------------------------- eliminar

function eliminar(entidad, id) {
  requireAdmin_();
  entidadValida_(entidad);
  const r = eliminarInterno_(entidad, id, 'eliminar');
  return { ok: true, archivado: r.archivado };
}

function contarReferencias_(entidad, id) {
  const cuenta = function (otra, fn) {
    return leerTabla_(otra).filas.filter(fn).length;
  };
  switch (entidad) {
    case 'categorias': {
      const n = cuenta('productos', function (p) {
        return p.categoria_id === id && p.estado !== 'archivado';
      });
      return n ? 'tiene ' + n + ' prenda(s): muévelas o archívalas primero' : '';
    }
    case 'temporadas': {
      const n =
        cuenta('temporada_fotos', function (f) {
          return f.temporada_id === id;
        }) +
        cuenta('portadas', function (p) {
          return p.temporada_id === id;
        }) +
        cuenta('secciones', function (s) {
          return s.temporada_id === id;
        });
      return n ? 'tiene ' + n + ' foto(s), portada(s) o sección(es) asociadas: quítalas primero' : '';
    }
    case 'paletas': {
      const n = cuenta('temporadas', function (t) {
        return t.paleta_id === id;
      });
      if (n) return 'la usa ' + n + ' temporada(s): cámbiales la paleta primero';
      return String(leerConfig_().paleta_defecto) === id ? 'es la paleta por defecto de la tienda' : '';
    }
    case 'vendedoras': {
      const n = cuenta('productos', function (p) {
        return p.vendedora_id === id;
      });
      return n ? 'está asignada a ' + n + ' prenda(s): cámbiales la vendedora primero' : '';
    }
  }
  return '';
}

// → { fila, archivado }
function eliminarInterno_(entidad, id, accion) {
  return conCandado_(function () {
    const tabla = leerTabla_(entidad);
    const fila = buscarFila_(tabla, id);
    const antes = limpiarFila_(fila);
    if (entidad === 'productos') {
      if (fila.estado === 'archivado') return { fila: limpiarFila_(fila), archivado: true };
      fila.estado = 'archivado';
      fila.version = (fila.version || 0) + 1;
      fila.actualizado_en = aIso_(ahora_());
      escribirFila_(entidad, tabla, fila);
      registrarCambios_([{ entidad: entidad, entidad_id: id, campo: '', antes: antes, despues: null, accion: accion }]);
      marcarCambio_();
      return { fila: limpiarFila_(fila), archivado: true };
    }
    if (entidad === 'vendedoras' && fila.por_defecto) fallar_('invalido', 'no se puede eliminar la vendedora por defecto: marca a otra primero');
    if (entidad === 'paletas' && fila.origen === 'predefinida') fallar_('invalido', 'las paletas predefinidas no se eliminan');
    const motivo = contarReferencias_(entidad, id);
    if (motivo) fallar_('invalido', 'no se puede eliminar «' + (fila.nombre || fila.titulo || fila.id) + '»: ' + motivo);
    eliminarFila_(tabla, fila);
    registrarCambios_([{ entidad: entidad, entidad_id: id, campo: '', antes: antes, despues: null, accion: accion }]);
    marcarCambio_();
    return { fila: antes, archivado: false };
  });
}

// ---------------------------------------------------------------- reordenar

function reordenar(entidad, ids) {
  requireAdmin_();
  entidadValida_(entidad);
  if (ESQUEMA[entidad].indexOf('orden') === -1) fallar_('invalido', entidad + ' no se puede reordenar');
  if (!Array.isArray(ids) || !ids.length) fallar_('invalido', 'ids: debe ser una lista con los ids en el nuevo orden');
  const mapa = {};
  ids.forEach(function (id, i) {
    if (id in mapa) fallar_('invalido', 'ids: «' + id + '» está repetido');
    mapa[id] = i + 1;
  });
  aplicarOrden_(entidad, mapa, 'reordenar');
  return { ok: true };
}

// mapa: {id: orden nuevo}. Solo se escriben (y suben de versión) las filas cuyo orden cambia.
function aplicarOrden_(entidad, mapa, accion) {
  return conCandado_(function () {
    const tabla = leerTabla_(entidad);
    const filas = Object.keys(mapa).map(function (id) {
      return buscarFila_(tabla, id);
    });
    if (entidad === 'temporada_fotos') {
      const temporadas = {};
      filas.forEach(function (f) {
        temporadas[f.temporada_id] = true;
      });
      if (Object.keys(temporadas).length > 1) fallar_('invalido', 'las fotos a reordenar deben ser de una sola temporada');
    }
    const antes = {};
    const despues = {};
    const ahoraIso = aIso_(ahora_());
    filas.forEach(function (f) {
      if (f.orden === mapa[f.id]) return;
      antes[f.id] = f.orden;
      despues[f.id] = mapa[f.id];
      f.orden = mapa[f.id];
      f.version = (f.version || 0) + 1;
      if (ESQUEMA[entidad].indexOf('actualizado_en') !== -1) f.actualizado_en = ahoraIso;
      escribirFila_(entidad, tabla, f);
    });
    if (!Object.keys(despues).length) return;
    registrarCambios_([{ entidad: entidad, entidad_id: '', campo: 'orden', antes: antes, despues: despues, accion: accion }]);
    marcarCambio_();
  });
}

// ---------------------------------------------------------------- duplicar

function duplicarProducto(id) {
  requireAdmin_();
  const original = leerTabla_('productos').filas.filter(function (p) {
    return p.id === id;
  })[0];
  if (!original) fallar_('no_encontrado', 'no existe la prenda «' + id + '»');
  const datos = {
    nombre: (original.nombre + ' (copia)').slice(0, 80), descripcion: original.descripcion, categoria_id: original.categoria_id,
    precio_regular: original.precio_regular, stock: original.stock, tallas: original.tallas.slice(),
    tallas_agotadas: original.tallas_agotadas.slice(), colores: original.colores.slice(), fotos: original.fotos.slice(),
    texto_alt: original.texto_alt, etiquetas: original.etiquetas.slice(), vendedora_id: original.vendedora_id,
  };
  return limpiarFila_(crearInterno_('productos', datos, 'crear'));
}
