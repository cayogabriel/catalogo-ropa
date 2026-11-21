// Motor de precios: puro (sin Google), para poder probarlo a fondo.
// Reglas (modelo-datos.md · ofertas): las ofertas NO se suman. En cada momento gana la de mayor
// prioridad y, si empatan, la de mayor descuento (si empatan en todo, la primera de la lista).
// Una oferta cuyo precio final no queda entre 0 y el precio regular (p. ej. por el redondeo) no cuenta.

function porcentajeDescuentoGas_(regular, precio) {
  // Mismo cálculo que porcentajeDescuento de @catalogo/contratos: hacia abajo, nunca se exagera.
  return Math.floor(((regular - precio) / regular) * 100 + 1e-9);
}

function aCentimos_(x) {
  return Math.round(x * 100) / 100;
}

// Siempre hacia abajo: el cliente paga lo prometido o menos, nunca más (marketing honesto).
// El 1e-9 evita que 74.999999999 por error de coma flotante pierda un sol entero.
function redondear_(x, modo) {
  if (modo === 'entero') return Math.floor(x + 1e-9);
  if (modo === '90') return aCentimos_(Math.floor(x - 0.9 + 1e-9) + 0.9);
  return Math.floor(x * 100 + 1e-6) / 100;
}

// Precio que daría la oferta sobre el precio regular, o null si no sirve (no baja el precio o queda en 0 o menos).
function precioDeOferta_(oferta, regular, redondeo) {
  let precio;
  if (oferta.tipo === 'porcentaje') precio = redondear_(regular * (1 - oferta.valor / 100), redondeo);
  else if (oferta.tipo === 'monto') precio = redondear_(regular - oferta.valor, redondeo);
  else if (oferta.tipo === 'precio_final') precio = aCentimos_(oferta.valor);
  else return null;
  return precio > 0 && precio < regular ? precio : null;
}

function ofertaAplica_(oferta, producto, contexto) {
  const objetivos = oferta.objetivos || [];
  const hay = function (lista) {
    return objetivos.some(function (id) {
      return lista.indexOf(id) !== -1;
    });
  };
  switch (oferta.alcance) {
    case 'tienda':
      return true;
    case 'producto':
      return objetivos.indexOf(producto.id) !== -1;
    case 'categoria':
      return objetivos.indexOf(producto.categoria_id) !== -1;
    case 'seccion':
      return hay(contexto.secciones || []);
    case 'temporada':
      return hay(contexto.temporadas || []);
    default:
      return false;
  }
}

// producto: { id, categoria_id, precio_regular }.  ofertas: filas de `ofertas` (solo cuentan las activas).
// contexto: { redondeo, secciones: [ids], temporadas: [ids], ahora: Date | null }.
// `ahora` ≠ null descarta las ventanas que ya terminaron (la primera vuelve a empezar en null).
// → { regular, ventanas } con la forma de catalog.schema.json.
function ventanasDePrecio_(producto, ofertas, contexto) {
  const regular = producto.precio_regular;
  const redondeo = contexto.redondeo || 'ninguno';
  const candidatas = [];
  ofertas.forEach(function (o, orden) {
    if (!o.activa || !(o.valor > 0) || !ofertaAplica_(o, producto, contexto)) return;
    const desde = o.desde ? Date.parse(o.desde) : -Infinity;
    const hasta = o.hasta ? Date.parse(o.hasta) : Infinity;
    if (!(desde < hasta)) return;
    const precio = precioDeOferta_(o, regular, redondeo);
    if (precio === null) return;
    candidatas.push({ oferta: o, desde: desde, hasta: hasta, precio: precio, orden: orden });
  });

  const cortes = [];
  candidatas.forEach(function (c) {
    [c.desde, c.hasta].forEach(function (t) {
      if (isFinite(t) && cortes.indexOf(t) === -1) cortes.push(t);
    });
  });
  cortes.sort(function (a, b) {
    return a - b;
  });
  const limites = [-Infinity].concat(cortes, [Infinity]);

  const tramos = [];
  for (let i = 0; i < limites.length - 1; i++) {
    const ini = limites[i];
    const fin = limites[i + 1];
    let ganadora = null;
    candidatas.forEach(function (c) {
      if (!(c.desde <= ini && c.hasta >= fin)) return;
      if (!ganadora) return void (ganadora = c);
      const a = c.oferta.prioridad || 0;
      const b = ganadora.oferta.prioridad || 0;
      if (a > b || (a === b && regular - c.precio > regular - ganadora.precio)) ganadora = c;
    });
    const anterior = tramos[tramos.length - 1];
    if (anterior && (anterior.ganadora ? anterior.ganadora.oferta.id : null) === (ganadora ? ganadora.oferta.id : null) &&
        (anterior.ganadora ? anterior.ganadora.precio : regular) === (ganadora ? ganadora.precio : regular)) {
      anterior.fin = fin;
    } else {
      tramos.push({ ini: ini, fin: fin, ganadora: ganadora });
    }
  }

  const ahoraMs = contexto.ahora ? contexto.ahora.getTime() : null;
  const vigentes = tramos.filter(function (t) {
    return ahoraMs === null || t.fin > ahoraMs;
  });
  const ventanas = vigentes.map(function (t, i) {
    const g = t.ganadora;
    const pct = g ? porcentajeDescuentoGas_(regular, g.precio) : 0;
    return {
      desde: i === 0 || !isFinite(t.ini) ? null : aIso_(new Date(t.ini)),
      hasta: isFinite(t.fin) ? aIso_(new Date(t.fin)) : null,
      precio: g ? g.precio : regular,
      antes: g ? regular : null,
      descuento_pct: pct >= 1 ? pct : null,
      etiqueta: g && g.oferta.etiqueta ? g.oferta.etiqueta : null,
      liquidacion: g ? Boolean(g.oferta.es_liquidacion) : false,
      // La cuenta regresiva solo es honesta si la ventana termina cuando termina la oferta, no cuando entra otra.
      cuenta_regresiva: g ? Boolean(g.oferta.cuenta_regresiva) && isFinite(t.fin) && t.fin === g.hasta : false,
      oferta_id: g ? g.oferta.id : null,
    };
  });
  return { regular: regular, ventanas: ventanas };
}

// Secciones (manuales, de categoría o de etiqueta) y temporadas a las que pertenece una prenda.
// Las secciones automáticas (novedades, ofertas…) no cuentan: dependerían de las propias ofertas.
function pertenenciasDe_(producto, secciones, temporadaFotos) {
  const enSecciones = secciones
    .filter(function (s) {
      if (s.tipo === 'manual') return s.productos.indexOf(producto.id) !== -1;
      if (s.tipo === 'categoria') return Boolean(s.parametro) && s.parametro === producto.categoria_id;
      if (s.tipo === 'etiqueta') return Boolean(s.parametro) && (producto.etiquetas || []).indexOf(s.parametro) !== -1;
      return false;
    })
    .map(function (s) {
      return s.id;
    });
  const temporadas = [];
  temporadaFotos.forEach(function (f) {
    if (f.productos.indexOf(producto.id) !== -1 && temporadas.indexOf(f.temporada_id) === -1) temporadas.push(f.temporada_id);
  });
  return { secciones: enSecciones, temporadas: temporadas };
}

function vistaPreviaPrecios(opciones) {
  requireAdmin_();
  opciones = opciones || {};
  const productos = leerTabla_('productos');
  const producto = productos.filas.filter(function (p) {
    return p.id === opciones.producto_id;
  })[0];
  if (!producto) fallar_('no_encontrado', 'no existe la prenda «' + opciones.producto_id + '»');
  if (!(producto.precio_regular > 0)) fallar_('invalido', 'la prenda todavía no tiene precio regular');

  const tablaOfertas = leerTabla_('ofertas');
  const memo = { productos: productos, ofertas: tablaOfertas };
  let ofertas = tablaOfertas.filas.map(limpiarFila_);
  if (opciones.oferta) {
    const datos = opciones.oferta;
    const existente = datos.id
      ? ofertas.filter(function (o) {
          return o.id === datos.id;
        })[0]
      : null;
    const fila = existente ? clonarFila_(existente) : Object.assign(defectosDe_('ofertas', aIso_(ahora_())), { id: 'ofe_00000000', version: 1 });
    Object.keys(datos).forEach(function (campo) {
      if (campo === 'id') return;
      if (ESQUEMA.ofertas.indexOf(campo) === -1 || COLUMNAS_SISTEMA.indexOf(campo) !== -1) fallar_('invalido', 'no existe la columna «' + campo + '»');
      fila[campo] = validarValor_('ofertas', campo, datos[campo], memo);
    });
    if (fila.alcance === 'tienda') fila.objetivos = [];
    fila.activa = true; // la vista previa muestra el efecto aunque todavía no esté activa
    validarFila_('ofertas', fila, memo);
    ofertas = ofertas
      .filter(function (o) {
        return o.id !== fila.id;
      })
      .concat([fila]);
  }
  const pertenencia = pertenenciasDe_(producto, leerTabla_('secciones').filas, leerTabla_('temporada_fotos').filas);
  return ventanasDePrecio_(producto, ofertas, {
    redondeo: String(leerConfig_().redondeo),
    secciones: pertenencia.secciones,
    temporadas: pertenencia.temporadas,
    ahora: null,
  });
}
