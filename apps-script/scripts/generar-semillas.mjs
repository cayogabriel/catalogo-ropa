// Genera los archivos del Panel que dependen de otras carpetas (el código de Apps Script no puede leerlas):
//   - semillas.js: paletas, textos y plantillas de WhatsApp de content/ (los carga instalar() si las pestañas están vacías).
//   - contraste.js: pares de contraste y tokens de @catalogo/contratos (los usa validarPaleta).
// Uso: npm run semillas -w apps-script      (un test avisa si los archivos quedaron desactualizados)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PARES_CONTRASTE, TOKENS } from '@catalogo/contratos';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const DESTINO = fileURLToPath(new URL('../panel/src/server/', import.meta.url));
const leerJson = (ruta) => JSON.parse(readFileSync(RAIZ + ruta, 'utf8'));

const ENCABEZADO = (fuente) =>
  `// GENERADO por apps-script/scripts/generar-semillas.mjs a partir de ${fuente}. No editar a mano:\n// corre «npm run semillas -w apps-script» y vuelve a subir.\n\n`;

export function generarArchivos() {
  const paletas = leerJson('content/paletas.json').paletas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    temporada: p.temporada,
    uso: p.uso.join(','),
    tokens: p.tokens,
    fuente_titulos: p.fuentes.titulos,
    fuente_texto: p.fuentes.texto,
    radio: p.radio,
    origen: 'predefinida',
  }));

  const textos = Object.entries(leerJson('content/textos.json'))
    .filter(([clave]) => !clave.startsWith('_'))
    .map(([clave, valor]) => ({ clave, valor }));
  // Las plantillas de WhatsApp viven en la pestaña `textos`, con claves whatsapp.<nombre>.
  for (const [nombre, plantilla] of Object.entries(leerJson('content/plantillas-whatsapp.json').plantillas)) {
    textos.push({ clave: `whatsapp.${nombre}`, valor: plantilla.mensaje });
  }

  const semillas =
    ENCABEZADO('content/paletas.json, content/textos.json y content/plantillas-whatsapp.json') +
    `const SEMILLAS = ${JSON.stringify({ paletas, textos }, null, 2)};\n`;
  const contraste =
    ENCABEZADO('@catalogo/contratos (contratos/tokens.mjs)') +
    `const TOKENS_CONTRATO = ${JSON.stringify(TOKENS, null, 2)};\n\n` +
    `const PARES_CONTRASTE = ${JSON.stringify(PARES_CONTRASTE, null, 2)};\n`;
  return { 'semillas.js': semillas, 'contraste.js': contraste };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [nombre, contenido] of Object.entries(generarArchivos())) {
    writeFileSync(DESTINO + nombre, contenido);
    console.log(`escrito apps-script/panel/src/server/${nombre}`);
  }
}
