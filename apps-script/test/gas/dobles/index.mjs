// Reúne todos los dobles. Lo que empieza con _ son ayudas para los tests y no
// se expone al código GAS.
import { crearDrive, MimeType } from './drive.mjs';
import { crearHojas } from './hojas.mjs';
import {
  crearPropiedades,
  crearCache,
  crearCandado,
  crearUrlFetch,
  crearUtilidades,
  crearSesion,
  crearContenido,
  crearHtml,
} from './servicios.mjs';

// Reloj determinista: arranca el 1/12/2026 12:00 (Lima) y avanza 1 s por escritura,
// para que «el más reciente» sea siempre claro en los tests. saltar(ms) adelanta el tiempo.
function crearReloj(inicio = Date.parse('2026-12-01T12:00:00-05:00')) {
  let t = inicio;
  return { ahora: () => t, avanzar: () => (t += 1000), saltar: (ms) => (t += ms) };
}

export function crearDobles({ usuario = 'duena@example.com', dueno = 'duena@example.com' } = {}) {
  const reloj = crearReloj();
  const drive = crearDrive(reloj, { dueno });
  const hojas = crearHojas(drive);
  const propiedades = crearPropiedades();
  const cache = crearCache(reloj);
  const candado = crearCandado();
  const url = crearUrlFetch();
  const html = crearHtml();
  const registro = [];

  return {
    SpreadsheetApp: hojas.SpreadsheetApp,
    DriveApp: drive.DriveApp,
    MimeType,
    PropertiesService: propiedades.PropertiesService,
    CacheService: cache.CacheService,
    LockService: candado.LockService,
    UrlFetchApp: url.UrlFetchApp,
    ...crearUtilidades(),
    ...crearSesion({ usuario, dueno }),
    ...crearContenido(),
    HtmlService: html.HtmlService,
    Logger: { log: (...a) => void registro.push(a.join(' ')) },
    _drive: drive.ayudas,
    _hojas: hojas.libros,
    _propiedades: propiedades.almacen,
    _cache: cache.almacen,
    _candado: candado.estado,
    _url: url.ayudas,
    _html: html.estado,
    _registro: registro,
    _reloj: reloj,
  };
}
