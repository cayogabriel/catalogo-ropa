// Ayuda de pruebas: ejecuta el JavaScript de uno o varios parciales .html de la interfaz en un contexto vm,
// con `window` como el propio ámbito global. Los módulos de ui/js/ no tocan el DOM, así que corren en Node.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

export function scriptsDe(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

// cargarParcial(['ui/js/util', 'ui/js/cola'], { google, setTimeout, … }) → { Panel, ctx }
export function cargarParcial(rutas, globales = {}) {
  const lista = Array.isArray(rutas) ? rutas : [rutas];
  const ctx = vm.createContext({ console, ...globales });
  // Temporizadores y Date se leen del ámbito de Node en cada uso, para que vi.useFakeTimers() también los controle.
  for (const nombre of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']) {
    if (!(nombre in globales)) Object.defineProperty(ctx, nombre, { get: () => globalThis[nombre], configurable: true });
  }
  ctx.window = ctx;
  for (const ruta of lista) {
    const html = readFileSync(`${SRC}${ruta}.html`, 'utf8');
    scriptsDe(html).forEach((codigo, i) => vm.runInContext(codigo, ctx, { filename: `${ruta}.html#${i}` }));
  }
  return { Panel: ctx.Panel, ctx };
}
