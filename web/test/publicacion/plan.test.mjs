import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  enlaceIr,
  notaVigencia,
  vigenciaCatalogo,
  planRevista,
  planCatalogo,
  revistasDe,
  formatearTelefono,
} from '../../src/components/imprimir/plan.mjs';

const ejemplo = JSON.parse(readFileSync(fileURLToPath(new URL('../../../fixtures/catalogo.ejemplo.json', import.meta.url)), 'utf8'));
const AHORA = Date.parse(ejemplo.generado_en);
const SITIO = ejemplo.tienda.sitio_url;
const verano = ejemplo.temporadas[0];

describe('enlaces y textos', () => {
  test('enlaceIr arma la URL absoluta con el origen y la temporada', () => {
    expect(enlaceIr(ejemplo, 'ves-001', { o: 'pdf', t: 'verano-2027' })).toBe(`${SITIO}ir/ves-001/?o=pdf&t=verano-2027`);
    expect(enlaceIr(ejemplo, 'red/instagram', { o: 'catalogo_pdf' })).toBe(`${SITIO}ir/red/instagram/?o=catalogo_pdf`);
  });

  test('notaVigencia usa el texto de la tienda con la fecha dd/mm', () => {
    expect(notaVigencia(ejemplo, '2026-12-01')).toBe('Precios válidos hasta el 01/12');
  });

  test('formatearTelefono agrupa el número sin el código de país', () => {
    expect(formatearTelefono('51987654321', '51')).toBe('+51 987 654 321');
  });

  test('revistasDe devuelve solo las temporadas con revista', () => {
    const c = structuredClone(ejemplo);
    c.temporadas.push({ ...structuredClone(verano), id: 'tem_00000002', slug: 'otra', revista: false });
    expect(revistasDe(c).map((t) => t.slug)).toEqual(['verano-2027']);
  });
});

describe('vigenciaCatalogo', () => {
  test('toma el último día de la oferta vigente más próxima', () => {
    // VES-001 tiene una oferta que termina el 2026-12-01 a las 11:52.
    expect(vigenciaCatalogo(ejemplo, AHORA)).toBe('2026-12-01');
  });

  test('sin ofertas, son 15 días desde la publicación (hora de Lima)', () => {
    const c = structuredClone(ejemplo);
    c.generado_en = '2026-11-21T23:30:00-05:00';
    for (const p of c.productos) p.precio.ventanas = [{ ...p.precio.ventanas[0], hasta: null, precio: p.precio.regular }];
    expect(vigenciaCatalogo(c, Date.parse('2026-11-21T23:30:00-05:00'))).toBe('2026-12-06');
  });
});

describe('planRevista', () => {
  const plan = planRevista(ejemplo, verano, AHORA);
  const tipos = plan.paginas.map((p) => p.tipo);

  test('empieza con la portada y termina con la contraportada', () => {
    expect(tipos[0]).toBe('portada');
    expect(tipos.at(-1)).toBe('contraportada');
    expect(plan.paginas[0]).toMatchObject({ titulo: verano.titulo, subtitulo: verano.subtitulo, foto: verano.foto_portada });
  });

  test('las fotos destacadas van solas y las demás de a dos, en su orden', () => {
    const editoriales = plan.paginas.filter((p) => p.tipo.startsWith('editorial'));
    expect(editoriales.map((p) => p.tipo)).toEqual([
      'editorial-completa', // tfo 1 (destacada)
      'editorial-doble', // tfo 2 + 3
      'editorial-doble', // tfo 4 + 5
      'editorial-completa', // tfo 6 (destacada)
      'editorial-doble', // tfo 7 + 8
      'editorial-doble', // tfo 9 + 10
    ]);
    expect(editoriales[1].fotos.map((f) => f.texto)).toEqual(['Coral, el color del verano.', 'Marfil y lino, fresco todo el día.']);
  });

  test('la intro va en la primera página editorial', () => {
    expect(plan.paginas[1].intro).toBe(verano.intro);
    expect(plan.paginas.slice(2).some((p) => p.intro)).toBe(false);
  });

  test('las prendas salen en orden de aparición, sin repetir, de a dos', () => {
    const prendas = plan.paginas.filter((p) => p.tipo === 'prendas').flatMap((p) => p.prendas.map((x) => x.producto.codigo));
    expect(prendas.slice(0, 3)).toEqual(['VES-001', 'ACC-002', 'BLU-001']);
    expect(new Set(prendas).size).toBe(prendas.length);
    expect(plan.paginas.filter((p) => p.tipo === 'prendas').every((p) => p.prendas.length <= 2)).toBe(true);
  });

  test('cada prenda enlaza a ir/<código>/ con origen pdf y la temporada', () => {
    const pagina = plan.paginas.find((p) => p.tipo === 'prendas');
    expect(pagina.enlaces).toEqual(pagina.prendas.map((x) => `${SITIO}ir/${x.producto.codigo.toLowerCase()}/?o=pdf&t=verano-2027`));
  });

  test('el precio en oferta trae el antes real y la etiqueta', () => {
    const ves001 = plan.paginas.flatMap((p) => p.prendas ?? []).find((x) => x.producto.codigo === 'VES-001');
    expect(ves001.precio).toMatchObject({ ahora: 'S/ 66.75', antes: 'S/ 89' });
    expect(ves001.insignias[0]).toBe('-25%');
  });

  test('las insignias no se repiten (etiqueta «Liquidación» y liquidación)', () => {
    const acc002 = plan.paginas.flatMap((p) => p.prendas ?? []).find((x) => x.producto.codigo === 'ACC-002');
    expect(new Set(acc002.insignias).size).toBe(acc002.insignias.length);
  });

  test('las editoriales enlazan las prendas de sus créditos', () => {
    expect(plan.paginas[1].enlaces).toEqual([`${SITIO}ir/ves-001/?o=pdf&t=verano-2027`, `${SITIO}ir/acc-002/?o=pdf&t=verano-2027`]);
  });

  test('sin redes, la contraportada enlaza solo a la revista web', () => {
    expect(plan.paginas.at(-1).enlaces).toEqual([`${SITIO}ir/temporada/verano-2027/?o=pdf`]);
    expect(plan.paginas.at(-1).url).toBe(`${SITIO}temporada/verano-2027/`);
  });

  test('con Instagram cargado, agrega su botón', () => {
    const c = structuredClone(ejemplo);
    c.tienda.redes.instagram = 'mitienda';
    const contra = planRevista(c, c.temporadas[0], AHORA).paginas.at(-1);
    expect(contra.enlaces).toContain(`${SITIO}ir/red/instagram/?o=pdf`);
    expect(contra.redes).toEqual([{ red: 'instagram', nombre: 'Instagram', usuario: 'mitienda', enlace: `${SITIO}ir/red/instagram/?o=pdf` }]);
  });

  test('una prenda agotada no aparece', () => {
    const c = structuredClone(ejemplo);
    c.productos.find((p) => p.codigo === 'VES-001').estado = 'agotado';
    const codigos = planRevista(c, c.temporadas[0], AHORA).paginas.flatMap((p) => p.enlaces);
    expect(codigos.some((e) => e.includes('ir/ves-001/'))).toBe(false);
  });

  test('una temporada sin fotos da portada y contraportada, y la intro va en la portada', () => {
    const t = { ...structuredClone(verano), fotos: [] };
    const p = planRevista(ejemplo, t, AHORA);
    expect(p.paginas.map((x) => x.tipo)).toEqual(['portada', 'contraportada']);
    expect(p.paginas[0].intro).toBe(t.intro);
  });

  test('una foto suelta al final va sola con su texto', () => {
    const t = { ...structuredClone(verano), fotos: verano.fotos.slice(0, 2) };
    expect(planRevista(ejemplo, t, AHORA).paginas.map((x) => x.tipo).slice(0, 3)).toEqual(['portada', 'editorial-completa', 'editorial-sola']);
  });

  test('la nota de vigencia es la de la temporada y las páginas se numeran', () => {
    expect(plan.nota).toBe('Precios válidos hasta el 01/12');
    expect(plan.paginas.map((p) => p.numero)).toEqual(plan.paginas.map((_, i) => i + 1));
  });
});

describe('planCatalogo', () => {
  const plan = planCatalogo(ejemplo, AHORA);

  test('portada y páginas de 4 prendas, sin las agotadas', () => {
    const publicadas = ejemplo.productos.filter((p) => p.estado === 'publicado').length;
    expect(plan.paginas[0].tipo).toBe('portada-catalogo');
    expect(plan.paginas.length).toBe(1 + Math.ceil(publicadas / 4));
    expect(plan.paginas.slice(1).every((p) => p.tipo === 'catalogo' && p.prendas.length <= 4)).toBe(true);
  });

  test('ordena por categoría y luego por orden, con origen catalogo_pdf', () => {
    const primera = plan.paginas[1];
    expect(primera.prendas[0].producto.codigo).toBe('VES-001');
    expect(primera.prendas[0].categoria).toBe('Vestidos');
    expect(primera.enlaces[0]).toBe(`${SITIO}ir/ves-001/?o=catalogo_pdf`);
    expect(plan.paginas.at(-1).prendas.at(-1).producto.codigo).toBe('ACC-003');
  });

  test('la portada enlaza al catálogo web', () => {
    expect(plan.paginas[0].enlaces).toEqual([`${SITIO}catalogo/`]);
    expect(plan.nota).toBe('Precios válidos hasta el 01/12');
  });
});
