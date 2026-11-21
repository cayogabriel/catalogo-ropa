// Servidor del Panel falso: todas las funciones de docs/contracts/api-panel.md sobre datos en memoria.
// Sirve para desarrollar y probar la interfaz sin Google. No es el servidor real (ese es de S2).
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { revisarPaleta } from '../../../contratos/tokens.mjs';
import { semilla, USUARIO_SIM } from './datos-semilla.mjs';
import { miniaturaDe, tieneExif, esImagen } from './fotos-sim.mjs';
import { ventanasDe, ofertaGanadora } from './precios-sim.mjs';

// Columnas y tipos: se leen del esquema real del Panel, para no desfasarse.
const ctxEsquema = vm.createContext({});
vm.runInContext(readFileSync(fileURLToPath(new URL('../src/server/esquema.js', import.meta.url)), 'utf8'), ctxEsquema);
const ESQUEMA = vm.runInContext('ESQUEMA', ctxEsquema);
const TIPOS = vm.runInContext('TIPOS', ctxEsquema);

const EDITABLES = ['productos', 'categorias', 'secciones', 'portadas', 'ofertas', 'temporadas', 'temporada_fotos', 'paletas', 'vendedoras'];
const PREFIJO_ID = {
  productos: 'prd', categorias: 'cat', secciones: 'sec', portadas: 'por', ofertas: 'ofe', temporadas: 'tem',
  temporada_fotos: 'tfo', paletas: 'pal', vendedoras: 'ven',
};
const CARPETAS = { producto: 'fotos', temporada: 'temporadas', portada: 'portadas', marca: 'marca' };
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;
const POR_PAGINA = 24;

const MENSAJES = {
  no_autorizado: 'esta cuenta no es la de la dueña del catálogo',
  conflicto: 'la fila cambió mientras la editabas',
  limite: 'se pasó el tamaño o la cantidad máxima',
  github: 'GitHub no respondió',
  invalido: 'un dato no cumple la regla',
  no_encontrado: 'no existe',
  sin_token: 'falta el token de GitHub',
};

const error = (codigo, detalle) => new Error(`${codigo}: ${detalle ?? MENSAJES[codigo] ?? ''}`);
const copia = (x) => structuredClone(x);
const esFecha = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

export function crearGasFalso({
  ahora = () => new Date(),
  aleatorio = Math.random,
  demoraMs = 0,
  duraciones = { cola: 2000, publicando: 6000, documentos: 3000 },
  instalada = true,
} = {}) {
  let db;
  const reglas = [];
  const sim = { demora: demoraMs, sinConexion: false, publicacionFalla: false };

  function reiniciar() {
    db = semilla();
    db.instalada = instalada;
    reglas.length = 0;
  }
  reiniciar();

  const iso = () => toLima(ahora());
  function toLima(d) {
    const l = new Date(d.getTime() - 5 * 3600 * 1000);
    return `${l.toISOString().slice(0, 19)}-05:00`;
  }
  const hex8 = () => {
    for (;;) {
      const h = Math.floor(aleatorio() * 0xffffffff).toString(16).padStart(8, '0');
      if (!existeId(h)) return h;
    }
  };
  const idsUsados = new Set();
  function existeId(h) {
    if (idsUsados.has(h)) return true;
    idsUsados.add(h);
    return false;
  }
  const nuevoId = (entidad) => `${PREFIJO_ID[entidad]}_${hex8()}`;

  // ----- ayudas -----
  function entidadValida(entidad) {
    if (!EDITABLES.includes(entidad)) throw error('invalido', `«${entidad}» no es una entidad editable`);
    return db.filas[entidad];
  }
  function buscar(entidad, id) {
    const fila = entidadValida(entidad).find((f) => f.id === id);
    if (!fila) throw error('no_encontrado', `no existe ${entidad} ${id}`);
    return fila;
  }
  function historiar(entidad, entidad_id, campo, antes, despues, accion) {
    const fila = {
      id: `his_${hex8()}`, fecha: iso(), usuario: USUARIO_SIM, entidad, entidad_id, campo,
      antes: JSON.stringify(antes ?? null), despues: JSON.stringify(despues ?? null), accion,
    };
    db.historial.unshift(fila);
    return fila;
  }
  const tocar = () => (db.cambiosSinPublicar = true);
  const publicado = (f) => f.estado === 'publicado';

  function convertir(entidad, campo, valor) {
    const tipo = TIPOS[entidad]?.[campo] ?? (['lista', 'json'].includes(esquemaTipo(entidad, campo)) ? esquemaTipo(entidad, campo) : 'texto');
    if (tipo === 'numero') {
      if (valor === null || valor === '') return null;
      if (typeof valor !== 'number' || Number.isNaN(valor)) throw error('invalido', `«${campo}» debe ser un número`);
    } else if (tipo === 'booleano') {
      if (typeof valor !== 'boolean') throw error('invalido', `«${campo}» debe ser sí o no`);
    } else if (tipo === 'fecha') {
      if (valor === '') return null;
      if (!esFecha(valor)) throw error('invalido', `«${campo}» debe ser una fecha`);
    } else if (tipo === 'lista') {
      if (!Array.isArray(valor)) throw error('invalido', `«${campo}» debe ser una lista`);
    } else if (tipo === 'json') {
      if (typeof valor !== 'object' || valor === null) throw error('invalido', `«${campo}» debe ser un objeto`);
    } else if (valor === null || valor === undefined) return '';
    else if (typeof valor !== 'string') throw error('invalido', `«${campo}» debe ser texto`);
    return valor;
  }
  const LISTAS = { productos: ['tallas', 'tallas_agotadas', 'colores', 'fotos', 'etiquetas'], secciones: ['productos'], ofertas: ['objetivos'], temporada_fotos: ['productos'] };
  const JSONS = { paletas: ['tokens'] };
  function esquemaTipo(entidad, campo) {
    if (LISTAS[entidad]?.includes(campo)) return 'lista';
    if (JSONS[entidad]?.includes(campo)) return 'json';
    return 'texto';
  }

  // Reglas de negocio (una parte de lo que hace el servidor real).
  function validarFila(entidad, fila, previa, cambios) {
    const tocado = (campo) => cambios === null || campo in cambios;
    const falla = (msg) => {
      throw error('invalido', msg);
    };
    if (entidad === 'productos') {
      if (fila.nombre.length > 80) falla('el nombre admite hasta 80 letras');
      if (fila.descripcion.length > 600) falla('la descripción admite hasta 600 letras');
      if (fila.precio_regular !== null && fila.precio_regular <= 0) falla('el precio debe ser mayor que 0');
      if (fila.stock !== null && (fila.stock < 0 || !Number.isInteger(fila.stock))) falla('el stock debe ser un número entero, 0 o más');
      if (!['borrador', 'publicado', 'agotado', 'archivado'].includes(fila.estado)) falla('estado no válido');
      if (!db.filas.categorias.some((c) => c.id === fila.categoria_id)) falla('la categoría no existe');
      if (fila.tallas_agotadas.some((t) => !fila.tallas.includes(t))) falla('una talla agotada no está en la lista de tallas');
      if (tocado('estado') && publicado(fila) && !publicado(previa ?? {})) {
        const falta = [!fila.nombre && 'nombre', !(fila.precio_regular > 0) && 'precio', !fila.fotos.length && 'foto'].filter(Boolean);
        if (falta.length) falla(`para publicar falta: ${falta.join(', ')}`);
      }
    }
    if (entidad === 'categorias') {
      if (!/^[a-z0-9-]+$/.test(fila.slug)) falla('el enlace solo admite a-z, 0-9 y guiones');
      if (!/^[A-Z]{3}$/.test(fila.prefijo_codigo)) falla('el prefijo debe tener 3 letras mayúsculas');
      if (db.filas.categorias.some((c) => c.id !== fila.id && (c.slug === fila.slug || c.prefijo_codigo === fila.prefijo_codigo))) falla('ya existe otra categoría con ese enlace o prefijo');
    }
    if (entidad === 'temporadas') {
      if (!/^[a-z0-9-]+$/.test(fila.slug)) falla('el enlace solo admite a-z, 0-9 y guiones');
      if (db.filas.temporadas.some((t) => t.id !== fila.id && t.slug === fila.slug)) falla('ya existe otra temporada con ese enlace');
      if (!['', 'si', 'no'].includes(fila.activa_manual)) falla('activa_manual debe estar vacío, «si» o «no»');
      if (fila.desde && fila.hasta && fila.hasta <= fila.desde) falla('la fecha de fin debe ser posterior a la de inicio');
    }
    if (entidad === 'ofertas') {
      if (!['porcentaje', 'monto', 'precio_final'].includes(fila.tipo)) falla('tipo de oferta no válido');
      if (!(fila.valor > 0)) falla('el valor debe ser mayor que 0');
      if (fila.tipo === 'porcentaje' && (fila.valor < 1 || fila.valor > 90)) falla('el porcentaje va de 1 a 90');
      if (!['producto', 'categoria', 'seccion', 'temporada', 'tienda'].includes(fila.alcance)) falla('alcance no válido');
      if (fila.desde && fila.hasta && fila.hasta <= fila.desde) falla('la fecha de fin debe ser posterior a la de inicio');
    }
    if (entidad === 'secciones') {
      if (!['manual', 'novedades', 'ofertas', 'liquidacion', 'mas_consultados', 'categoria', 'etiqueta'].includes(fila.tipo)) falla('tipo de sección no válido');
      if (!['carrusel', 'grilla', 'destacado'].includes(fila.diseno)) falla('diseño no válido');
    }
    if (entidad === 'portadas' && fila.boton_destino && !fila.boton_destino.startsWith('/')) falla('el destino del botón debe ser una ruta interna');
    if (entidad === 'temporada_fotos' && !['producto', 'ambiente'].includes(fila.tipo)) falla('tipo de foto no válido');
    if (entidad === 'vendedoras' && fila.whatsapp && !/^\d{9,15}$/.test(fila.whatsapp)) falla('el WhatsApp va solo con dígitos y el código de país, por ejemplo 51987654321');
    if (entidad === 'paletas') {
      if (previa && previa.origen === 'predefinida') falla('las paletas predefinidas no se editan');
      const r = revisarPaleta(fila.tokens);
      if (!r.ok) falla('la paleta no pasa el contraste mínimo');
    }
  }

  const FILA_BASE = {
    productos: () => ({ nombre: '', descripcion: '', precio_regular: null, stock: null, tallas: [], tallas_agotadas: [], colores: [], fotos: [], texto_alt: '', etiquetas: [], estado: 'borrador', vendedora_id: '', publicado_en: null }),
    categorias: () => ({ nombre: 'Nueva categoría', slug: '', prefijo_codigo: '', visible: true, foto: '' }),
    secciones: () => ({ titulo: 'Nueva sección', subtitulo: '', tipo: 'manual', parametro: '', productos: [], diseno: 'carrusel', limite: null, visible: true, temporada_id: '' }),
    portadas: () => ({ titulo: 'Nueva portada', subtitulo: '', boton_texto: '', boton_destino: '', foto_escritorio: '', foto_movil: '', desde: null, hasta: null, activa: false, temporada_id: '' }),
    ofertas: () => ({ nombre: 'Nueva oferta', tipo: 'porcentaje', valor: 10, alcance: 'tienda', objetivos: [], desde: null, hasta: null, prioridad: 1, etiqueta: '', es_liquidacion: false, cuenta_regresiva: false, activa: true }),
    temporadas: () => ({ slug: '', nombre: 'Nueva temporada', titulo: '', subtitulo: '', intro: '', cierre: '', paleta_id: db.config.paleta_defecto, foto_portada: '', desde: null, hasta: null, activa_manual: '', visible_en_web: true, revista: true, vigencia_dias: null }),
    temporada_fotos: () => ({ temporada_id: '', foto: '', tipo: 'producto', productos: [], texto: '', texto_alt: '', destacada: false }),
    paletas: () => ({ nombre: 'Mi paleta', temporada: '', uso: '', tokens: {}, fuente_titulos: 'Poppins', fuente_texto: 'Nunito Sans', radio: '12px', origen: 'propia' }),
    vendedoras: () => ({ nombre: 'Nueva vendedora', whatsapp: '', activa: true, por_defecto: false }),
  };
  const slugDe = (t) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'nueva';

  // ----- funciones del contrato -----
  const f = {};

  f.obtenerEstadoInicial = () => {
    if (!db.instalada) throw error('no_encontrado', 'falta instalar: no encuentro la hoja del catálogo');
    return {
      usuario: USUARIO_SIM, config: copia(db.config), textos: copia(db.textos),
      conteos: Object.fromEntries(EDITABLES.map((e) => [e, db.filas[e].filter((x) => x.estado !== 'archivado').length])),
      publicacion: f.estadoPublicacion(), cambios_sin_publicar: db.cambiosSinPublicar, sitio_url: db.config.sitio_url,
    };
  };

  f.instalar = () => {
    const nueva = !db.instalada;
    db.instalada = true;
    return { hojaId: 'hoja-simulada', hojaUrl: 'https://docs.example.test/hoja-simulada', carpetaRaizId: 'carpeta-simulada', nueva, restaurado: false };
  };
  f.autorizar = () => 'ok';

  f.listar = (entidad, opciones = {}) => {
    let filas = entidadValida(entidad);
    if (!opciones.incluir_archivados) filas = filas.filter((x) => x.estado !== 'archivado');
    for (const [campo, valor] of Object.entries(opciones.filtro ?? {})) {
      filas = filas.filter((x) => (Array.isArray(x[campo]) ? x[campo].includes(valor) : x[campo] === valor));
    }
    if (filas.length && 'orden' in filas[0]) filas = [...filas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return { filas: copia(filas), leido_en: iso() };
  };

  f.crear = (entidad, datos = {}) => {
    const lista = entidadValida(entidad);
    const base = FILA_BASE[entidad]();
    for (const campo of Object.keys(datos)) {
      if (!ESQUEMA[entidad].includes(campo) || ['id', 'version', 'codigo'].includes(campo)) throw error('invalido', `el campo «${campo}» no existe en ${entidad}`);
    }
    const fila = { ...base, ...datos };
    for (const [campo, valor] of Object.entries(fila)) fila[campo] = convertir(entidad, campo, valor);
    fila.id = nuevoId(entidad);
    fila.version = 1;
    if ('orden' in Object.fromEntries(ESQUEMA[entidad].map((c) => [c, 1]))) fila.orden = Math.max(0, ...lista.map((x) => x.orden ?? 0)) + 1;
    if (entidad === 'productos') {
      const cat = db.filas.categorias.find((c) => c.id === fila.categoria_id);
      if (!cat) throw error('invalido', 'la categoría no existe');
      const n = Math.max(0, ...lista.filter((p) => p.categoria_id === cat.id).map((p) => Number(p.codigo.split('-')[1]) || 0));
      const global = Math.max(n, 0) + 1;
      fila.codigo = `${cat.prefijo_codigo}-${String(global).padStart(3, '0')}`;
      fila.estado = 'borrador';
      fila.creado_en = fila.actualizado_en = iso();
    }
    if (entidad === 'categorias') {
      fila.slug ||= slugDe(fila.nombre);
      fila.prefijo_codigo ||= (fila.nombre.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase() + 'XXX').slice(0, 3);
    }
    if (entidad === 'temporadas') {
      let slug = fila.slug || slugDe(fila.nombre);
      let n = 2;
      const base0 = slug;
      while (lista.some((t) => t.slug === slug)) slug = `${base0}-${n++}`;
      fila.slug = slug;
    }
    if (entidad === 'temporada_fotos' && !fila.temporada_id) throw error('invalido', 'falta la temporada');
    if (entidad === 'temporada_fotos') {
      fila.orden = Math.max(0, ...lista.filter((x) => x.temporada_id === fila.temporada_id).map((x) => x.orden)) + 1;
    }
    if (entidad === 'paletas') fila.origen = 'propia';
    validarFila(entidad, fila, null, null);
    lista.push(fila);
    historiar(entidad, fila.id, '', null, fila, 'crear');
    tocar();
    return copia(fila);
  };

  f.guardarCampos = (entidad, id, cambios, version) => {
    const fila = buscar(entidad, id);
    if (version !== fila.version) throw error('conflicto', `la fila está en la versión ${fila.version} y tú tenías la ${version}`);
    if (!cambios || typeof cambios !== 'object') throw error('invalido', 'faltan los cambios');
    const nueva = copia(fila);
    for (const [campo, valor] of Object.entries(cambios)) {
      if (!ESQUEMA[entidad].includes(campo) || ['id', 'version', 'codigo', 'creado_en'].includes(campo)) throw error('invalido', `el campo «${campo}» no se puede cambiar`);
      nueva[campo] = convertir(entidad, campo, valor);
    }
    validarFila(entidad, nueva, fila, cambios);
    for (const [campo, valor] of Object.entries(cambios)) {
      historiar(entidad, id, campo, fila[campo], nueva[campo], 'editar');
      fila[campo] = nueva[campo];
    }
    if (entidad === 'productos') {
      fila.actualizado_en = iso();
      if (publicado(fila) && !fila.publicado_en) fila.publicado_en = iso();
    }
    fila.version += 1;
    tocar();
    return { fila: copia(fila), version: fila.version };
  };
  f.guardarCampo = (entidad, id, campo, valor, version) => f.guardarCampos(entidad, id, { [campo]: valor }, version);

  f.eliminar = (entidad, id) => {
    const lista = entidadValida(entidad);
    const fila = buscar(entidad, id);
    const antes = copia(fila);
    let archivado = false;
    if (entidad === 'productos') {
      fila.estado = 'archivado';
      fila.version += 1;
      archivado = true;
    } else {
      lista.splice(lista.indexOf(fila), 1);
    }
    historiar(entidad, id, '', antes, null, 'eliminar');
    tocar();
    return { ok: true, archivado };
  };

  function aplicarOrden(entidad, ids) {
    ids.forEach((id, i) => (buscar(entidad, id).orden = i + 1));
  }
  f.reordenar = (entidad, ids) => {
    entidadValida(entidad);
    if (!Array.isArray(ids)) throw error('invalido', 'faltan los ids');
    const antes = copia(db.filas[entidad]).filter((x) => ids.includes(x.id)).sort((a, b) => a.orden - b.orden).map((x) => x.id);
    aplicarOrden(entidad, ids);
    historiar(entidad, entidad === 'temporada_fotos' ? buscar(entidad, ids[0] ?? '').temporada_id : '', '', antes, ids, 'reordenar');
    tocar();
    return { ok: true };
  };

  f.duplicarProducto = (id) => {
    const o = buscar('productos', id);
    const nuevo = f.crear('productos', { categoria_id: o.categoria_id, nombre: o.nombre ? `${o.nombre} (copia)` : '', descripcion: o.descripcion, precio_regular: o.precio_regular, stock: o.stock, tallas: [...o.tallas], tallas_agotadas: [...o.tallas_agotadas], colores: [...o.colores], fotos: [...o.fotos], etiquetas: [...o.etiquetas], vendedora_id: o.vendedora_id });
    return nuevo;
  };

  f.historial = (opciones = {}) => {
    const { entidad, id, limite = 50 } = opciones;
    return copia(db.historial.filter((h) => (!entidad || h.entidad === entidad) && (!id || h.entidad_id === id)).slice(0, limite));
  };

  f.deshacer = (historialId) => {
    const h = db.historial.find((x) => x.id === historialId);
    if (!h) throw error('no_encontrado', 'no existe ese cambio');
    const antes = JSON.parse(h.antes);
    const despues = JSON.parse(h.despues);
    if (h.accion === 'deshacer') throw error('invalido', 'ese cambio ya es un «deshacer»');
    let fila = null;
    if (h.accion === 'editar') {
      const actual = buscar(h.entidad, h.entidad_id);
      actual[h.campo] = antes;
      actual.version += 1;
      fila = copia(actual);
    } else if (h.accion === 'crear') {
      const lista = entidadValida(h.entidad);
      const actual = buscar(h.entidad, h.entidad_id);
      if (h.entidad === 'productos') actual.estado = 'archivado';
      else lista.splice(lista.indexOf(actual), 1);
    } else if (h.accion === 'eliminar') {
      const lista = entidadValida(h.entidad);
      const existente = lista.find((x) => x.id === h.entidad_id);
      if (existente) {
        existente.estado = antes.estado;
        existente.version += 1;
        fila = copia(existente);
      } else {
        lista.push({ ...antes, version: (antes.version ?? 1) + 1 });
        fila = copia(antes);
      }
    } else if (h.accion === 'reordenar') {
      aplicarOrden(h.entidad, antes);
    }
    historiar(h.entidad, h.entidad_id, h.campo, despues, antes, 'deshacer');
    tocar();
    return { fila };
  };

  // ----- fotos -----
  f.subirFoto = async (archivo) => {
    if (!archivo || typeof archivo !== 'object') throw error('invalido', 'falta la foto');
    const { nombre, mime, base64, destino, temporada_id } = archivo;
    if (!MIMES.includes(mime)) throw error('invalido', 'solo se aceptan fotos JPG, PNG o WebP');
    if (!CARPETAS[destino]) throw error('invalido', 'destino de la foto no válido');
    const buf = Buffer.from(String(base64 ?? ''), 'base64');
    if (buf.length > MAX_BYTES) throw error('limite', 'la foto pesa más de 8 MB');
    if (!buf.length || !esImagen(buf, mime)) throw error('invalido', 'el archivo no parece una foto');
    if (mime === 'image/jpeg' && tieneExif(buf)) throw error('invalido', 'la foto todavía trae datos EXIF (por ejemplo, la ubicación). Vuelve a codificarla antes de subirla');
    const id = `fx_${hex8()}`;
    const limpio = String(nombre ?? 'foto.jpg').replace(/[^\w.-]+/g, '-').slice(0, 60);
    db.fotos[id] = { id, nombre: limpio, carpeta: CARPETAS[destino], actualizado: iso(), subida: true, buffer: buf, temporada_id: temporada_id ?? null };
    return { id, nombre: limpio, miniatura: await miniaturaDe(id, buf) };
  };

  f.miniaturas = async (ids) => {
    if (!Array.isArray(ids)) throw error('invalido', 'faltan los ids');
    if (ids.length > 40) throw error('limite', 'se piden hasta 40 miniaturas a la vez');
    const salida = {};
    for (const id of ids) {
      const foto = db.fotos[id];
      if (foto) salida[id] = await miniaturaDe(id, foto.buffer);
    }
    return salida;
  };

  function usosDe(id) {
    const usos = [];
    const poner = (entidad, eid, etiqueta) => {
      if (!usos.some((u) => u.entidad === entidad && u.id === eid)) usos.push({ entidad, id: eid, etiqueta });
    };
    for (const p of db.filas.productos) if (p.fotos.includes(id) && p.estado !== 'archivado') poner('productos', p.id, p.codigo);
    for (const t of db.filas.temporadas) if (t.foto_portada === id) poner('temporadas', t.id, t.nombre);
    for (const tf of db.filas.temporada_fotos) {
      if (tf.foto === id) poner('temporadas', tf.temporada_id, db.filas.temporadas.find((t) => t.id === tf.temporada_id)?.nombre ?? tf.temporada_id);
    }
    for (const p of db.filas.portadas) if (p.foto_escritorio === id || p.foto_movil === id) poner('portadas', p.id, p.titulo);
    for (const c of db.filas.categorias) if (c.foto === id) poner('categorias', c.id, c.nombre);
    if (db.config.logo === id) poner('config', 'logo', 'Logo');
    return usos;
  }

  f.biblioteca = (opciones = {}) => {
    const { carpeta, pagina = 1 } = opciones;
    const todas = Object.values(db.fotos)
      .filter((x) => !carpeta || x.carpeta === carpeta)
      .sort((a, b) => b.actualizado.localeCompare(a.actualizado) || a.id.localeCompare(b.id));
    const fotos = todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((x) => ({
      id: x.id, nombre: x.nombre, carpeta: x.carpeta, actualizado: x.actualizado, usos: usosDe(x.id),
    }));
    return { fotos, pagina, total: todas.length };
  };

  f.altaRapida = (fotoIds, opciones = {}) => {
    if (!Array.isArray(fotoIds) || !fotoIds.length) throw error('invalido', 'faltan las fotos');
    for (const id of fotoIds) if (!db.fotos[id]) throw error('no_encontrado', `la foto ${id} no existe`);
    return fotoIds.map((id) => f.crear('productos', { categoria_id: opciones.categoria_id, fotos: [id] }));
  };

  // ----- precios, paletas, textos, configuración -----
  f.vistaPreviaPrecios = ({ producto_id, oferta } = {}) => {
    const p = buscar('productos', producto_id);
    if (!(p.precio_regular > 0)) throw error('invalido', 'el producto no tiene precio');
    const ofertaFinal = oferta
      ? { ...oferta, id: oferta.id ?? null }
      : ofertaGanadora(db.filas.ofertas.filter((o) => o.activa && alcanza(o, p)), p.precio_regular, db.config.redondeo);
    return { regular: p.precio_regular, ventanas: ventanasDe(p.precio_regular, ofertaFinal, db.config.redondeo) };
  };
  function alcanza(o, p) {
    if (o.alcance === 'tienda') return true;
    if (o.alcance === 'producto') return o.objetivos.includes(p.id);
    if (o.alcance === 'categoria') return o.objetivos.includes(p.categoria_id);
    if (o.alcance === 'seccion') return db.filas.secciones.some((s) => o.objetivos.includes(s.id) && s.productos.includes(p.id));
    if (o.alcance === 'temporada') return db.filas.temporada_fotos.some((tf) => o.objetivos.includes(tf.temporada_id) && tf.productos.includes(p.id));
    return false;
  }

  f.validarPaleta = (tokens) => {
    const r = revisarPaleta(tokens ?? {});
    return { ok: r.ok, faltantes: r.faltantes, fallos: r.fallos };
  };

  f.guardarTexto = (clave, valor) => {
    if (typeof clave !== 'string' || !clave) throw error('invalido', 'falta la clave del texto');
    db.textos[clave] = String(valor ?? '');
    tocar();
    return { clave, valor: db.textos[clave] };
  };
  f.guardarConfig = (clave, valor) => {
    if (!(clave in db.config)) throw error('invalido', `«${clave}» no es un ajuste conocido`);
    db.config[clave] = String(valor ?? '');
    tocar();
    return { clave, valor: db.config[clave] };
  };
  f.guardarTokenGithub = (token) => {
    if (typeof token !== 'string' || !token.trim()) throw error('invalido', 'el token está vacío');
    db.tokenGithub = token.trim();
    return { ok: true, repo: db.config.github_repo };
  };
  f.estadoTokenGithub = () => ({ configurado: !!db.tokenGithub, repo: db.config.github_repo });

  // ----- publicación, estadísticas y documentos -----
  f.publicar = () => {
    if (!db.config.tienda_nombre.trim()) throw error('invalido', 'la tienda no tiene nombre: ponlo en Configuración');
    if (!db.tokenGithub) throw error('sin_token', 'falta el token de GitHub: pégalo en Configuración');
    db.publicacion = {
      estado: 'en_cola', iniciado_en: iso(), terminado_en: null, url_ejecucion: 'https://github.com/cayogabriel/catalogo-ropa/actions',
      mensaje: '', documentos_guardados: false, _inicio: ahora().getTime(), _falla: sim.publicacionFalla,
    };
    db.cambiosSinPublicar = false;
    return f.estadoPublicacion();
  };
  f.estadoPublicacion = () => {
    const p = db.publicacion;
    if (p._inicio !== undefined && p.estado !== 'error') {
      const t = ahora().getTime() - p._inicio;
      const { cola, publicando, documentos } = duraciones;
      if (t < cola) p.estado = 'en_cola';
      else if (t < cola + publicando) p.estado = 'publicando';
      else if (p._falla) {
        p.estado = 'error';
        p.mensaje = 'El proceso de GitHub terminó con un error.';
        p.terminado_en = toLima(ahora());
      } else {
        p.estado = 'publicado';
        p.terminado_en ??= toLima(ahora());
        p.documentos_guardados = t >= cola + publicando + documentos;
      }
    }
    const { _inicio, _falla, ...limpio } = p;
    return copia(limpio);
  };

  f.resumen = ({ dias } = {}) => {
    if (![7, 30].includes(dias)) throw error('invalido', 'dias debe ser 7 o 30');
    const suma = { vistas: 0, whatsapp: 0, favoritos: 0, compartidos: 0, descargas: 0 };
    const por_producto = [];
    for (const p of db.filas.productos) {
      const e = db.estadisticas[p.id]?.[dias];
      if (!e) continue;
      por_producto.push({ producto_id: p.id, codigo: p.codigo, nombre: p.nombre, ...e });
      for (const k of Object.keys(suma)) suma[k] += e[k];
    }
    por_producto.sort((a, b) => b.whatsapp - a.whatsapp || b.vistas - a.vistas);
    const reparto = { web: 0.7, revista_web: 0.15, pdf: 0.1, catalogo_pdf: 0.05 };
    const por_origen = Object.fromEntries(
      Object.entries(reparto).map(([o, r]) => [o, Object.fromEntries(Object.entries(suma).map(([k, v]) => [k, Math.round(v * r)]))]),
    );
    return { totales: suma, por_producto, por_origen };
  };

  f.documentos = () => ({
    revistas: db.filas.temporadas.filter((t) => t.revista).map((t) => ({
      temporada_id: t.id, nombre: t.nombre,
      pdf: { url: `https://drive.example.test/revista-${t.slug}.pdf`, actualizado: db.publicacion.terminado_en },
      carrusel: { url: `https://drive.example.test/carrusel-${t.slug}`, cantidad: 8 },
    })),
    catalogo: { url: 'https://drive.example.test/catalogo.pdf', actualizado: db.publicacion.terminado_en },
    reportes: [{ mes: '2026-10', url: 'https://drive.example.test/reporte' }],
  });

  // ----- entrada -----
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  async function llamar(nombre, args = []) {
    if (sim.demora) await esperar(sim.demora);
    if (sim.sinConexion) throw new TypeError('Failed to fetch');
    const i = reglas.findIndex((r) => (r.nombre === '*' || r.nombre === nombre) && r.veces > 0);
    if (i >= 0) {
      reglas[i].veces -= 1;
      throw error(reglas[i].codigo);
    }
    if (typeof f[nombre] !== 'function' || nombre.endsWith('_')) throw error('no_encontrado', `la función ${nombre} no existe`);
    return f[nombre](...(Array.isArray(args) ? args : [args]));
  }

  return {
    llamar,
    funciones: Object.keys(f),
    simular: {
      falla: (nombre, codigo, veces = 1) => reglas.push({ nombre, codigo, veces }),
      demora: (ms) => (sim.demora = ms),
      sinConexion: (valor) => (sim.sinConexion = !!valor),
      publicacionFalla: (valor) => (sim.publicacionFalla = !!valor),
      reiniciar,
    },
    get db() {
      return db;
    },
  };
}
