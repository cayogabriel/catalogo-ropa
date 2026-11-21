// Obtiene la copia publicada (desde la API o desde el fixture) y la valida
// contra el contrato. Un catálogo inválido nunca llega al build.
import { readFileSync } from 'node:fs';
import { validarCatalogo } from '@catalogo/contratos';

async function leerDeApi(apiUrl, fetch) {
  if (!apiUrl) throw new Error('Falta CATALOG_API_URL (URL /exec de la API pública)');
  const respuesta = await fetch(`${apiUrl}?r=catalogo`, { redirect: 'follow' });
  if (!respuesta.ok) throw new Error(`API respondió HTTP ${respuesta.status}`);
  const sobre = await respuesta.json();
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
