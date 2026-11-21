// Datos del sitio al construir: catálogo, textos, base y helpers de rutas.
// Solo lo importan los componentes .astro (no el navegador).
import catalogo from '../data/catalogo.json';
import respaldoTextos from '../../../content/textos.json';
import { URL_BASE } from '../../sitio.config.mjs';
import { formatearMonto } from '../compartido/precio.mjs';
import { crearTextos } from './textos.mjs';

export { catalogo, URL_BASE };

export const ahora = Date.now();
export const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const t = crearTextos(catalogo, respaldoTextos);

// ruta relativa a la base («p/ves-001/» o «/temporada/x/») → ruta del sitio.
export const url = (ruta = '') => base + String(ruta).replace(/^\//, '');
export const urlAbsoluta = (ruta = '') => URL_BASE + String(ruta).replace(/^\//, '');

export const imagen = (id) => catalogo.imagenes[id];
export const monto = (valor) => formatearMonto(valor, catalogo.tienda.moneda.simbolo);

export const paletaDe = (id) =>
  catalogo.paletas[id] ?? catalogo.paletas[catalogo.tema_paleta_id] ?? Object.values(catalogo.paletas)[0];

export const categoriaDe = (id) => catalogo.categorias.find((c) => c.id === id);

// Lo que el navegador necesita para armar mensajes de WhatsApp (sin datos de más).
export const tiendaCliente = {
  tienda: { nombre: catalogo.tienda.nombre, moneda: catalogo.tienda.moneda, sitio_url: catalogo.tienda.sitio_url },
  textos: Object.fromEntries(
    ['whatsapp.producto', 'whatsapp.lista'].filter((k) => k in catalogo.textos).map((k) => [k, catalogo.textos[k]]),
  ),
  vendedoras: catalogo.vendedoras,
};

const CLAVES_CLIENTE = [
  'insignia.nuevo',
  'insignia.liquidacion',
  'insignia.ultimas_unidades',
  'insignia.mas_consultado',
  'precio.descuento',
  'cuenta_regresiva.termina_en',
  'cuenta_regresiva.dias',
  'cuenta_regresiva.horas',
  'cuenta_regresiva.minutos',
  'cuenta_regresiva.terminada',
  'aviso.agregado_lista',
  'aviso.quitado_lista',
  'aviso.error_generico',
  'producto.agregar_lista',
  'producto.quitar_lista',
  'producto.copiado',
  'catalogo.resultados',
];
export const textosCliente = Object.fromEntries(CLAVES_CLIENTE.map((k) => [k, catalogo.textos[k] ?? respaldoTextos[k] ?? '']));

// Datos mínimos de un producto para recalcular precio e insignias en el navegador.
export const datosPrecio = (p) => ({
  precio: { ventanas: p.precio.ventanas },
  nuevo: p.nuevo,
  ultimas_unidades: p.ultimas_unidades,
  popularidad: p.popularidad,
});

// Datos de un producto para armar su mensaje de WhatsApp en el navegador.
export const datosPedido = (p) => ({
  id: p.id,
  codigo: p.codigo,
  nombre: p.nombre,
  vendedora_id: p.vendedora_id,
  precio: { ventanas: p.precio.ventanas },
});
