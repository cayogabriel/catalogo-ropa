// Catálogo en el navegador: lee los filtros de la URL, filtra y ordena las tarjetas
// (moviendo nodos ya renderizados) y mantiene la URL al día con history.replaceState.
import { leerFiltros, escribirFiltros, opcionesFiltro, aplicar } from '../lib/filtros.mjs';
import { presentarPrecio } from '../lib/vista-precio.mjs';
import { abrir, cerrar, prepararDialogo } from './dialogos.mjs';
import { texto } from './comun.mjs';
import { cantidadPrendas } from '../lib/textos.mjs';

const VACIO = { categoria: null, talla: null, color: null, min: null, max: null, oferta: false, q: '', orden: 'recomendado' };

function leerItems(lista) {
  return [...lista.children].flatMap((li) => {
    try {
      const item = JSON.parse(li.dataset.item);
      const precio = JSON.parse(li.querySelector('[data-precio]').dataset.precio);
      return [{ ...item, li, datosPrecio: precio }];
    } catch {
      return [];
    }
  });
}

export function iniciarCatalogo() {
  const lista = document.querySelector('[data-catalogo]');
  const form = document.querySelector('[data-filtros]');
  const dialogo = document.querySelector('[data-dialogo-filtros]');
  if (!lista || !form || !dialogo) return;

  const buscador = document.querySelector('[data-buscador]');
  const campoBusqueda = buscador.querySelector('input');
  const orden = document.querySelector('[data-orden]');
  const resultados = document.querySelector('[data-resultados]');
  const sinResultados = document.querySelector('[data-sin-resultados]');
  const cuentaFiltros = document.querySelector('[data-cuenta-filtros]');
  const items = leerItems(lista);

  // Precio vigente al momento (las ventanas pueden haber cambiado desde el build).
  const conPrecio = () =>
    items.map((i) => {
      const p = presentarPrecio(i.datosPrecio, Date.now());
      return { ...i, precio: p.precio, oferta: p.oferta };
    });
  const opciones = opcionesFiltro(conPrecio());

  let filtros = leerFiltros(new URLSearchParams(location.search), opciones);

  const pintarControles = () => {
    for (const nombre of ['categoria', 'talla', 'color']) {
      const valor = filtros[nombre] ?? '';
      for (const r of form.elements[nombre]) r.checked = r.value === valor;
    }
    form.elements.min.value = filtros.min ?? '';
    form.elements.max.value = filtros.max ?? '';
    form.elements.oferta.checked = filtros.oferta;
    campoBusqueda.value = filtros.q;
    orden.value = filtros.orden;
    const activos = ['categoria', 'talla', 'color', 'min', 'max'].filter((k) => filtros[k] !== null).length + (filtros.oferta ? 1 : 0);
    cuentaFiltros.textContent = String(activos);
    cuentaFiltros.hidden = activos === 0;
  };

  const pintarLista = () => {
    const visibles = aplicar(conPrecio(), filtros);
    const mostrar = new Set(visibles.map((i) => i.codigo));
    const ordenados = [...visibles, ...items.filter((i) => !mostrar.has(i.codigo))];
    lista.append(...ordenados.map((i) => i.li));
    for (const i of items) i.li.hidden = !mostrar.has(i.codigo);
    resultados.textContent = cantidadPrendas(texto, visibles.length);
    sinResultados.hidden = visibles.length > 0;
  };

  const guardarUrl = () => {
    const query = escribirFiltros(filtros);
    history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
  };

  const actualizar = ({ url = true } = {}) => {
    pintarControles();
    pintarLista();
    if (url) guardarUrl();
  };

  const desdeFormulario = () => {
    const datos = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of datos) if (v !== '') params.set(k, String(v));
    params.set('q', campoBusqueda.value);
    params.set('orden', orden.value);
    filtros = leerFiltros(params, opciones);
  };

  form.addEventListener('change', () => {
    desdeFormulario();
    actualizar();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    desdeFormulario();
    actualizar();
    cerrar(dialogo);
  });

  let espera;
  campoBusqueda.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      filtros = { ...filtros, q: campoBusqueda.value.slice(0, 60) };
      pintarLista();
      guardarUrl();
    }, 150);
  });
  buscador.addEventListener('submit', (e) => {
    e.preventDefault();
    campoBusqueda.blur();
  });
  orden.addEventListener('change', () => {
    filtros = { ...filtros, orden: orden.value };
    actualizar();
  });

  for (const boton of document.querySelectorAll('[data-limpiar]')) {
    boton.addEventListener('click', () => {
      filtros = { ...VACIO };
      actualizar();
    });
  }

  prepararDialogo(dialogo);
  document.querySelector('[data-abrir-filtros]').addEventListener('click', () => abrir(dialogo));
  window.addEventListener('popstate', () => {
    filtros = leerFiltros(new URLSearchParams(location.search), opciones);
    actualizar({ url: false });
  });
  document.addEventListener('precios:actualizados', pintarLista);

  actualizar({ url: false });
}
