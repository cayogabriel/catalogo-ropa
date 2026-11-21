// Ayudas comunes de los tests del Panel: un Panel ya instalado y filas de ejemplo.
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

// Panel con la hoja y las carpetas ya creadas (instalar() corrió), con la dueña como usuaria.
export function panelInstalado(opciones) {
  const dobles = crearDobles(opciones);
  const gas = cargarGas('panel', { dobles });
  // El tiempo del Panel es el reloj determinista de los dobles (un Date real haría los tests frágiles).
  gas.ctx.ahora_ = () => new Date(dobles._reloj.ahora());
  const instalacion = gas.ctx.instalar();
  const libro = dobles.SpreadsheetApp.openById(instalacion.hojaId);
  return { ...gas, instalacion, libro, dobles };
}

// Lee la pestaña tal cual está en la hoja: [{columna: valorCrudo}].
export function filasCrudas(libro, pestana) {
  const h = libro.getSheetByName(pestana);
  const ultima = h.getLastRow();
  if (ultima < 2) return [];
  const [enc, ...filas] = h.getRange(1, 1, ultima, h.getLastColumn()).getValues();
  return filas.map((f) => Object.fromEntries(enc.map((c, i) => [c, f[i]])));
}

// Escribe una fila cruda al final (como si se hubiera tecleado a mano en la hoja).
export function escribirCrudo(libro, pestana, objeto) {
  const h = libro.getSheetByName(pestana);
  const enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0];
  h.getRange(h.getLastRow() + 1, 1, 1, enc.length).setValues([enc.map((c) => (c in objeto ? objeto[c] : ''))]);
}
