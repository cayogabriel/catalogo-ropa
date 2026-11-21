// Página «Mi lista»: pinta lo guardado, deja cambiar talla/color, quitar y vaciar,
// y arma el mensaje con toda la lista (mensajeLista, vendedora por defecto).
import { mensajeLista } from '../compartido/mensajes.mjs';
import { enlaceWhatsApp } from '../compartido/enlaces.mjs';
import { formatearMonto } from '../compartido/precio.mjs';
import { presentarPrecio } from '../lib/vista-precio.mjs';
import { resolverLista } from '../lib/lista.mjs';
import { lista, tienda, texto, avisar, avisarCambioLista, actualizarContador } from './comun.mjs';

function opciones(select, valores, { elegido, deshabilitados = [], vacio }) {
  select.replaceChildren(
    ...[vacio, ...valores].map((valor) => {
      const op = document.createElement('option');
      op.value = valor === vacio ? '' : valor;
      op.textContent = valor === vacio ? '—' : deshabilitados.includes(valor) ? `${valor} (agotada)` : valor;
      op.disabled = deshabilitados.includes(valor);
      op.selected = valor === elegido;
      return op;
    }),
  );
}

export function iniciarListaPagina() {
  const raiz = document.querySelector('[data-pagina-lista]');
  if (!raiz) return;
  let productos = [];
  try {
    productos = JSON.parse(raiz.dataset.productos);
  } catch {
    return;
  }
  const datos = tienda();
  const simbolo = datos.tienda?.moneda?.simbolo ?? 'S/';
  const plantilla = document.querySelector('[data-plantilla]');
  const ul = raiz.querySelector('[data-items]');
  const vacia = raiz.querySelector('[data-vacia]');
  const resumen = raiz.querySelector('[data-resumen]');
  const enviar = raiz.querySelector('[data-enviar]');

  const pintar = () => {
    const items = resolverLista(lista.leer(), productos);
    // Prendas que ya no están en el catálogo salen de la lista guardada.
    if (items.length !== lista.leer().length) {
      lista.guardar(items.map(({ producto, talla, color }) => ({ codigo: producto.codigo, talla, color })));
      actualizarContador();
    }
    vacia.hidden = items.length > 0;
    ul.hidden = items.length === 0;
    resumen.hidden = items.length === 0;

    ul.replaceChildren(
      ...items.map(({ producto: p, talla, color, agotado }, i) => {
        const li = plantilla.content.firstElementChild.cloneNode(true);
        for (const a of li.querySelectorAll('[data-enlace]')) a.href = p.url;
        li.querySelector('[data-nombre]').textContent = p.nombre;
        const img = li.querySelector('img');
        Object.assign(img, { src: p.foto.src, srcset: p.foto.srcset, sizes: '6rem', width: p.foto.ancho, height: p.foto.alto, alt: p.foto.alt });
        img.style.backgroundImage = `url(${p.foto.lqip})`;
        const precio = presentarPrecio(p, Date.now());
        li.querySelector('[data-precio-item]').textContent =
          formatearMonto(precio.precio, simbolo) + (precio.antes !== null ? ` (${texto('precio.descuento', { porcentaje: precio.pct })})` : '');
        li.querySelector('[data-agotado]').hidden = !agotado;

        const idBase = `item-${i}`;
        const talla$ = li.querySelector('[data-talla]');
        const color$ = li.querySelector('[data-color]');
        talla$.id = `${idBase}-talla`;
        color$.id = `${idBase}-color`;
        li.querySelector('[data-campo-talla] label').htmlFor = talla$.id;
        li.querySelector('[data-campo-color] label').htmlFor = color$.id;
        opciones(talla$, p.tallas, { elegido: talla, deshabilitados: p.tallas_agotadas, vacio: '' });
        opciones(color$, p.colores, { elegido: color, vacio: '' });
        li.querySelector('[data-campo-talla]').hidden = agotado;
        li.querySelector('[data-campo-color]').hidden = agotado || p.colores.length < 2;
        const guardar = () => {
          lista.actualizar(p.codigo, { talla: talla$.value || null, color: color$.value || (p.colores.length === 1 ? p.colores[0] : null) });
          actualizarResumen();
        };
        talla$.addEventListener('change', guardar);
        color$.addEventListener('change', guardar);

        const quitar = li.querySelector('[data-quitar]');
        quitar.querySelector('[data-quitar-texto]').textContent = `${texto('producto.quitar_lista')}: ${p.nombre}`;
        quitar.addEventListener('click', () => {
          lista.quitar(p.codigo);
          avisar(texto('aviso.quitado_lista'), { exito: false });
          avisarCambioLista();
          (ul.querySelector('[data-quitar]') ?? raiz.querySelector('h1')).focus?.();
        });
        return li;
      }),
    );
    actualizarResumen();
  };

  function actualizarResumen() {
    const disponibles = resolverLista(lista.leer(), productos).filter((i) => !i.agotado);
    const total = disponibles.reduce((s, i) => s + presentarPrecio(i.producto, Date.now()).precio, 0);
    raiz.querySelector('[data-total]').textContent = formatearMonto(Math.round(total * 100) / 100, simbolo);
    const vendedora = datos.vendedoras.find((v) => v.por_defecto) ?? datos.vendedoras[0];
    enviar.hidden = disponibles.length === 0 || !vendedora;
    if (vendedora && disponibles.length) {
      enviar.href = enlaceWhatsApp(vendedora.whatsapp, mensajeLista({ catalogo: datos, items: disponibles }));
    }
  }

  raiz.querySelector('[data-vaciar]').addEventListener('click', () => {
    lista.vaciar();
    avisarCambioLista();
    raiz.querySelector('h1').setAttribute('tabindex', '-1');
    raiz.querySelector('h1').focus();
  });

  document.addEventListener('lista:cambio', pintar);
  pintar();
}
