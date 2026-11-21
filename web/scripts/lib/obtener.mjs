// Obtiene la copia publicada (desde la API o desde el fixture) y la valida
// contra el contrato. Un catálogo inválido nunca llega al build.
import { readFileSync } from 'node:fs';
import { validarCatalogo } from '@catalogo/contratos';

// Pide una ruta de la API y devuelve el sobre JSON. Apps Script responde una
// página HTML cuando el despliegue no está autorizado o no es público: eso se
// informa con un mensaje que dice qué revisar, en vez de un error de JSON.
export async function leerJsonDeApi(url, fetch) {
  const respuesta = await fetch(url, { redirect: 'follow' });
  if (!respuesta.ok) throw new Error(`API respondió HTTP ${respuesta.status}`);
  const texto = await respuesta.text();
  try {
    return JSON.parse(texto);
  } catch {
    if (/^\s*</.test(texto)) {
      throw new Error(
        'API respondió HTML en lugar de JSON: revisa que el despliegue de la API esté autorizado y con acceso «cualquiera», y que CATALOG_API_URL sea su URL /exec',
      );
    }
    throw new Error(`API respondió algo que no es JSON: ${texto.slice(0, 80)}`);
  }
}

async function leerDeApi(apiUrl, fetch) {
  if (!apiUrl) throw new Error('Falta CATALOG_API_URL (URL /exec de la API pública)');
  const sobre = await leerJsonDeApi(`${apiUrl}?r=catalogo`, fetch);
  if (!sobre.ok) throw new Error(`API respondió: ${sobre.error}`);
  return sobre.datos;
}

export async function obtenerCatalogo({ origen, apiUrl, fetch = globalThis.fetch, rutaFixture }) {
  let datos;
  if (origen === 'fixture') datos = JSON.parse(readFileSync(rutaFixture, 'utf8'));
  else if (origen === 'api') datos = await leerDeApi(apiUrl, fetch);
  else throw new Error(`Origen desconocido: ${origen} (usa api o fixture)`);

  const { ok, errores } = validarCatalogo(datos);
  if (!ok) throw new Error(`El catálogo no cumple el contrato:\n- ${errores.join('\n- ')}`);
  return datos;
}
