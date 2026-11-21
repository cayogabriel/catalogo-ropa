#!/usr/bin/env node
// Verifica el contraste WCAG 2.1 de content/paletas.json (sin dependencias).
// Uso: node content/scripts/verificar-contraste.mjs   (sale con código 1 si alguna paleta falla)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

export function luminancia(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const l = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TOKENS = [
  'fondo', 'superficie', 'texto', 'texto-suave', 'borde', 'control', 'primario', 'sobre-primario',
  'acento', 'sobre-acento', 'oferta', 'sobre-oferta', 'liquidacion', 'sobre-liquidacion', 'exito', 'foco',
];

// [primer token, segundo token, mínimo]
const PARES = [
  ['texto', 'fondo', 4.5],
  ['texto-suave', 'fondo', 4.5],
  ['texto', 'superficie', 4.5],
  ['texto-suave', 'superficie', 4.5],
  ['sobre-primario', 'primario', 4.5],
  ['sobre-acento', 'acento', 4.5],
  ['sobre-oferta', 'oferta', 4.5],
  ['sobre-liquidacion', 'liquidacion', 4.5],
  ['control', 'fondo', 3],
  ['foco', 'fondo', 3],
  ['primario', 'fondo', 3],
];

export function verificar(paletas) {
  const resultados = [];
  for (const p of paletas) {
    const filas = [];
    const faltan = TOKENS.filter((t) => !/^#[0-9a-fA-F]{6}$/.test(p.tokens?.['--color-' + t] ?? ''));
    for (const [a, b, min] of PARES) {
      const ca = p.tokens?.['--color-' + a];
      const cb = p.tokens?.['--color-' + b];
      if (!ca || !cb) continue;
      const r = contraste(ca, cb);
      filas.push({ a, b, min, ratio: r, ok: r >= min });
    }
    resultados.push({ paleta: p, filas, faltan, ok: faltan.length === 0 && filas.every((f) => f.ok) });
  }
  return resultados;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const datos = JSON.parse(readFileSync(join(raiz, 'paletas.json'), 'utf8'));
  const res = verificar(datos.paletas);
  const aprobadas = res.filter((r) => r.ok).length;
  let md = '# Informe de contraste (WCAG 2.1 AA)\n\n';
  md += 'Generado con `node content/scripts/verificar-contraste.mjs` (fórmula de luminancia relativa WCAG, sin dependencias).\n\n';
  md += '- Texto normal: mínimo **4,5:1** (texto y texto-suave sobre fondo y superficie; cada `sobre-X` sobre su `X`).\n';
  md += '- Componentes de interfaz: mínimo **3:1** (`control`, `foco` y `primario` sobre fondo).\n\n';
  md += `**Resultado: ${aprobadas} de ${res.length} paletas aprobadas.**\n\n`;
  md += '| Paleta | Estado | Peor par |\n|---|---|---|\n';
  for (const r of res) {
    const peor = r.filas.reduce((m, f) => (f.ratio / f.min < m.ratio / m.min ? f : m), r.filas[0]);
    md += `| ${r.paleta.nombre} (\`${r.paleta.id}\`) | ${r.ok ? '✅ Aprobada' : '❌ Falla'} | ${peor.a} sobre ${peor.b}: ${peor.ratio.toFixed(2)}:1 |\n`;
  }
  for (const r of res) {
    md += `\n## ${r.paleta.nombre} (\`${r.paleta.id}\`) — ${r.ok ? 'aprobada' : 'FALLA'}\n\n`;
    if (r.faltan.length) md += `Tokens faltantes o inválidos: ${r.faltan.join(', ')}\n\n`;
    md += '| Par | Mínimo | Obtenido | |\n|---|---|---|---|\n';
    for (const f of r.filas) {
      md += `| ${f.a} (${r.paleta.tokens['--color-' + f.a]}) sobre ${f.b} (${r.paleta.tokens['--color-' + f.b]}) | ${f.min}:1 | ${f.ratio.toFixed(2)}:1 | ${f.ok ? '✅' : '❌'} |\n`;
    }
  }
  writeFileSync(join(raiz, 'informe-contraste.md'), md, 'utf8');
  for (const r of res) {
    for (const f of r.filas.filter((x) => !x.ok)) {
      console.error(`FALLA ${r.paleta.id}: ${f.a} sobre ${f.b} = ${f.ratio.toFixed(2)} (mín ${f.min})`);
    }
    if (r.faltan.length) console.error(`FALTAN ${r.paleta.id}: ${r.faltan.join(', ')}`);
  }
  console.log(`${aprobadas}/${res.length} paletas aprobadas`);
  process.exit(aprobadas === res.length && res.length >= 12 ? 0 : 1);
}
