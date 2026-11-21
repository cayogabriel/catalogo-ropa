import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarPagina } from './plantilla.mjs';
import { iniciarSimulador } from './servidor.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function proyectoTemporal(archivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'sim-'));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    mkdirSync(join(raiz, ruta, '..'), { recursive: true });
    writeFileSync(join(raiz, ruta), contenido);
  }
  return raiz;
}

describe('armarPagina', () => {
  it('reemplaza cada include por el contenido del parcial, en una sola pasada', () => {
    const raiz = proyectoTemporal({
      'ui/index.html': '<html><head></head><body><?!= include_("ui/a") ?>|<?!= include_(\'ui/b\') ?></body></html>',
      'ui/a.html': '<p>AAA</p>',
      'ui/b.html': "<p>include_('ui/a')</p>",
    });
    const html = armarPagina({ raiz });
    expect(html).toContain('<p>AAA</p>|<p>include_(\'ui/a\')</p>');
    expect(html).not.toContain('<?!=');
  });

  it('el servidor real solo define include_: un include() suelto falla igual que en Google', () => {
    const raiz = proyectoTemporal({ 'ui/index.html': '<html><head></head><body><?!= include("ui/a") ?></body></html>', 'ui/a.html': '<p>A</p>' });
    expect(() => armarPagina({ raiz })).toThrow(/include_/);
  });

  it('falla con el nombre de la ruta si el parcial no existe', () => {
    const raiz = proyectoTemporal({ 'ui/index.html': '<html><head></head><body><?!= include_("ui/falta") ?></body></html>' });
    expect(() => armarPagina({ raiz })).toThrow(/ui\/falta/);
  });

  it('inyecta google.script.run falso y la barra del simulador, solo en el simulador', () => {
    const html = armarPagina();
    expect(html).toContain('google.script');
    expect(html).toContain('id="sim-barra"');
    expect(html).not.toMatch(/<\?!?=/);
    const original = readFileSync(join(SRC, 'ui/index.html'), 'utf8');
    expect(original).not.toContain('sim-barra');
    expect(original).not.toContain('/__gas/');
  });
});

describe('iniciarSimulador', () => {
  let sim;
  afterEach(async () => {
    await sim?.cerrar();
  });

  const post = (ruta, cuerpo) =>
    fetch(sim.url + ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }).then((r) => r.json());

  it('GET / sirve la página y POST /__gas/<función> ejecuta el servidor falso', async () => {
    sim = await iniciarSimulador({ puerto: 0 });
    const html = await fetch(sim.url).then((r) => r.text());
    expect(html).toContain('google.script');
    const r = await post('/__gas/listar', { args: ['productos'] });
    expect(r.ok).toBe(true);
    expect(r.valor.filas.length).toBeGreaterThan(0);
  });

  it('un error del servidor falso llega como ok:false con el mensaje y su código', async () => {
    sim = await iniciarSimulador({ puerto: 0 });
    const r = await post('/__gas/guardarCampo', { args: ['productos', 'prd_00000001', 'nombre', 'x', 999] });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/^conflicto:/);
  });

  it('POST /__sim programa una falla para la siguiente llamada', async () => {
    sim = await iniciarSimulador({ puerto: 0 });
    await post('/__sim', { falla: { funcion: 'guardarCampo', codigo: 'limite' } });
    const f = (await post('/__gas/listar', { args: ['productos'] })).valor.filas[0];
    const r = await post('/__gas/guardarCampo', { args: ['productos', f.id, 'stock', 1, f.version] });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/^limite:/);
    const otra = await post('/__gas/guardarCampo', { args: ['productos', f.id, 'stock', 1, f.version] });
    expect(otra.ok).toBe(true);
  });

  it('con sinConexion la conexión se corta (como una red caída)', async () => {
    sim = await iniciarSimulador({ puerto: 0 });
    await post('/__sim', { sinConexion: true });
    await expect(post('/__gas/listar', { args: ['productos'] })).rejects.toThrow();
    await post('/__sim', { sinConexion: false });
    expect((await post('/__gas/listar', { args: ['productos'] })).ok).toBe(true);
  });

  it('reiniciar vuelve a los datos de partida', async () => {
    sim = await iniciarSimulador({ puerto: 0 });
    const f = (await post('/__gas/listar', { args: ['productos'] })).valor.filas[0];
    await post('/__gas/guardarCampo', { args: ['productos', f.id, 'nombre', 'Cambiado', f.version] });
    await post('/__sim', { reiniciar: true });
    expect((await post('/__gas/listar', { args: ['productos'] })).valor.filas[0].nombre).toBe(f.nombre);
  });
});
