// Selector de talla/color: arma el mensaje de WhatsApp y maneja «Agregar a mi lista».
import { mensajeProducto, vendedoraPara } from '../compartido/mensajes.mjs';
import { enlaceWhatsApp } from '../compartido/enlaces.mjs';
import { tienda, texto, lista, evento, avisar, avisarCambioLista } from './comun.mjs';

const elegido = (raiz, nombre) => raiz.querySelector(`input[name$="-${nombre}"]:checked`)?.value ?? null;

function seleccion(raiz) {
  return { talla: elegido(raiz, 'talla'), color: elegido(raiz, 'color') ?? raiz.dataset.colorUnico ?? null };
}

function sincronizarLista(raiz, codigo) {
  const boton = raiz.querySelector('[data-lista]');
  if (!boton) return;
  const en = lista.contiene(codigo);
  boton.toggleAttribute('data-en-lista', en);
  boton.querySelector('[data-lista-texto]').textContent = texto(en ? 'producto.quitar_lista' : 'producto.agregar_lista');
}

function prepararPedido(raiz) {
  if (raiz.dataset.listo) return;
  raiz.dataset.listo = '1';
  let producto;
  try {
    producto = JSON.parse(raiz.dataset.pedido);
  } catch {
    return;
  }
  const datos = tienda();
  const enlace = raiz.querySelector('[data-whatsapp]');

  const actualizarEnlace = () => {
    if (!enlace) return;
    const { talla, color } = seleccion(raiz);
    const vendedora = vendedoraPara(producto, datos.vendedoras);
    if (vendedora) enlace.href = enlaceWhatsApp(vendedora.whatsapp, mensajeProducto({ catalogo: datos, producto, talla, color }));
  };

  raiz.addEventListener('change', () => {
    actualizarEnlace();
    if (lista.contiene(producto.codigo)) {
      lista.actualizar(producto.codigo, seleccion(raiz));
      avisarCambioLista();
    }
  });

  raiz.querySelector('[data-lista]')?.addEventListener('click', () => {
    if (lista.contiene(producto.codigo)) {
      lista.quitar(producto.codigo);
      avisar(texto('aviso.quitado_lista'), { exito: false });
    } else {
      lista.agregar({ codigo: producto.codigo, ...seleccion(raiz) });
      evento('favorito', { p: producto.id });
      avisar(texto('aviso.agregado_lista'));
    }
    avisarCambioLista();
  });

  // Si ya está en Mi lista, se muestra la talla y el color que eligió.
  const guardado = lista.leer().find((i) => i.codigo === producto.codigo);
  for (const [nombre, valor] of [['talla', guardado?.talla], ['color', guardado?.color]]) {
    const radio = valor ? [...raiz.querySelectorAll(`input[name$="-${nombre}"]`)].find((r) => r.value === valor) : null;
    if (radio && !radio.disabled) radio.checked = true;
  }

  document.addEventListener('lista:cambio', () => sincronizarLista(raiz, producto.codigo));
  sincronizarLista(raiz, producto.codigo);
  actualizarEnlace();
}

export function iniciarPedidos() {
  document.querySelectorAll('[data-pedido]').forEach(prepararPedido);
}
