// Simulador local del Panel.
//   node apps-script/panel/dev/servidor.mjs [puerto]      (por defecto 5173)
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { armarPagina } from './plantilla.mjs';
import { crearGasFalso } from './gas-falso.mjs';

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    req.on('data', (t) => trozos.push(t));
    req.on('end', () => {
      try {
        resolve(trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function responder(res, estado, cuerpo, tipo = 'application/json; charset=utf-8') {
  res.writeHead(estado, { 'content-type': tipo, 'cache-control': 'no-store' });
  res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
}

export async function iniciarSimulador({ puerto = 0, gas = crearGasFalso({ demoraMs: 120 }), raiz } = {}) {
  const servidor = http.createServer(async (req, res) => {
    try {
      const ruta = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && ruta === '/') {
        return responder(res, 200, armarPagina(raiz ? { raiz } : {}), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && ruta === '/favicon.ico') return responder(res, 204, '');
      if (req.method === 'POST' && ruta.startsWith('/__gas/')) {
        const nombre = decodeURIComponent(ruta.slice('/__gas/'.length));
        const { args = [] } = await leerCuerpo(req);
        try {
          return responder(res, 200, { ok: true, valor: (await gas.llamar(nombre, args)) ?? null });
        } catch (e) {
          if (e instanceof TypeError) return req.socket.destroy(); // red caída simulada
          return responder(res, 200, { ok: false, mensaje: e.message });
        }
      }
      if (req.method === 'POST' && ruta === '/__sim') {
        const c = await leerCuerpo(req);
        const s = gas.simular;
        if (c.falla) s.falla(c.falla.funcion ?? '*', c.falla.codigo, c.falla.veces ?? 1);
        if (c.demora !== undefined) s.demora(c.demora);
        if (c.sinConexion !== undefined) s.sinConexion(c.sinConexion);
        if (c.publicacionFalla !== undefined) s.publicacionFalla(c.publicacionFalla);
        if (c.reiniciar) s.reiniciar();
        return responder(res, 200, { ok: true });
      }
      return responder(res, 404, { ok: false, mensaje: 'no existe' });
    } catch (e) {
      return responder(res, 500, { ok: false, mensaje: String(e.message ?? e) });
    }
  });
  await new Promise((resolve) => servidor.listen(puerto, '127.0.0.1', resolve));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}`,
    gas,
    cerrar: () => new Promise((resolve) => { servidor.closeAllConnections?.(); servidor.close(resolve); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const puerto = Number(process.argv[2] ?? 5173);
  const sim = await iniciarSimulador({ puerto });
  console.log(`Simulador del Panel en ${sim.url}`);
}
