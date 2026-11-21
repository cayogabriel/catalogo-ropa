// Una tienda de ejemplo completa para probar publicar(): prendas, ofertas, temporada, portada, secciones y fotos reales en Drive.
import { panelInstalado } from './ayudas.mjs';

export function jpegLimpio(variante = 0) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, variante & 255, 0xff, 0xd9]),
  ]);
}

const TOKENS = Object.fromEntries(
  ['fondo', 'superficie', 'texto', 'texto-suave', 'borde', 'control', 'primario', 'sobre-primario', 'acento', 'sobre-acento', 'oferta', 'sobre-oferta', 'liquidacion', 'sobre-liquidacion', 'exito', 'foco'].map((t) => [`--color-${t}`, '#000000']),
);
Object.assign(TOKENS, {
  '--color-fondo': '#FFFFFF', '--color-superficie': '#FAFAFA', '--color-texto': '#1A1A1A', '--color-texto-suave': '#555555', '--color-borde': '#E5E5E5',
  '--color-control': '#767676', '--color-primario': '#B3261E', '--color-sobre-primario': '#FFFFFF', '--color-acento': '#1D4ED8', '--color-sobre-acento': '#FFFFFF',
  '--color-oferta': '#B91C1C', '--color-sobre-oferta': '#FFFFFF', '--color-liquidacion': '#111111', '--color-sobre-liquidacion': '#FFE600',
  '--color-exito': '#15803D', '--color-foco': '#1D4ED8',
});

export function conPaleta(ctx, id, nombre = id) {
  const tabla = ctx.leerTabla_('paletas');
  if (tabla.filas.some((f) => f.id === id)) return;
  ctx.agregarFilas_('paletas', tabla, [
    { id, nombre, temporada: '', uso: '', tokens: TOKENS, fuente_titulos: 'Poppins', fuente_texto: 'Nunito Sans', radio: '12px', origen: 'predefinida', version: 1 },
  ]);
}

export function subirFoto(ctx, variante, extra = {}) {
  return ctx.subirFoto({ nombre: `foto-${variante}.jpg`, mime: 'image/jpeg', base64: jpegLimpio(variante).toString('base64'), destino: 'producto', ...extra }).id;
}

// Tienda lista: todo creado con el propio Panel, como lo haría la dueña.
export function tiendaDeEjemplo(opciones) {
  const p = panelInstalado(opciones);
  const { ctx } = p;
  conPaleta(ctx, 'neutra-minimal');
  conPaleta(ctx, 'verano-costa');
  ctx.guardarConfig('tienda_nombre', 'Tienda Prueba');
  ctx.guardarConfig('instagram', '@mi.tienda');
  const ana = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51987654321' });
  const bea = ctx.crear('vendedoras', { nombre: 'Bea', whatsapp: '51987654322' });
  const vestidos = ctx.crear('categorias', { nombre: 'Vestidos' });
  const faldas = ctx.crear('categorias', { nombre: 'Faldas' });
  const fotos = Array.from({ length: 8 }, (_, i) => subirFoto(ctx, i));

  const publicar = (datos) => {
    const prenda = ctx.crear('productos', datos);
    ctx.guardarCampo('productos', prenda.id, 'estado', datos.estado || 'publicado', 1);
    return ctx.listar('productos', { filtro: { id: prenda.id } }).filas[0];
  };
  const v1 = publicar({ nombre: 'Vestido Lino', categoria_id: vestidos.id, precio_regular: 89, tallas: ['S', 'M', 'L'], colores: ['Coral'], fotos: [fotos[0], fotos[1]], stock: 2 });
  const v2 = publicar({ nombre: 'Vestido Rojo', categoria_id: vestidos.id, precio_regular: 120, tallas: ['M'], colores: ['Rojo'], fotos: [fotos[2]] });
  const f1 = publicar({ nombre: 'Falda Plisada', categoria_id: faldas.id, precio_regular: 60, tallas: ['S', 'M'], tallas_agotadas: ['S'], fotos: [fotos[3]], estado: 'agotado' });
  const borrador = ctx.crear('productos', { nombre: 'Borrador', categoria_id: faldas.id, fotos: [fotos[4]] });
  const archivado = publicar({ nombre: 'Archivada', categoria_id: faldas.id, precio_regular: 40, fotos: [fotos[5]] });
  ctx.eliminar('productos', archivado.id);

  const oferta = ctx.crear('ofertas', {
    nombre: 'Verano', tipo: 'porcentaje', valor: 25, alcance: 'producto', objetivos: [v1.id], desde: '2026-11-30T00:00:00-05:00', hasta: '2026-12-10T00:00:00-05:00',
    cuenta_regresiva: true, activa: true,
  });
  const temporada = ctx.crear('temporadas', { nombre: 'Verano 2027', paleta_id: 'verano-costa', foto_portada: fotos[6], revista: true, visible_en_web: true, activa_manual: 'si', titulo: 'Verano en la costa' });
  const fotoT1 = ctx.crear('temporada_fotos', { temporada_id: temporada.id, foto: fotos[7], tipo: 'ambiente', productos: [v1.id], texto: 'Lino y sol' });
  const fotoT2 = ctx.crear('temporada_fotos', { temporada_id: temporada.id, foto: fotos[2], tipo: 'producto', productos: [v2.id] });
  const portada = ctx.crear('portadas', { titulo: 'Verano', boton_texto: 'Ver', boton_destino: `/temporada/${temporada.slug}/`, foto_escritorio: fotos[6], activa: true, temporada_id: temporada.id });
  const manual = ctx.crear('secciones', { titulo: 'Favoritas', tipo: 'manual', productos: [v2.id, v1.id] });
  const novedades = ctx.crear('secciones', { titulo: 'Novedades', tipo: 'novedades' });
  const ofertas = ctx.crear('secciones', { titulo: 'Ofertas', tipo: 'ofertas' });
  return {
    ...p,
    ids: { ana, bea, vestidos, faldas, v1, v2, f1, borrador, archivado, oferta, temporada, fotoT1, fotoT2, portada, manual, novedades, ofertas },
    fotos,
  };
}

// Respuestas de GitHub para los tests. `repo` es el de la configuración por defecto.
export function programarGithub(dobles, { dispatch = 204, runs = null, repo = 200, repoPush = true } = {}) {
  const u = dobles._url;
  u.responder(/\/repos\/[^/]+\/[^/]+$/, { codigo: repo, texto: JSON.stringify({ permissions: { push: repoPush } }) });
  u.responder(/\/dispatches$/, { codigo: dispatch, texto: '' });
  if (runs !== undefined) u.responder(/\/actions\/runs/, { codigo: 200, texto: JSON.stringify({ workflow_runs: runs ?? [] }) });
}

export const TOKEN_DE_PRUEBA = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
