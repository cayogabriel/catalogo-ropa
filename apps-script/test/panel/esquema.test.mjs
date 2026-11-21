import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cargarGas } from '../gas/cargar.mjs';

const ESQUEMA = cargarGas('panel').valor('ESQUEMA');
const md = readFileSync(new URL('../../../docs/contracts/modelo-datos.md', import.meta.url), 'utf8');

function seccion(pestana) {
  const partes = md.split('\n## ');
  return partes.find((p) => p.startsWith(`\`${pestana}\``)) ?? '';
}

describe('ESQUEMA de la hoja', () => {
  test('tiene las 14 pestañas del diseño, en orden', () => {
    expect(Object.keys(ESQUEMA)).toEqual([
      'productos',
      'categorias',
      'secciones',
      'portadas',
      'ofertas',
      'temporadas',
      'temporada_fotos',
      'paletas',
      'vendedoras',
      'textos',
      'config',
      'eventos',
      'estadisticas_diarias',
      'historial',
    ]);
  });

  test('modelo-datos.md documenta cada pestaña y cada columna', () => {
    for (const [pestana, columnas] of Object.entries(ESQUEMA)) {
      const texto = seccion(pestana);
      expect(texto, `falta la sección de ${pestana}`).not.toBe('');
      for (const col of columnas) expect(texto, `${pestana}.${col}`).toContain(`\`${col}\``);
    }
  });

  test('las pestañas editables llevan version al final', () => {
    const sinVersion = ['config', 'eventos', 'estadisticas_diarias', 'historial'];
    for (const [pestana, columnas] of Object.entries(ESQUEMA)) {
      if (sinVersion.includes(pestana)) continue;
      expect(columnas.at(-1), pestana).toBe('version');
    }
  });
});
