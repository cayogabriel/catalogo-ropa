// Arma la copia publicada (catalog.schema.json) a partir de lo que hay en la hoja.
// armarCatalogo_ es puro: recibe los datos ya leídos y una función para consultar las fotos en Drive.
// El resultado debe cumplir validarCatalogo de @catalogo/contratos (los tests lo comprueban).

const DIAS_CLICS = 30;
const LIMITE_SECCION_DEFECTO = 12;

// Temporada activa: la forzada («si»; si hay varias, la de `desde` más reciente) o, si no hay, la que
// contiene «ahora» con el `desde` más reciente. Las apagadas («no») nunca.
function temporadaActiva_(temporadas, ahora) {
  const ms = ahora.getTime();
  const desdeDe = function (t) {
    return t.desde ? Date.parse(t.desde) : -Infinity;
  };
  const masReciente = function (lista) {
    return lista.slice().sort(function (a, b) {
      return desdeDe(b) - desdeDe(a);
    })[0] || null;
  };
  const forzada = masReciente(
    temporadas.filter(function (t) {
      return t.activa_manual === 'si';
    }),
  );
  if (forzada) return forzada;
  return masReciente(
    temporadas.filter(function (t) {
      if (t.activa_manual === 'no') return false;
      return desdeDe(t) <= ms && ms < (t.hasta ? Date.parse(t.hasta) : Infinity);
    }),
  );
}

function sumarDias_(dia, dias) {
  return new Date(Date.parse(dia + 'T12:00:00Z') + dias * 86400000).toISOString().slice(0, 10);
}

function textoAlt_(texto) {
  return String(texto).slice(0, 200);
}

// datos: { config, productos, categorias, secciones, portadas, ofertas, temporadas, temporada_fotos, paletas,
//          vendedoras, textos, clics: {producto_id: clics de WhatsApp en 30 días} }
// resolverFoto(id, donde) → ISO de la última modificación en Drive; lanza `invalido` si ya no existe.
// → { catalogo, nuevosPublicados: [ids de prendas que se publican por primera vez] }
function armarCatalogo_(datos, ahora, resolverFoto) {
  const config = datos.config;
  const nombreTienda = String(config.tienda_nombre || '').trim();
  if (!nombreTienda) fallar_('invalido', 'la tienda todavía no tiene nombre: escríbelo en Configuración antes de publicar');
  const mal = function (detalle) {
    fallar_('invalido', detalle);
  };

  // --- fotos: se registran al usarlas; al final se consultan una sola vez cada una
  const usadas = {};
  const foto = function (id, alt, donde) {
    if (!(id in usadas)) usadas[id] = donde;
    return { id: id, alt: textoAlt_(alt) };
  };
  const fotoONull = function (id, alt, donde) {
    return id ? foto(id, alt, donde) : null;
  };

  // --- vendedoras
  const vendedoras = datos.vendedoras
    .filter(function (v) {
      return v.activa;
    })
    .map(function (v) {
      if (!/^[0-9]{8,15}$/.test(v.whatsapp)) mal('la vendedora «' + v.nombre + '» no tiene un número de WhatsApp válido');
      return { id: v.id, nombre: v.nombre, whatsapp: v.whatsapp, por_defecto: Boolean(v.por_defecto) };
    });
  if (!vendedoras.length) mal('falta al menos una vendedora activa con su número de WhatsApp');
  const porDefecto = vendedoras.filter(function (v) {
    return v.por_defecto;
  }).length;
  if (porDefecto !== 1) mal('debe haber exactamente una vendedora activa por defecto (hay ' + porDefecto + ')');
  const idsVendedora = vendedoras.map(function (v) {
    return v.id;
  });

  // --- categorías visibles (una categoría oculta oculta sus prendas)
  const categoriasVisibles = datos.categorias
    .filter(function (c) {
      return c.visible;
    })
    .sort(porOrden_);
  const idsCategoria = categoriasVisibles.map(function (c) {
    return c.id;
  });

  // --- prendas publicadas
  const umbral = Number(config.umbral_ultimas_unidades);
  const diasNuevo = Number(config.dias_nuevo);
  const minClics = Number(config.min_clics_mas_consultados);
  const nuevosPublicados = [];
  const redondeo = String(config.redondeo);
  const prendas = datos.productos
    .filter(function (p) {
      return (p.estado === 'publicado' || p.estado === 'agotado') && idsCategoria.indexOf(p.categoria_id) !== -1;
    })
    .sort(porOrdenYCodigo_);
  const productos = prendas.map(function (p) {
    if (!p.fotos.length) mal('la prenda ' + p.codigo + ' no tiene fotos');
    if (!(p.precio_regular > 0)) mal('la prenda ' + p.codigo + ' no tiene precio');
    if (!p.nombre) mal('la prenda ' + p.codigo + ' no tiene nombre');
    const publicadoEn = p.publicado_en ? Date.parse(p.publicado_en) : ahora.getTime();
    if (!p.publicado_en) nuevosPublicados.push(p.id);
    const alt = p.texto_alt || (p.nombre + (p.colores.length ? ' ' + p.colores[0] : ''));
    const pertenencia = pertenenciasDe_(p, datos.secciones, datos.temporada_fotos);
    const precio = ventanasDePrecio_(p, datos.ofertas, { redondeo: redondeo, secciones: pertenencia.secciones, temporadas: pertenencia.temporadas, ahora: ahora });
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria_id: p.categoria_id,
      tallas: p.tallas,
      tallas_agotadas: p.tallas_agotadas,
      colores: p.colores,
      fotos: p.fotos.map(function (f) {
        return foto(f, alt, p.codigo);
      }),
      etiquetas: p.etiquetas,
      estado: p.estado,
      vendedora_id: p.vendedora_id && idsVendedora.indexOf(p.vendedora_id) !== -1 ? p.vendedora_id : null,
      orden: p.orden === null ? 0 : p.orden,
      nuevo: ahora.getTime() - publicadoEn <= diasNuevo * 86400000,
      ultimas_unidades: p.stock !== null && p.stock >= 1 && p.stock <= umbral,
      popularidad: null,
      precio: { regular: precio.regular, ventanas: precio.ventanas },
      _publicadoEn: publicadoEn,
    };
  });

  // --- popularidad: solo con clics reales de WhatsApp (mínimo configurado en 30 días)
  productos
    .filter(function (p) {
      return (datos.clics[p.id] || 0) >= minClics;
    })
    .sort(function (a, b) {
      return datos.clics[b.id] - datos.clics[a.id] || porOrdenYCodigo_(a, b);
    })
    .forEach(function (p, i) {
      p.popularidad = i + 1;
    });
  const productoPorId = {};
  productos.forEach(function (p) {
    productoPorId[p.id] = p;
  });

  // --- temporadas
  const activa = temporadaActiva_(datos.temporadas, ahora);
  const incluidas = datos.temporadas
    .filter(function (t) {
      return (activa && t.id === activa.id) || t.visible_en_web || t.revista;
    })
    .sort(function (a, b) {
      return (b.desde ? Date.parse(b.desde) : 0) - (a.desde ? Date.parse(a.desde) : 0);
    });
  const hoy = diaLima_(ahora);
  const temporadas = incluidas.map(function (t) {
    if (!t.foto_portada) mal('la temporada «' + t.nombre + '» no tiene foto de portada');
    const fotos = datos.temporada_fotos
      .filter(function (f) {
        return f.temporada_id === t.id;
      })
      .sort(porOrden_)
      .map(function (f) {
        if (!f.foto) mal('una foto de la temporada «' + t.nombre + '» no tiene archivo');
        const prendasDeFoto = f.productos.filter(function (id) {
          return id in productoPorId;
        });
        const nombres = prendasDeFoto.slice(0, 3).map(function (id) {
          return productoPorId[id].nombre;
        });
        return {
          id: f.id,
          foto: foto(f.foto, f.texto_alt || nombres.join(', ') || f.texto || 'Foto de ' + t.nombre, 'la temporada «' + t.nombre + '»'),
          tipo: f.tipo,
          productos: prendasDeFoto,
          texto: f.texto,
          destacada: f.destacada,
        };
      });
    // «Precios válidos hasta»: hoy + días, o el último día de la oferta vigente más próxima de sus prendas.
    const dias = t.vigencia_dias || Number(config.vigencia_dias_defecto);
    let vigencia = sumarDias_(hoy, dias);
    fotos.forEach(function (f) {
      f.productos.forEach(function (id) {
        const vigente = productoPorId[id].precio.ventanas.filter(function (v) {
          return (v.desde === null || Date.parse(v.desde) <= ahora.getTime()) && (v.hasta === null || ahora.getTime() < Date.parse(v.hasta));
        })[0];
        if (vigente && vigente.hasta !== null) {
          const ultimoDia = diaLima_(new Date(Date.parse(vigente.hasta) - 1));
          if (ultimoDia < vigencia) vigencia = ultimoDia;
        }
      });
    });
    return {
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      titulo: t.titulo,
      subtitulo: t.subtitulo,
      intro: t.intro,
      cierre: t.cierre,
      paleta_id: t.paleta_id,
      foto_portada: foto(t.foto_portada, 'Portada de la temporada ' + t.nombre, 'la temporada «' + t.nombre + '»'),
      desde: t.desde,
      hasta: t.hasta,
      visible_en_web: t.visible_en_web,
      revista: t.revista,
      vigencia_hasta: vigencia,
      fotos: fotos,
    };
  });
  const activaId = activa ? activa.id : null;
  const deEstaTemporada = function (temporadaId) {
    return !temporadaId || temporadaId === activaId;
  };

  // --- secciones
  const secciones = datos.secciones
    .filter(function (s) {
      return s.visible && deEstaTemporada(s.temporada_id);
    })
    .sort(porOrden_)
    .map(function (s) {
      if (!s.titulo) mal('hay una sección visible sin título');
      return {
        id: s.id,
        titulo: s.titulo,
        subtitulo: s.subtitulo,
        tipo: s.tipo,
        diseno: s.diseno,
        orden: s.orden === null ? 0 : s.orden,
        productos: productosDeSeccion_(s, productos, ahora).slice(0, s.limite || LIMITE_SECCION_DEFECTO),
      };
    });

  // --- portadas
  const portadas = datos.portadas
    .filter(function (p) {
      return p.activa && deEstaTemporada(p.temporada_id) && (!p.hasta || Date.parse(p.hasta) > ahora.getTime());
    })
    .sort(porOrden_)
    .map(function (p) {
      if (!p.foto_escritorio) mal('la portada «' + (p.titulo || p.id) + '» no tiene foto');
      const alt = p.titulo || 'Portada de ' + nombreTienda;
      return {
        id: p.id,
        titulo: p.titulo,
        subtitulo: p.subtitulo,
        boton_texto: p.boton_texto,
        boton_destino: p.boton_destino && p.boton_destino.charAt(0) === '/' ? p.boton_destino : '/',
        foto_escritorio: foto(p.foto_escritorio, alt, 'la portada «' + (p.titulo || p.id) + '»'),
        foto_movil: fotoONull(p.foto_movil, alt, 'la portada «' + (p.titulo || p.id) + '»'),
        desde: p.desde,
        hasta: p.hasta,
        orden: p.orden === null ? 0 : p.orden,
        temporada_id: p.temporada_id || null,
      };
    });

  // --- paletas usadas: la del tema (la de la temporada activa o la de la tienda) y las de las temporadas incluidas
  const temaId = activa ? activa.paleta_id : String(config.paleta_defecto);
  const paletas = {};
  [temaId].concat(
    temporadas.map(function (t) {
      return t.paleta_id;
    }),
  ).forEach(function (id) {
    if (id in paletas) return;
    const p = datos.paletas.filter(function (x) {
      return x.id === id;
    })[0];
    if (!p) mal('la paleta «' + id + '» no existe');
    paletas[id] = { nombre: p.nombre, tokens: validarTokens_(p.tokens), fuentes: { titulos: p.fuente_titulos, texto: p.fuente_texto }, radio: p.radio };
  });

  // --- textos (las claves que empiezan con _ son notas internas y no se publican)
  const textos = {};
  datos.textos.forEach(function (t) {
    if (t.clave.charAt(0) !== '_') textos[t.clave] = t.valor;
  });

  const red = function (valor) {
    return valor ? String(valor) : null;
  };
  const logo = config.logo ? foto(String(config.logo), 'Logo de ' + nombreTienda, 'el logo de la tienda') : null;
  const categorias = categoriasVisibles.map(function (c) {
    return { id: c.id, nombre: c.nombre, slug: c.slug, orden: c.orden === null ? 0 : c.orden, foto: fotoONull(c.foto, c.nombre, 'la categoría «' + c.nombre + '»') };
  });

  // --- índice de fotos (lista blanca exacta): cada foto usada y nada más
  const indice = {};
  Object.keys(usadas).forEach(function (id) {
    indice[id] = { actualizado: resolverFoto(id, usadas[id]) };
  });

  productos.forEach(function (p) {
    delete p._publicadoEn;
  });
  return {
    catalogo: {
      version_esquema: 1,
      generado_en: aIso_(ahora),
      tienda: {
        nombre: nombreTienda,
        eslogan: String(config.tienda_eslogan || ''),
        logo: logo,
        moneda: { simbolo: String(config.moneda_simbolo), codigo: String(config.moneda_codigo) },
        pais_codigo: String(config.pais_codigo),
        zona_horaria: String(config.zona_horaria),
        redes: { instagram: red(config.instagram), facebook: red(config.facebook), tiktok: red(config.tiktok) },
        horario: String(config.horario || ''),
        envios: String(config.envios || ''),
        sitio_url: String(config.sitio_url),
        inicio_modo: String(config.inicio_modo),
      },
      tema_paleta_id: temaId,
      paletas: paletas,
      textos: textos,
      vendedoras: vendedoras,
      categorias: categorias,
      productos: productos,
      secciones: secciones,
      portadas: portadas,
      temporadas: temporadas,
      temporada_activa_id: activaId,
      fotos: indice,
    },
    nuevosPublicados: nuevosPublicados,
  };
}

function porOrden_(a, b) {
  const x = a.orden === null ? Infinity : a.orden;
  const y = b.orden === null ? Infinity : b.orden;
  return x === y ? 0 : x < y ? -1 : 1;
}

function porOrdenYCodigo_(a, b) {
  return porOrden_(a, b) || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
}

// Ids de prendas de una sección, en su orden. Las automáticas se calculan con lo que hay publicado.
function productosDeSeccion_(seccion, productos, ahora) {
  const ids = function (lista) {
    return lista.map(function (p) {
      return p.id;
    });
  };
  const vigente = function (p) {
    return p.precio.ventanas.filter(function (v) {
      return (v.desde === null || Date.parse(v.desde) <= ahora.getTime()) && (v.hasta === null || ahora.getTime() < Date.parse(v.hasta));
    })[0];
  };
  const conOferta = function (liquidacion) {
    // candidatas: tienen una ventana con oferta (vigente o próxima); la web muestra las vigentes a su hora
    const candidatas = productos.filter(function (p) {
      return p.precio.ventanas.some(function (v) {
        return v.oferta_id !== null && v.liquidacion === liquidacion;
      });
    });
    const vigencia = function (p) {
      const v = vigente(p);
      return v && v.oferta_id !== null && v.liquidacion === liquidacion ? 0 : 1;
    };
    return candidatas
      .map(function (p, i) {
        return { p: p, i: i };
      })
      .sort(function (a, b) {
        return vigencia(a.p) - vigencia(b.p) || a.i - b.i;
      })
      .map(function (x) {
        return x.p;
      });
  };
  switch (seccion.tipo) {
    case 'manual': {
      const porId = {};
      productos.forEach(function (p) {
        porId[p.id] = p;
      });
      return seccion.productos.filter(function (id) {
        return id in porId;
      });
    }
    case 'novedades':
      return ids(
        productos
          .filter(function (p) {
            return p.nuevo;
          })
          .sort(function (a, b) {
            return b._publicadoEn - a._publicadoEn;
          }),
      );
    case 'ofertas':
      return ids(conOferta(false));
    case 'liquidacion':
      return ids(conOferta(true));
    case 'mas_consultados':
      return ids(
        productos
          .filter(function (p) {
            return p.popularidad !== null;
          })
          .sort(function (a, b) {
            return a.popularidad - b.popularidad;
          }),
      );
    case 'categoria':
      return ids(
        productos.filter(function (p) {
          return p.categoria_id === seccion.parametro;
        }),
      );
    case 'etiqueta':
      return ids(
        productos.filter(function (p) {
          return p.etiquetas.indexOf(seccion.parametro) !== -1;
        }),
      );
  }
  return [];
}
