// Vuelve a elegir la ventana de precio al cargar (regla 1): precio, insignias, cuenta
// regresiva, secciones de ofertas/liquidación (regla 2) y portadas con fecha.
import { formatearMonto, ventanaVigente } from '../compartido/precio.mjs';
import { presentarPrecio, insignias, requisitoCumplido, restante } from '../lib/vista-precio.mjs';
import { vigente } from '../lib/datos.mjs';
import { texto, tienda } from './comun.mjs';

const leer = (el, clave) => {
  try {
    return JSON.parse(el.dataset[clave]);
  } catch {
    return null;
  }
};

function pintarPrecio(el, datos, ahora, simbolo) {
  const p = presentarPrecio(datos, ahora);
  const precio = el.querySelector('.precio');
  if (precio) {
    precio.toggleAttribute('data-oferta', p.oferta);
    precio.querySelector('[data-ahora]').textContent = formatearMonto(p.precio, simbolo);
    precio.querySelector('[data-etiqueta-ahora]').hidden = !p.oferta;
    const bloqueAntes = precio.querySelector('[data-bloque-antes]');
    bloqueAntes.hidden = p.antes === null;
    if (p.antes !== null) precio.querySelector('[data-antes]').textContent = formatearMonto(p.antes, simbolo);
    const pct = precio.querySelector('[data-pct]');
    pct.hidden = p.pct === null;
    if (p.pct !== null) pct.textContent = texto('precio.descuento', { porcentaje: p.pct });
  }

  const ul = el.querySelector('[data-insignias]');
  if (ul) {
    const nuevas = insignias(datos, ahora, texto);
    const firma = nuevas.map((i) => i.tipo + i.texto).join('|');
    if (ul.dataset.firma !== firma) {
      ul.dataset.firma = firma;
      ul.replaceChildren(
        ...nuevas.map((i) => {
          const li = document.createElement('li');
          li.className = `insignia insignia-${i.tipo}${i.repitePct ? ' repite-pct' : ''}`;
          li.textContent = i.texto;
          return li;
        }),
      );
    }
  }

  const cuenta = el.querySelector('[data-cuenta]');
  if (cuenta) {
    const r = p.cuentaRegresiva ? restante(p.hasta, ahora) : null;
    cuenta.hidden = !r;
    if (r) {
      const partes = [];
      if (r.dias) partes.push(`${r.dias} ${texto('cuenta_regresiva.dias')}`);
      if (r.dias || r.horas) partes.push(`${r.horas} ${texto('cuenta_regresiva.horas')}`);
      partes.push(`${r.minutos} ${texto('cuenta_regresiva.minutos')}`);
      cuenta.querySelector('[data-cuenta-valor]').textContent = partes.join(' ');
    }
  }

  const requisito = el.dataset.requisito;
  if (requisito) el.hidden = !requisitoCumplido(requisito, ventanaVigente(datos.precio.ventanas, ahora));
}

function actualizar() {
  const ahora = Date.now();
  const simbolo = tienda().tienda?.moneda?.simbolo ?? 'S/';
  for (const el of document.querySelectorAll('[data-precio]')) {
    const datos = leer(el, 'precio');
    if (datos) pintarPrecio(el, datos, ahora, simbolo);
  }
  // Una sección de ofertas o liquidación sin prendas vigentes se oculta.
  for (const s of document.querySelectorAll('[data-seccion-requisito]')) {
    s.hidden = !s.querySelector('[data-requisito]:not([hidden])');
  }
  for (const el of document.querySelectorAll('[data-vigencia]')) {
    const v = leer(el, 'vigencia');
    if (v) el.hidden = !vigente(v, ahora);
  }
  document.dispatchEvent(new CustomEvent('precios:actualizados'));
}

export function iniciarPrecios() {
  actualizar();
  // La cuenta regresiva y los cambios de ventana se revisan cada minuto.
  setInterval(actualizar, 60_000);
}
