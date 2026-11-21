// Tokens de paleta y reglas de contraste (WCAG 2.1). Ver docs/contracts/tokens-diseno.md.

export const TOKENS = [
  '--color-fondo',
  '--color-superficie',
  '--color-texto',
  '--color-texto-suave',
  '--color-borde',
  '--color-control',
  '--color-primario',
  '--color-sobre-primario',
  '--color-acento',
  '--color-sobre-acento',
  '--color-oferta',
  '--color-sobre-oferta',
  '--color-liquidacion',
  '--color-sobre-liquidacion',
  '--color-exito',
  '--color-foco',
];

export const PARES_CONTRASTE = [
  { a: '--color-texto', b: '--color-fondo', min: 4.5 },
  { a: '--color-texto-suave', b: '--color-fondo', min: 4.5 },
  { a: '--color-texto', b: '--color-superficie', min: 4.5 },
  { a: '--color-texto-suave', b: '--color-superficie', min: 4.5 },
  { a: '--color-sobre-primario', b: '--color-primario', min: 4.5 },
  { a: '--color-sobre-acento', b: '--color-acento', min: 4.5 },
  { a: '--color-sobre-oferta', b: '--color-oferta', min: 4.5 },
  { a: '--color-sobre-liquidacion', b: '--color-liquidacion', min: 4.5 },
  { a: '--color-control', b: '--color-fondo', min: 3 },
  { a: '--color-foco', b: '--color-fondo', min: 3 },
  { a: '--color-primario', b: '--color-fondo', min: 3 },
];

function canalLineal(valor8bits) {
  const c = valor8bits / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`color inválido: ${hex}`);
  const n = parseInt(m[1], 16);
  const r = canalLineal((n >> 16) & 255);
  const g = canalLineal((n >> 8) & 255);
  const b = canalLineal(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(hexA, hexB) {
  const la = luminancia(hexA);
  const lb = luminancia(hexB);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

// Revisa una paleta completa: tokens faltantes y pares que no llegan al mínimo.
export function revisarPaleta(tokens) {
  const faltantes = TOKENS.filter((t) => !(t in tokens));
  const fallos = [];
  for (const { a, b, min } of PARES_CONTRASTE) {
    if (!(a in tokens) || !(b in tokens)) continue;
    const valor = contraste(tokens[a], tokens[b]);
    if (valor < min) fallos.push({ a, b, min, valor: Math.round(valor * 100) / 100 });
  }
  return { ok: faltantes.length === 0 && fallos.length === 0, faltantes, fallos };
}
