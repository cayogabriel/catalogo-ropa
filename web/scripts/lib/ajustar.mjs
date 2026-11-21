// Ajuste de textos de las páginas de impresión. Corre DENTRO de Chromium
// (page.evaluate(ajustarPaginas)), así que no puede usar nada de afuera.
//
// Una página «desborda» si su contenido pasa del alto (flujo), si un
// [data-bloque] se sale de la zona segura (encima del pie) o si dos
// [data-bloque] se pisan. Para arreglarla:
//   1. achica de a poco los [data-ajustar] de la página, cada uno hasta su
//      piso: la mitad de su tamaño, pero nunca menos de 26 px (≈ 9,5 px en
//      un celular). Así ceden primero los títulos grandes y el texto chico
//      sigue legible;
//   2. si no alcanza, recorta líneas del texto más largo (con «…»).
// Devuelve un aviso por cada texto recortado ({ pagina, recortado: true,
// texto }) y uno por cada página que igual no cabe ({ recortado: false }).
export function ajustarPaginas() {
  const ALTO_PIE = 96;
  const PISO_PX = 26;
  const piso = (base) => Math.min(base, Math.max(PISO_PX, base * 0.5));

  const seSolapan = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

  function desborda(pagina) {
    if (pagina.scrollHeight > pagina.clientHeight + 1 || pagina.scrollWidth > pagina.clientWidth + 1) return true;
    const marco = pagina.getBoundingClientRect();
    const bloques = [...pagina.querySelectorAll('[data-bloque]')];
    const rects = bloques.map((b) => b.getBoundingClientRect());
    for (let i = 0; i < bloques.length; i++) {
      const r = rects[i];
      const b = bloques[i];
      if (r.top < marco.top - 1 || r.left < marco.left - 1 || r.right > marco.right + 1 || r.bottom > marco.bottom - ALTO_PIE + 1) return true;
      if (b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1) return true;
      for (let j = i + 1; j < bloques.length; j++) {
        if (b.contains(bloques[j]) || bloques[j].contains(b)) continue;
        if (seSolapan(r, rects[j])) return true;
      }
    }
    return false;
  }

  const avisos = [];
  document.querySelectorAll('.pagina').forEach((pagina, i) => {
    if (!desborda(pagina)) return;
    const ajustables = [...pagina.querySelectorAll('[data-ajustar]')];
    const minimos = ajustables.map((el) => piso(parseFloat(getComputedStyle(el).fontSize)));
    const actual = ajustables.map((el) => parseFloat(getComputedStyle(el).fontSize));
    while (desborda(pagina) && actual.some((t, k) => t > minimos[k])) {
      ajustables.forEach((el, k) => {
        actual[k] = Math.max(minimos[k], actual[k] * 0.95);
        el.style.fontSize = `${actual[k]}px`;
      });
    }

    // Recorte por palabras, con «…», del texto más largo primero. Solo textos
    // sin elementos adentro: los que tienen enlaces (créditos, contactos)
    // nunca se tocan, para no perder un botón.
    const recortables = ajustables.filter((el) => el.children.length === 0).sort((a, b) => b.textContent.length - a.textContent.length);
    // Si ni dejando una palabra en cada texto la página cabe, el problema está
    // en otro lado: no se recorta nada y se avisa que no cabe.
    const originales = recortables.map((el) => el.textContent);
    recortables.forEach((el) => {
      el.textContent = `${el.textContent.trim().split(/\s+/)[0]}…`;
    });
    const recortarSirve = !desborda(pagina);
    recortables.forEach((el, k) => {
      el.textContent = originales[k];
    });
    for (const el of recortarSirve ? recortables : []) {
      if (!desborda(pagina)) break;
      const original = el.textContent.trim().replace(/\s+/g, ' ');
      const palabras = original.split(' ');
      let cabe = 0;
      let hasta = palabras.length - 1;
      while (cabe < hasta) {
        const medio = Math.ceil((cabe + hasta) / 2);
        el.textContent = `${palabras.slice(0, medio).join(' ')}…`;
        if (desborda(pagina)) hasta = medio - 1;
        else cabe = medio;
      }
      el.textContent = `${palabras.slice(0, Math.max(1, cabe)).join(' ')}…`;
      avisos.push({ pagina: i + 1, recortado: true, texto: original.slice(0, 80) });
    }
    if (desborda(pagina)) avisos.push({ pagina: i + 1, recortado: false, texto: '' });
  });
  return avisos;
}
