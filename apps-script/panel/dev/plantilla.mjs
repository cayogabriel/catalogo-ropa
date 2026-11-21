// Arma la página del Panel como lo hace Google: <?!= include('ruta') ?> se reemplaza una sola vez
// (el contenido incluido no se vuelve a evaluar) y se le inyecta el simulador.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DEV = fileURLToPath(new URL('./', import.meta.url));

const INCLUDE = /<\?!=\s*include\(\s*(['"])([^'"]+)\1\s*\)\s*\?>/g;

export function resolverIncludes(html, raiz) {
  return html.replace(INCLUDE, (_, _c, ruta) => {
    try {
      return readFileSync(join(raiz, `${ruta}.html`), 'utf8');
    } catch {
      throw new Error(`include('${ruta}'): no existe ${ruta}.html en ${raiz}`);
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
