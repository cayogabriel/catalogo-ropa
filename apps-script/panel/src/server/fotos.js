// Fotos: subir (con revisión de privacidad), miniaturas, biblioteca y alta rápida.
// Las fotos quedan privadas en Drive; la API pública solo entrega las que figuran en la copia publicada.

const MAX_BYTES_FOTO_PANEL = 8 * 1024 * 1024;
const DESTINOS_FOTO = ['producto', 'temporada', 'portada', 'marca'];
const EXTENSION_DE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const NOMBRE_DE_MIME = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP' };
const CARPETAS_BIBLIOTECA = ['fotos', 'temporadas', 'portadas', 'marca'];
const FOTOS_POR_PAGINA = 40;
const MAX_IDS_MINIATURAS = 40;

// ¿Tiene el JPEG un bloque EXIF (segmento APP1 que empieza con «Exif»)? Recorre los segmentos de
// la cabecera; el contenido de la imagen (después de SOS) no se mira. `b`: bytes, con o sin signo.
function jpegTieneExif_(b) {
  const byte = function (i) {
    return b[i] & 255;
  };
  let i = 2; // después de FF D8
  while (i + 3 < b.length) {
    if (byte(i) !== 0xff) return false; // cabecera mal formada: no seguimos adivinando
    const marcador = byte(i + 1);
    if (marcador === 0xff) {
      i += 1; // relleno
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      i += 2; // marcadores sin longitud
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) return false; // fin o inicio de los datos de imagen
    const largo = (byte(i + 2) << 8) | byte(i + 3);
    if (largo < 2) return false;
    if (marcador === 0xe1 && byte(i + 4) === 0x45 && byte(i + 5) === 0x78 && byte(i + 6) === 0x69 && byte(i + 7) === 0x66) return true;
    i += 2 + largo;
  }
  return false;
}

function firmaCoincide_(mime, b) {
  const byte = function (i) {
    return b[i] & 255;
  };
  if (mime === 'image/jpeg') return b.length > 3 && byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
  if (mime === 'image/png') return b.length > 8 && byte(0) === 0x89 && byte(1) === 0x50 && byte(2) === 0x4e && byte(3) === 0x47;
  return b.length > 12 && byte(0) === 0x52 && byte(1) === 0x49 && byte(2) === 0x46 && byte(3) === 0x46 && byte(8) === 0x57 && byte(9) === 0x45 && byte(10) === 0x42 && byte(11) === 0x50;
}

function baseDeNombre_(nombre) {
  const sinRuta = String(nombre).split(/[\\\/]/).pop();
  const sinExtension = sinRuta.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const limpio = sinExtension
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return limpio || 'foto';
}

function subirFoto(archivo) {
  requireAdmin_();
  const mal = function (detalle) {
    fallar_('invalido', detalle);
  };
  if (!archivo || typeof archivo !== 'object') mal('falta la foto');
  if (typeof archivo.nombre !== 'string' || !archivo.nombre.trim()) mal('la foto necesita un nombre');
  if (!EXTENSION_DE_MIME[archivo.mime]) mal('la foto debe ser jpeg, png o webp (no ' + archivo.mime + ')');
  if (DESTINOS_FOTO.indexOf(archivo.destino) === -1) mal('destino: debe ser ' + DESTINOS_FOTO.join(', '));
  const texto = typeof archivo.base64 === 'string' ? archivo.base64.replace(/\s+/g, '') : '';
  if (!texto) mal('la foto está vacía');
  if (texto.length > Math.ceil((MAX_BYTES_FOTO_PANEL * 4) / 3) + 8) fallar_('limite', 'la foto pesa más de 8 MB');
  if (!/^[A-Za-z0-9+\/]+={0,2}$/.test(texto) || texto.length % 4 !== 0) mal('la foto no viene en base64 válido (sin el prefijo data:)');
  const bytes = Utilities.base64Decode(texto);
  if (bytes.length > MAX_BYTES_FOTO_PANEL) fallar_('limite', 'la foto pesa más de 8 MB');
  if (!firmaCoincide_(archivo.mime, bytes)) mal('el archivo no es un ' + NOMBRE_DE_MIME[archivo.mime] + ' de verdad');
  if (archivo.mime === 'image/jpeg' && jpegTieneExif_(bytes)) {
    mal('la foto trae datos EXIF (pueden incluir la ubicación). La interfaz debe re-codificarla antes de subirla');
  }

  return conCandado_(function () {
    let prefijo;
    let destino;
    if (archivo.destino === 'producto') {
      destino = carpeta_('fotos');
      prefijo = 'foto';
      if (archivo.producto_id) {
        const p = leerTabla_('productos').filas.filter(function (f) {
          return f.id === archivo.producto_id;
        })[0];
        if (!p) fallar_('no_encontrado', 'no existe la prenda «' + archivo.producto_id + '»');
        prefijo = p.codigo;
      }
    } else if (archivo.destino === 'temporada') {
      if (!archivo.temporada_id) mal('temporada_id: falta la temporada de la foto');
      const t = leerTabla_('temporadas').filas.filter(function (f) {
        return f.id === archivo.temporada_id;
      })[0];
      if (!t) fallar_('no_encontrado', 'no existe la temporada «' + archivo.temporada_id + '»');
      destino = subcarpeta_(carpeta_('temporadas'), t.slug);
      prefijo = t.slug;
    } else {
      destino = carpeta_(archivo.destino === 'portada' ? 'portadas' : 'marca');
      prefijo = archivo.destino;
    }
    const sufijo = idNuevo_('x').slice(2, 6);
    const nombre = prefijo + '-' + baseDeNombre_(archivo.nombre) + '-' + sufijo + '.' + EXTENSION_DE_MIME[archivo.mime];
    const creado = destino.createFile(Utilities.newBlob(bytes, archivo.mime, nombre));
    marcarCambio_();
    return { id: creado.getId(), nombre: nombre, miniatura: miniaturaDe_(creado) };
  });
}

function miniaturas(ids) {
  requireAdmin_();
  if (!Array.isArray(ids)) fallar_('invalido', 'ids: debe ser una lista');
  if (ids.length > MAX_IDS_MINIATURAS) fallar_('limite', 'máximo ' + MAX_IDS_MINIATURAS + ' fotos por vez');
  const salida = {};
  ids.forEach(function (id) {
    if (typeof id !== 'string' || !PATRON_FOTO_ID.test(id)) return;
    const archivo = abrirArchivo_(id);
    if (!archivo || !esImagen_(archivo.getMimeType())) return;
    const m = miniaturaDe_(archivo);
    if (m) salida[id] = m;
  });
  return salida;
}

// Quién usa cada foto, por id: { idFoto: [{ entidad, id, etiqueta }] }.
function usosDeFotos_() {
  const usos = {};
  const agregar = function (foto, uso) {
    if (!foto) return;
    (usos[foto] = usos[foto] || []).push(uso);
  };
  leerTabla_('productos').filas.forEach(function (p) {
    p.fotos.forEach(function (f) {
      agregar(f, { entidad: 'productos', id: p.id, etiqueta: p.codigo + ' · ' + p.nombre });
    });
  });
  leerTabla_('categorias').filas.forEach(function (c) {
    agregar(c.foto, { entidad: 'categorias', id: c.id, etiqueta: c.nombre });
  });
  leerTabla_('portadas').filas.forEach(function (p) {
    agregar(p.foto_escritorio, { entidad: 'portadas', id: p.id, etiqueta: p.titulo || p.id });
    if (p.foto_movil !== p.foto_escritorio) agregar(p.foto_movil, { entidad: 'portadas', id: p.id, etiqueta: p.titulo || p.id });
  });
  const temporadas = leerTabla_('temporadas').filas;
  temporadas.forEach(function (t) {
    agregar(t.foto_portada, { entidad: 'temporadas', id: t.id, etiqueta: t.nombre });
  });
  leerTabla_('temporada_fotos').filas.forEach(function (f) {
    const t = temporadas.filter(function (x) {
      return x.id === f.temporada_id;
    })[0];
    agregar(f.foto, { entidad: 'temporada_fotos', id: f.id, etiqueta: (t ? t.nombre : 'Temporada') + ' · foto ' + f.orden });
  });
  const logo = leerConfig_().logo;
  if (logo) agregar(String(logo), { entidad: 'config', id: 'logo', etiqueta: 'Logo de la tienda' });
  return usos;
}

function recorrerImagenes_(carpeta, nombreCarpeta, salida) {
  const archivos = carpeta.getFiles();
  while (archivos.hasNext()) {
    const a = archivos.next();
    if (a.isTrashed() || !esImagen_(a.getMimeType())) continue;
    salida.push({ id: a.getId(), nombre: a.getName(), carpeta: nombreCarpeta, actualizadoMs: a.getLastUpdated().getTime() });
  }
  const subcarpetas = carpeta.getFolders();
  while (subcarpetas.hasNext()) {
    const sub = subcarpetas.next();
    if (!sub.isTrashed()) recorrerImagenes_(sub, nombreCarpeta, salida);
  }
}

function biblioteca(opciones) {
  requireAdmin_();
  opciones = opciones || {};
  if (opciones.carpeta !== undefined && CARPETAS_BIBLIOTECA.indexOf(opciones.carpeta) === -1) {
    fallar_('invalido', 'carpeta: debe ser ' + CARPETAS_BIBLIOTECA.join(', '));
  }
  const pagina = Math.max(1, Math.floor(Number(opciones.pagina) || 1));
  const todas = [];
  (opciones.carpeta ? [opciones.carpeta] : CARPETAS_BIBLIOTECA).forEach(function (nombre) {
    recorrerImagenes_(carpeta_(nombre), nombre, todas);
  });
  todas.sort(function (a, b) {
    return b.actualizadoMs - a.actualizadoMs;
  });
  const usos = usosDeFotos_();
  const fotos = todas.slice((pagina - 1) * FOTOS_POR_PAGINA, pagina * FOTOS_POR_PAGINA).map(function (f) {
    return { id: f.id, nombre: f.nombre, carpeta: f.carpeta, actualizado: aIso_(new Date(f.actualizadoMs)), usos: usos[f.id] || [] };
  });
  return { fotos: fotos, pagina: pagina, total: todas.length };
}

function altaRapida(fotoIds, opciones) {
  requireAdmin_();
  opciones = opciones || {};
  if (!Array.isArray(fotoIds) || !fotoIds.length) fallar_('invalido', 'fotoIds: elige al menos una foto');
  if (fotoIds.length > MAX_IDS_MINIATURAS) fallar_('limite', 'máximo ' + MAX_IDS_MINIATURAS + ' fotos por vez');
  if (!opciones.categoria_id) fallar_('invalido', 'categoria_id: elige la categoría de las prendas nuevas');
  return conCandado_(function () {
    if (!existeId_({}, 'categorias', opciones.categoria_id)) fallar_('invalido', 'categoria id: «' + opciones.categoria_id + '» no existe');
    const archivos = fotoIds.map(function (id) {
      const a = typeof id === 'string' && PATRON_FOTO_ID.test(id) ? abrirArchivo_(id) : null;
      if (!a) fallar_('no_encontrado', 'la foto «' + id + '» no existe en Drive');
      if (!esImagen_(a.getMimeType())) fallar_('invalido', 'el archivo «' + id + '» no es una imagen');
      return a;
    });
    return archivos.map(function (a) {
      const fila = crearInterno_('productos', { fotos: [a.getId()], categoria_id: opciones.categoria_id }, 'crear');
      try {
        a.setName(fila.codigo + '-1.' + EXTENSION_DE_MIME[a.getMimeType()]);
      } catch (e) {
        // renombrar es solo una comodidad: la prenda ya está creada
      }
      return limpiarFila_(fila);
    });
  });
}
