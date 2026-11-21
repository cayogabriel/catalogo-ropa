// Arma la página del Panel como lo hace Google: <?!= include_('ruta') ?> se reemplaza una sola vez
// (el contenido incluido no se vuelve a evaluar) y se le inyecta el simulador.
// El servidor real (S2) solo define include_: cualquier otro scriptlet falla aquí, como fallaría en Google.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DEV = fileURLToPath(new URL('./', import.meta.url));

const INCLUDE = /<\?!=\s*include_\(\s*(['"])([^'"]+)\1\s*\)\s*\?>/g;

export function resolverIncludes(html, raiz) {
  const otro = html.replace(INCLUDE, '').match(/<\?[^>]*\?>/);
  if (otro) throw new Error(`scriptlet no soportado: ${otro[0]} (solo existe include_ en el servidor)`);
  return html.replace(INCLUDE, (_, _c, ruta) => {
    try {
      return readFileSync(join(raiz, `${ruta}.html`), 'utf8');
    } catch {
      throw new Error(`include_('${ruta}'): no existe ${ruta}.html en ${raiz}`);
    }
  });
}

export function armarPagina({ raiz = SRC, inyectar = true } = {}) {
  let html = resolverIncludes(readFileSync(join(raiz, 'ui/index.html'), 'utf8'), raiz);
  if (!inyectar) return html;
  const cliente = `<script>${readFileSync(join(DEV, 'cliente-gas-falso.js'), 'utf8')}</script>`;
  const barra = readFileSync(join(DEV, 'barra-simulador.html'), 'utf8');
  html = html.includes('</head>') ? html.replace('</head>', `${cliente}</head>`) : cliente + html;
  html = html.includes('</body>') ? html.replace('</body>', `${barra}</body>`) : html + barra;
  return html;
}
