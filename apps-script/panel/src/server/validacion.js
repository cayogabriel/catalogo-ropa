// Reglas de cada columna y de cada fila según docs/contracts/modelo-datos.md.
// Todo error es «invalido: …» (o «no_encontrado» / «limite»), con un texto que la dueña pueda entender.

const PATRON_FOTO_ID = /^[A-Za-z0-9_-]{10,100}$/;
const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATRON_ID_GENERICO = /^[a-z]{3}_[0-9a-f]{8}$/;
const PATRON_PALETA_ID = /^([a-z0-9]+(-[a-z0-9]+)*|pal_[0-9a-f]{8})$/;
const PATRON_RUTA_INTERNA = /^\/[A-Za-z0-9\/_.?=&%-]{0,199}$/;

const ESTADOS_PRODUCTO = ['borrador', 'publicado', 'agotado', 'archivado'];

const TOKENS_PALETA = [
  '--color-fondo', '--color-superficie', '--color-texto', '--color-texto-suave', '--color-borde', '--color-control',
  '--color-primario', '--color-sobre-primario', '--color-acento', '--color-sobre-acento', '--color-oferta',
  '--color-sobre-oferta', '--color-liquidacion', '--color-sobre-liquidacion', '--color-exito', '--color-foco',
];

// Reglas por columna. Claves: max (largo), enum, patron (RegExp), ref (entidad donde debe existir el id),
// min / minExclusivo / maxNum (números), entero, maxItems / itemMax / itemPatron / itemRef (listas), foto (id de Drive).
const REGLAS = {
  productos: {
    codigo: { patron: /^[A-Z]{3}-[0-9]{3,4}$/, que: 'el código debe verse así: VES-014' },
    nombre: { max: 80 },
    descripcion: { max: 600 },
    categoria_id: { ref: 'categorias' },
    precio_regular: { minExclusivo: 0, maxNum: 1000000 },
    stock: { entero: true, min: 0, maxNum: 100000 },
    tallas: { maxItems: 30, itemMax: 12 },
    tallas_agotadas: { maxItems: 30, itemMax: 12 },
    colores: { maxItems: 30, itemMax: 30 },
    fotos: { maxItems: 20, itemPatron: PATRON_FOTO_ID },
    texto_alt: { max: 200 },
    etiquetas: { maxItems: 20, itemMax: 30 },
    estado: { enum: ESTADOS_PRODUCTO },
    vendedora_id: { ref: 'vendedoras' },
    orden: { maxNum: 1000000 },
  },
  categorias: {
    nombre: { max: 60 },
    slug: { patron: PATRON_SLUG, max: 60, que: 'el enlace solo puede llevar letras minúsculas, números y guiones' },
    prefijo_codigo: { patron: /^[A-Z]{3}$/, que: 'el prefijo son 3 letras mayúsculas (por ejemplo VES)' },
    orden: { maxNum: 1000000 },
    foto: { foto: true },
  },
  secciones: {
    titulo: { max: 80 },
    subtitulo: { max: 160 },
    tipo: { enum: ['manual', 'novedades', 'ofertas', 'liquidacion', 'mas_consultados', 'categoria', 'etiqueta'] },
    parametro: { max: 80 },
    productos: { maxItems: 200, itemPatron: PATRON_ID_GENERICO, itemRef: 'productos' },
    diseno: { enum: ['carrusel', 'grilla', 'destacado'] },
    limite: { entero: true, min: 1, maxNum: 100 },
    orden: { maxNum: 1000000 },
    temporada_id: { ref: 'temporadas' },
  },
  portadas: {
    titulo: { max: 80 },
    subtitulo: { max: 160 },
    boton_texto: { max: 30 },
    boton_destino: { patron: PATRON_RUTA_INTERNA, que: 'el destino debe ser una ruta interna que empiece con /' },
    foto_escritorio: { foto: true },
    foto_movil: { foto: true },
    orden: { maxNum: 1000000 },
    temporada_id: { ref: 'temporadas' },
  },
  ofertas: {
    nombre: { max: 80 },
    tipo: { enum: ['porcentaje', 'monto', 'precio_final'] },
    valor: { minExclusivo: 0, maxNum: 1000000 },
    alcance: { enum: ['producto', 'categoria', 'seccion', 'temporada', 'tienda'] },
    objetivos: { maxItems: 200, itemPatron: PATRON_ID_GENERICO },
    prioridad: { entero: true, minNum: -1000, maxNum: 1000 },
    etiqueta: { max: 24 },
  },
  temporadas: {
    slug: { patron: PATRON_SLUG, max: 60, que: 'el enlace solo puede llevar letras minúsculas, números y guiones' },
    nombre: { max: 60 },
    titulo: { max: 80 },
    subtitulo: { max: 160 },
    intro: { max: 1200 },
    cierre: { max: 1200 },
    paleta_id: { patron: PATRON_PALETA_ID, ref: 'paletas' },
    foto_portada: { foto: true },
    activa_manual: { enum: ['', 'si', 'no'] },
    vigencia_dias: { entero: true, min: 1, maxNum: 365 },
  },
  temporada_fotos: {
    temporada_id: { ref: 'temporadas' },
    orden: { maxNum: 1000000 },
    foto: { foto: true },
    tipo: { enum: ['producto', 'ambiente'] },
    productos: { maxItems: 50, itemPatron: PATRON_ID_GENERICO, itemRef: 'productos' },
    texto: { max: 300 },
    texto_alt: { max: 200 },
  },
  paletas: {
    nombre: { max: 60 },
    temporada: { max: 40 },
    uso: { max: 40 },
    fuente_titulos: { max: 60 },
    fuente_texto: { max: 60 },
    radio: { patron: /^[0-9]{1,3}(px|rem)$/, que: 'el radio se escribe así: 12px' },
    origen: { enum: ['predefinida', 'propia'] },
  },
  vendedoras: {
    nombre: { max: 60 },
    whatsapp: { patron: /^[0-9]{8,15}$/, que: 'el número va solo con dígitos y código de país (51987654321)' },
  },
};

function nombreLegible_(campo) {
  return campo.replace(/_/g, ' ');
}

// ¿Existe el id en esa entidad? `memo` es un objeto {entidad: tabla} que evita releer la hoja.
function existeId_(memo, entidad, id) {
  if (!memo[entidad]) memo[entidad] = leerTabla_(entidad);
  return memo[entidad].filas.some(function (f) {
    return f.id === id;
  });
}

// Valida y normaliza UN valor de una columna. Devuelve el valor listo para guardar.
function validarValor_(entidad, campo, valor, memo) {
  const tipo = tipoColumna_(entidad, campo);
  const regla = (REGLAS[entidad] || {})[campo] || {};
  const nombre = nombreLegible_(campo);
  const mal = function (detalle) {
    fallar_('invalido', detalle);
  };
  switch (tipo) {
    case 'texto': {
      if (valor === null || valor === undefined) valor = '';
      if (typeof valor !== 'string' && typeof valor !== 'number') mal(nombre + ': debe ser texto');
      valor = String(valor).trim();
      if (regla.max && valor.length > regla.max) mal(nombre + ': máximo ' + regla.max + ' caracteres (tiene ' + valor.length + ')');
      if (regla.enum && regla.enum.indexOf(valor) === -1) mal(nombre + ': debe ser ' + regla.enum.join(', ') + ' (no «' + valor + '»)');
      if (valor !== '' && regla.patron && !regla.patron.test(valor)) mal(nombre + ': ' + (regla.que || 'el formato no es válido'));
      if (valor !== '' && regla.foto && !PATRON_FOTO_ID.test(valor)) mal(nombre + ': no es una foto válida');
      if (valor !== '' && regla.ref && !existeId_(memo, regla.ref, valor)) mal(nombre + ': «' + valor + '» no existe');
      return valor;
    }
    case 'numero': {
      if (valor === null || valor === undefined || valor === '') return null;
      const n = typeof valor === 'number' ? valor : Number(valor);
      if (typeof valor === 'boolean' || !isFinite(n)) mal(nombre + ': debe ser un número');
      if (regla.entero && Math.floor(n) !== n) mal(nombre + ': debe ser un número entero');
      if (regla.min !== undefined && n < regla.min) mal(nombre + ': no puede ser menor que ' + regla.min);
      if (regla.minNum !== undefined && n < regla.minNum) mal(nombre + ': no puede ser menor que ' + regla.minNum);
      if (regla.minExclusivo !== undefined && n <= regla.minExclusivo) mal(nombre + ': debe ser mayor que ' + regla.minExclusivo);
      if (regla.maxNum !== undefined && n > regla.maxNum) mal(nombre + ': es demasiado grande');
      return n;
    }
    case 'booleano':
      if (typeof valor !== 'boolean') mal(nombre + ': debe ser verdadero o falso');
      return valor;
    case 'fecha': {
      if (valor === null || valor === undefined || valor === '') return null;
      const d = deIso_(valor);
      if (!d) mal(nombre + ': la fecha no es válida (usa 2026-12-05T00:00:00-05:00)');
      return aIso_(d);
    }
    case 'lista': {
      if (valor === null || valor === undefined) valor = [];
      if (!Array.isArray(valor)) mal(nombre + ': debe ser una lista');
      const limpio = [];
      valor.forEach(function (x) {
        const t = String(x === null || x === undefined ? '' : x).trim();
        if (t === '') return;
        if (t.indexOf(',') !== -1) mal(nombre + ': «' + t + '» no puede llevar comas');
        if (regla.itemMax && t.length > regla.itemMax) mal(nombre + ': «' + t + '» es demasiado largo');
        if (regla.itemPatron && !regla.itemPatron.test(t)) mal(nombre + ': «' + t + '» no es válido');
        if (regla.itemRef && !existeId_(memo, regla.itemRef, t)) mal(nombre + ': «' + t + '» no existe');
        if (limpio.indexOf(t) === -1) limpio.push(t);
      });
      if (regla.maxItems && limpio.length > regla.maxItems) fallar_('limite', nombre + ': máximo ' + regla.maxItems + ' elementos');
      return limpio;
    }
    case 'json':
      return validarJson_(entidad, campo, valor);
    default:
      return valor;
  }
}

function validarJson_(entidad, campo, valor) {
  if (entidad === 'paletas' && campo === 'tokens') return validarTokens_(valor);
  return valor;
}

// Los 16 tokens con colores #RRGGBB. El contraste NO se exige aquí (el editor solo avisa: validarPaleta).
function validarTokens_(tokens) {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) fallar_('invalido', 'tokens: debe ser un objeto con los 16 colores');
  const salida = {};
  TOKENS_PALETA.forEach(function (t) {
    const v = tokens[t];
    if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) fallar_('invalido', 'tokens: ' + t + ' debe ser un color #RRGGBB');
    salida[t] = v.toUpperCase();
  });
  Object.keys(tokens).forEach(function (k) {
    if (TOKENS_PALETA.indexOf(k) === -1) fallar_('invalido', 'tokens: «' + k + '» no es un token conocido');
  });
  return salida;
}

// Reglas que mezclan campos. `fila` ya trae los valores nuevos. Lanza al primer problema.
function validarFila_(entidad, fila, memo) {
  const mal = function (detalle) {
    fallar_('invalido', detalle);
  };
  const otras = function () {
    if (!memo[entidad]) memo[entidad] = leerTabla_(entidad);
    return memo[entidad].filas.filter(function (f) {
      return f.id !== fila.id;
    });
  };
  const repetido = function (campo) {
    return otras().some(function (f) {
      return f[campo] === fila[campo];
    });
  };
  const ordenadas = function () {
    if (fila.desde && fila.hasta && Date.parse(fila.desde) >= Date.parse(fila.hasta)) mal('la fecha «hasta» debe ser posterior a «desde»');
  };

  switch (entidad) {
    case 'productos': {
      if (fila.codigo && repetido('codigo')) mal('el código ' + fila.codigo + ' ya lo tiene otra prenda');
      if (fila.estado === 'publicado' || fila.estado === 'agotado') {
        const faltan = [];
        if (!fila.nombre) faltan.push('nombre');
        if (!fila.categoria_id) faltan.push('categoría');
        if (!(fila.precio_regular > 0)) faltan.push('precio');
        if (!fila.fotos.length) faltan.push('al menos una foto');
        if (faltan.length) mal('para publicar la prenda falta: ' + faltan.join(', '));
      }
      break;
    }
    case 'categorias':
      if (!fila.nombre) mal('la categoría necesita un nombre');
      if (!fila.slug) mal('la categoría necesita un enlace (slug)');
      if (repetido('slug')) mal('el enlace «' + fila.slug + '» ya lo usa otra categoría');
      if (!fila.prefijo_codigo) mal('la categoría necesita un prefijo de 3 letras');
      if (repetido('prefijo_codigo')) mal('el prefijo ' + fila.prefijo_codigo + ' ya lo usa otra categoría');
      break;
    case 'secciones':
      if (fila.tipo === 'categoria' && fila.parametro && !existeId_(memo, 'categorias', fila.parametro)) {
        mal('parámetro: la categoría «' + fila.parametro + '» no existe');
      }
      break;
    case 'portadas':
      ordenadas();
      if (fila.activa && !fila.foto_escritorio) mal('para activar la portada falta la foto de escritorio');
      break;
    case 'ofertas': {
      ordenadas();
      if (fila.tipo === 'porcentaje' && fila.valor !== null && (fila.valor < 1 || fila.valor > 90)) mal('valor: el porcentaje va de 1 a 90');
      const entidadObjetivo = { producto: 'productos', categoria: 'categorias', seccion: 'secciones', temporada: 'temporadas' }[fila.alcance];
      if (entidadObjetivo) {
        fila.objetivos.forEach(function (id) {
          if (!existeId_(memo, entidadObjetivo, id)) mal('objetivos: «' + id + '» no existe');
        });
      }
      if (fila.activa) {
        if (fila.valor === null) mal('para activar la oferta falta el valor');
        if (fila.alcance !== 'tienda' && !fila.objetivos.length) mal('para activar la oferta elige a qué se aplica');
      }
      break;
    }
    case 'temporadas':
      ordenadas();
      if (!fila.nombre) mal('la temporada necesita un nombre');
      if (!fila.slug) mal('la temporada necesita un enlace (slug)');
      if (repetido('slug')) mal('el enlace «' + fila.slug + '» ya lo usa otra temporada');
      break;
    case 'temporada_fotos':
      if (!fila.temporada_id) mal('la foto necesita una temporada');
      if (!fila.foto) mal('falta la foto');
      break;
    case 'paletas':
      if (!fila.nombre) mal('la paleta necesita un nombre');
      if (!fila.fuente_titulos || !fila.fuente_texto) mal('la paleta necesita las dos fuentes (títulos y texto)');
      break;
    case 'vendedoras':
      if (!fila.nombre) mal('la vendedora necesita un nombre');
      if (fila.activa && !fila.whatsapp) mal('para activar a la vendedora falta su número de WhatsApp');
      if (fila.por_defecto && !fila.activa) mal('la vendedora por defecto debe estar activa');
      break;
  }
}
