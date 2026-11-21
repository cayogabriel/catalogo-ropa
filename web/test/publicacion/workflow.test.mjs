import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const flujo = parse(readFileSync(fileURLToPath(new URL('../../../.github/workflows/publicar.yml', import.meta.url)), 'utf8'));
const { construir, desplegar } = flujo.jobs;
const indice = (patron) => construir.steps.findIndex((p) => patron.test(`${p.run ?? ''} ${p.uses ?? ''}`));

describe('publicar.yml', () => {
  test('construir sigue el orden publicar → build → documentos → verificar → upload', () => {
    const pasos = [
      indice(/npm run publicar -w web/),
      indice(/npm run build -w web/),
      indice(/npm run documentos -w web/),
      indice(/npm run verificar:build -w web/),
      indice(/actions\/upload-pages-artifact/),
    ];
    expect(pasos.every((i) => i >= 0)).toBe(true);
    expect([...pasos].sort((a, b) => a - b)).toEqual(pasos);
  });

  test('instala Chromium con caché antes de generar los documentos', () => {
    const cache = construir.steps.findIndex((p) => p.uses?.startsWith('actions/cache') && String(p.with?.path).includes('ms-playwright'));
    const instalar = indice(/playwright install/);
    expect(cache).toBeGreaterThanOrEqual(0);
    expect(instalar).toBeGreaterThan(cache);
    expect(instalar).toBeLessThan(indice(/npm run documentos -w web/));
    expect(construir.steps[cache].with.key).toMatch(/playwright/);
  });

  test('desplegar espera a construir y solo ese job puede escribir en Pages', () => {
    expect(desplegar.needs).toBe('construir');
    expect(desplegar.permissions).toMatchObject({ pages: 'write', 'id-token': 'write' });
    expect(flujo.permissions).toEqual({ contents: 'read' });
    expect(construir.permissions?.pages).toBeUndefined();
    expect(construir.permissions?.['id-token']).toBeUndefined();
  });

  test('los dos jobs tienen timeout-minutes', () => {
    expect(construir['timeout-minutes']).toBeGreaterThan(0);
    expect(desplegar['timeout-minutes']).toBeGreaterThan(0);
  });

  test('la caché de fotos depende del proceso de fotos', () => {
    const fotos = construir.steps.find((p) => p.uses?.startsWith('actions/cache') && p.with?.path === 'web/.cache');
    expect(fotos.with.key).toMatch(/hashFiles\(.*fotos\.mjs/);
  });
});
