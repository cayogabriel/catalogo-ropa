// Ejecuta los archivos .js de un proyecto Apps Script en un único contexto vm,
// con los dobles como globales. Así se comportan como en Google: un solo
// ámbito global compartido, sin módulos, en orden alfabético de ruta.
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearDobles } from './dobles/index.mjs';

const RAIZ_APPS_SCRIPT = fileURLToPath(new URL('../../', import.meta.url));

export function rutaProyecto(proyecto) {
  if (proyecto === 'panel' || proyecto === 'api') return join(RAIZ_APPS_SCRIPT, proyecto, 'src');
  return proyecto instanceof URL ? fileURLToPath(proyecto) : proyecto;
}

function listarJs(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((nombre) => {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return listarJs(ruta);
      return nombre.endsWith('.js') ? [ruta] : [];
    });
}

// orden: 'alfabetico' (por defecto) | 'inverso' | número N (rota la lista N lugares). Google no garantiza el
// orden de carga, así que los tests también cargan en otros órdenes para cazar lecturas entre archivos.
export function cargarGas(proyecto, { dobles = crearDobles(), orden = 'alfabetico' } = {}) {
  const dir = rutaProyecto(proyecto);
  const globales = Object.fromEntries(Object.entries(dobles).filter(([k]) => !k.startsWith('_')));
  const ctx = vm.createContext({ ...globales, console });
  dobles._html.base = dir;
  dobles._html.ctx = ctx;
  let archivos = listarJs(dir);
  if (orden === 'inverso') archivos = [...archivos].reverse();
  else if (typeof orden === 'number') archivos = [...archivos.slice(orden), ...archivos.slice(0, orden)];
  for (const archivo of archivos) {
    vm.runInContext(readFileSync(archivo, 'utf8'), ctx, { filename: archivo });
  }
  return { ctx, dobles, valor: (expr) => vm.runInContext(expr, ctx) };
}
