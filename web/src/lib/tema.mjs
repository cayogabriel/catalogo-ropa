// Tema de una paleta: tokens para el atributo style del <html> (:root) y URL de Google Fonts.
// Contrato: docs/contracts/tokens-diseno.md. Los valores se filtran para que nada se inyecte.
const HEX = /^#[0-9A-Fa-f]{6}$/;
const RADIO = /^[0-9]{1,3}(px|rem)$/;
const limpiarFuente = (nombre) => String(nombre ?? '').replace(/[^A-Za-z0-9 ]/g, '').trim();

export function estiloTokens(paleta) {
  const partes = Object.entries(paleta.tokens)
    .filter(([token, valor]) => /^--color-[a-z-]+$/.test(token) && HEX.test(valor))
    .map(([token, valor]) => `${token}:${valor}`);
  const titulos = limpiarFuente(paleta.fuentes.titulos);
  const texto = limpiarFuente(paleta.fuentes.texto);
  if (titulos) partes.push(`--fuente-titulos:'${titulos}'`);
  if (texto) partes.push(`--fuente-texto:'${texto}'`);
  if (RADIO.test(paleta.radio)) partes.push(`--radio:${paleta.radio}`);
  return partes.join(';');
}

// Máximo 2 familias y 2 pesos: títulos 400 (todas las familias lo tienen) y texto 400 y 700.
export function urlFuentes(paleta) {
  const familia = (nombre, pesos) => `family=${limpiarFuente(nombre).replace(/ +/g, '+')}:wght@${pesos}`;
  const titulos = limpiarFuente(paleta.fuentes.titulos);
  const texto = limpiarFuente(paleta.fuentes.texto);
  const familias = titulos === texto ? [familia(texto, '400;700')] : [familia(titulos, '400'), familia(texto, '400;700')];
  return `https://fonts.googleapis.com/css2?${familias.join('&')}&display=swap`;
}
