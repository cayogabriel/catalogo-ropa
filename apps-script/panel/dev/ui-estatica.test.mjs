// Revisiones estáticas de src/ui/: reglas de HtmlService, de privacidad y de accesibilidad que se pueden comprobar leyendo los archivos.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contraste } from '../../../contratos/tokens.mjs';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const UI = join(SRC, 'ui');
const CONTRATO = readFileSync(fileURLToPath(new URL('../../../docs/contracts/api-panel.md', import.meta.url)), 'utf8');

function listar(dir) {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? listar(r) : [r];
  });
}
const archivos = listar(UI);
const html = archivos.filter((a) => a.endsWith('.html'));
const texto = (a) => readFileSync(a, 'utf8');
const nombre = (a) => relative(UI, a).replace(/\\/g, '/');
const sinComentarios = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('reglas de HtmlService', () => {
  it('en src/ui/ no hay archivos .js (subirían como código de servidor)', () => {
    expect(archivos.filter((a) => !a.endsWith('.html')).map(nombre)).toEqual([]);
  });

  it('todo include de index.html apunta a un archivo que existe', () => {
    const index = texto(join(UI, 'index.html'));
    const rutas = [...index.matchAll(/<\?!=\s*include_\(\s*'([^']+)'\s*\)\s*\?>/g)].map((m) => m[1]);
    expect(rutas.length).toBeGreaterThan(10);
    for (const r of rutas) expect(existsSync(join(SRC, `${r}.html`)), r).toBe(true);
  });

  it('index.html no tiene otros scriptlets que include_, y los parciales no incluyen más parciales', () => {
    const index = texto(join(UI, 'index.html'));
    const otros = [...index.matchAll(/<\?[^>]*\?>/g)].map((m) => m[0]).filter((s) => !/^<\?!=\s*include_\(/.test(s));
    expect(otros).toEqual([]);
    for (const a of html.filter((x) => nombre(x) !== 'index.html')) {
      expect(texto(a), nombre(a)).not.toMatch(/<\?/);
    }
  });

  it('todo parcial está incluido en index.html (no quedan archivos sueltos)', () => {
    const index = texto(join(UI, 'index.html'));
    for (const a of html) {
      const n = nombre(a);
      if (n === 'index.html') continue;
      expect(index, n).toContain(`include_('ui/${n.replace(/\.html$/, '')}')`);
    }
  });

  it('tiene <base target="_top"> y los enlaces externos abren aparte', () => {
    expect(texto(join(UI, 'index.html'))).toContain('<base target="_top"');
    for (const a of html) {
      const t = sinComentarios(texto(a));
      for (const m of t.matchAll(/<a\b[^>]*\bhref="https?:\/\/[^"]*"[^>]*>/g)) {
        expect(m[0], `${nombre(a)}: ${m[0]}`).toMatch(/target="_blank"[^>]*rel="noopener|rel="noopener[^"]*"[^>]*target="_blank"/);
      }
      for (const m of t.matchAll(/<a\b[^>]*:href="[^"]*"[^>]*>/g)) {
        if (/sitioUrl|url|enlace/i.test(m[0])) expect(m[0], `${nombre(a)}: ${m[0]}`).toMatch(/target="_blank"/);
      }
    }
  });

  it('los scripts externos son de jsdelivr o cdnjs con versión exacta', () => {
    const todos = html.flatMap((a) => [...texto(a).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]));
    expect(todos.length).toBeGreaterThan(0);
    for (const url of todos) {
      expect(url).toMatch(/^https:\/\/(cdn\.jsdelivr\.net\/npm\/[a-z0-9.@-]+@\d+\.\d+\.\d+\/|cdnjs\.cloudflare\.com\/ajax\/libs\/[\w.-]+\/\d+\.\d+\.\d+\/)/);
    }
  });

  it('no hay hojas de estilo externas (todo el CSS va en estilos.html)', () => {
    for (const a of html) expect(texto(a), nombre(a)).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });
});

describe('privacidad del repositorio público', () => {
  it('sin ids de Drive o Sheets, URLs /exec, correos ni teléfonos reales', () => {
    for (const a of archivos) {
      const t = texto(a);
      expect(t, nombre(a)).not.toMatch(/script\.google\.com\/macros\/s\//);
      expect(t, nombre(a)).not.toMatch(/(spreadsheets|document)\/d\/[A-Za-z0-9_-]{20,}/);
      expect(t, nombre(a)).not.toMatch(/drive\.google\.com\/(file\/d|drive\/folders)\/[A-Za-z0-9_-]{20,}/);
      expect(t, nombre(a)).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
      expect(t, nombre(a)).not.toMatch(/\b51\d{9}\b/);
      expect(t, nombre(a)).not.toMatch(/ghp_[A-Za-z0-9]{10,}|github_pat_/);
    }
  });

  it('localStorage solo se usa para preferencias de la interfaz', () => {
    for (const a of html) {
      const t = texto(a);
      for (const m of t.matchAll(/localStorage|sessionStorage/g)) {
        expect(nombre(a)).toBe('js/estado.html');
      }
    }
    expect(texto(join(UI, 'js/estado.html'))).toMatch(/try \{ return accion\(window\.localStorage\)/);
  });
});

describe('contrato con el servidor', () => {
  it('toda función que la interfaz llama está en api-panel.md', () => {
    const contrato = new Set([...CONTRATO.matchAll(/^\| `([a-zA-Z]+)\(/gm)].map((m) => m[1]));
    const llamadas = new Set();
    for (const a of html) {
      for (const m of texto(a).matchAll(/\b(?:llamar|S\.llamar|servidor\.llamar)\(\s*'([a-zA-Z]+)'/g)) llamadas.add(m[1]);
    }
    expect(llamadas.size).toBeGreaterThan(5);
    for (const f of llamadas) expect(contrato.has(f), `${f} no está en api-panel.md`).toBe(true);
  });
});

describe('accesibilidad estática', () => {
  it('toda imagen tiene alt', () => {
    for (const a of html) {
      const t = sinComentarios(texto(a));
      for (const m of t.matchAll(/<img\b[^>]*>/g)) {
        expect(m[0], `${nombre(a)}: ${m[0]}`).toMatch(/(^|\s)(alt|:alt|x-bind:alt)=/);
      }
    }
  });

  it('todo campo de formulario tiene etiqueta (label envolvente, aria-label o aria-labelledby)', () => {
    for (const a of html) {
      const t = sinComentarios(texto(a));
      for (const m of t.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        if (/type="hidden"/.test(m[0])) continue;
        const conAria = /(^|\s)(aria-label|:aria-label|aria-labelledby|:aria-labelledby)=/.test(m[0]);
        const dentro = t.lastIndexOf('<label', m.index) > t.lastIndexOf('</label>', m.index);
        expect(conAria || dentro, `${nombre(a)}: ${m[0].slice(0, 90)}`).toBe(true);
      }
    }
  });

  it('todo botón que es solo un icono tiene nombre accesible', () => {
    for (const a of html) {
      const t = sinComentarios(texto(a));
      for (const m of t.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        const visible = m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim();
        const conAria = /(aria-label|:aria-label|aria-labelledby|\btitle)=/.test(m[1]);
        const conTextoDinamico = /x-text=/.test(m[1] + m[2]);
        expect(visible.length > 0 || conAria || conTextoDinamico, `${nombre(a)}: ${m[0].slice(0, 100)}`).toBe(true);
      }
    }
  });

  it('los íconos decorativos no se leen (aria-hidden)', () => {
    for (const a of html) {
      const t = sinComentarios(texto(a));
      for (const m of t.matchAll(/<svg\b[^>]*>/g)) {
        expect(m[0], `${nombre(a)}: ${m[0]}`).toMatch(/aria-hidden="true"|role="img"|style="display:none"|width="0"/);
      }
    }
  });
});

describe('estilos del propio panel', () => {
  const css = texto(join(UI, 'estilos.html'));
  const raiz = css.match(/:root\s*\{([\s\S]*?)\}/)[1];
  const t = Object.fromEntries([...raiz.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
  const par = (a, b, min) => ({ a, b, min });

  it('los colores del panel pasan los mismos pares de contraste que la web (WCAG 2.1 AA)', () => {
    const pares = [
      par('texto', 'fondo', 4.5), par('texto-suave', 'fondo', 4.5), par('texto', 'superficie', 4.5),
      par('texto-suave', 'superficie', 4.5), par('sobre-primario', 'primario', 4.5), par('control', 'fondo', 3),
      par('control', 'superficie', 3), par('foco', 'fondo', 3), par('foco', 'superficie', 3), par('primario', 'fondo', 3),
      par('ok', 'ok-fondo', 4.5), par('error', 'error-fondo', 4.5), par('aviso', 'aviso-fondo', 4.5),
      par('texto', 'ok-fondo', 4.5), par('texto', 'error-fondo', 4.5), par('texto', 'aviso-fondo', 4.5),
      par('texto-suave', 'fondo-suave', 4.5), par('texto', 'fondo-suave', 4.5), par('sobre-oscuro', 'oscuro', 4.5),
      par('error', 'superficie', 4.5),
    ];
    for (const { a, b, min } of pares) {
      expect(t[a], `falta --${a}`).toBeTruthy();
      expect(t[b], `falta --${b}`).toBeTruthy();
      expect(contraste(t[a], t[b]), `--${a} sobre --${b}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('define el área táctil mínima de 44 px y la usa en botones y campos', () => {
    expect(css).toMatch(/--alto-toque:\s*44px/);
    expect(css).toMatch(/min-height:\s*var\(--alto-toque\)/);
  });

  it('respeta prefers-reduced-motion y no usa transition: all', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).not.toMatch(/transition:\s*all/);
  });

  it('el foco se ve (outline con --foco)', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^}]*var\(--foco\)/);
  });

  it('los campos de texto usan 16 px o más (iOS no hace zoom al enfocar)', () => {
    expect(css).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*1rem/);
  });
});
