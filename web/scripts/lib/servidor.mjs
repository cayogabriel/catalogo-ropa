// Servidor estático mínimo para imprimir dist/ con Chromium, bajo la misma
// base que GitHub Pages (/catalogo-ropa/). Solo escucha en 127.0.0.1.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function archivoPedido(raiz, base, pathname) {
  if (!pathname.startsWith(base)) return null;
  let relativa;
  try {
    relativa = decodeURIComponent(pathname.slice(base.length));
  } catch {
    return null;
  }
  const ruta = resolve(raiz, relativa);
  if (ruta !== raiz && !ruta.startsWith(raiz + sep)) return null;
  if (!existsSync(ruta)) return null;
  if (statSync(ruta).isDirectory()) {
    const indice = join(ruta, 'index.html');
    return existsSync(indice) ? indice : null;
  }
  return ruta;
}

export function servirDist(dir, base = '/') {
  const raiz = resolve(dir);
  const servidor = createServer((pedido, respuesta) => {
    const { pathname } = new URL(pedido.url, 'http://localhost');
    const archivo = archivoPedido(raiz, base, pathname);
    if (!archivo) {
      respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    respuesta.writeHead(200, { 'content-type': TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(archivo).pipe(respuesta);
  });
  return new Promise((listo) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      listo({ url: `http://127.0.0.1:${port}${base}`, cerrar: () => new Promise((fin) => servidor.close(fin)) });
    });
  });
}
