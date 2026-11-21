import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ventanaVigente, formatearMonto, formatearFecha } from '../../src/compartido/precio.mjs';
import { interpolar, vendedoraPara, mensajeProducto, mensajeLista, mensajeRevista } from '../../src/compartido/mensajes.mjs';
import { enlaceWhatsApp, urlRed, rutaProducto, rutaTemporada, urlProducto } from '../../src/compartido/enlaces.mjs';

const ejemplo = JSON.parse(readFileSync(new URL('../../../fixtures/catalogo.ejemplo.json', import.meta.url), 'utf8'));
const VES001 = ejemplo.productos.find((p) => p.codigo === 'VES-001');
const v = (desde, hasta, precio) => ({ desde, hasta, precio });

describe('precio', () => {
  const ventanas = [
    v(null, '2026-12-05T00:00:00-05:00', 89),
    v('2026-12-05T00:00:00-05:00', '2026-12-15T00:00:00-05:00', 66.75),
    v('2026-12-15T00:00:00-05:00', null, 89),
  ];

  test('elige la ventana que contiene «ahora»; el fin es exclusivo', () => {
    expect(ventanaVigente(ventanas, Date.parse('2026-12-01T00:00:00-05:00')).precio).toBe(89);
    expect(ventanaVigente(ventanas, Date.parse('2026-12-10T00:00:00-05:00')).precio).toBe(66.75);
    expect(ventanaVigente(ventanas, Date.parse('2026-12-15T00:00:00-05:00'))).toBe(ventanas[2]);
  });

  test('formatea montos con decimales solo si los hay', () => {
    expect(formatearMonto(59)).toBe('S/ 59');
    expect(formatearMonto(59.9)).toBe('S/ 59.90');
    expect(formatearMonto(66.75)).toBe('S/ 66.75');
    expect(formatearMonto(10, '$')).toBe('$ 10');
  });

  test('formatea fechas como dd/mm en hora de Lima', () => {
    expect(formatearFecha('2026-12-05T00:00:00-05:00')).toBe('05/12');
    expect(formatearFecha('2026-12-31T23:30:00-05:00')).toBe('31/12');
    expect(formatearFecha('2027-01-03')).toBe('03/01');
  });
});

describe('mensajes', () => {
  test('interpolar quita la línea entera si una variable queda vacía', () => {
    expect(interpolar('Hola {vendedora}\nTalla: {talla}\nFin', { vendedora: 'Ana', talla: '' })).toBe('Hola Ana\nFin');
    expect(interpolar('A {x}\nB', {})).toBe('B');
  });

  test('sin vendedora asignada usa la vendedora por defecto', () => {
    expect(vendedoraPara(VES001, ejemplo.vendedoras).nombre).toBe('Vendedora 1');
  });

  test('el mensaje de producto usa la plantilla de la tienda con talla, color y precio vigente', () => {
    const m = mensajeProducto({ catalogo: ejemplo, producto: VES001, talla: 'M', color: 'Coral', ahora: Date.parse(ejemplo.generado_en) });
    expect(m).toContain('Vestido Lino Coral');
    expect(m).toContain('VES-001');
    expect(m).toContain('Talla: M');
    expect(m).toContain('S/ 66.75');
    expect(m).toContain('https://cayogabriel.github.io/catalogo-ropa/p/ves-001/');
  });

  test('sin talla elegida, el mensaje no lleva la línea de talla', () => {
    const m = mensajeProducto({ catalogo: ejemplo, producto: VES001, ahora: Date.parse(ejemplo.generado_en) });
    expect(m).not.toContain('Talla:');
  });

  test('si la tienda no tiene plantilla, usa la de respaldo', () => {
    const sinPlantilla = { ...ejemplo, textos: {} };
    expect(mensajeProducto({ catalogo: sinPlantilla, producto: VES001 })).toMatch(/^Hola, me interesa Vestido Lino Coral \(VES-001\)\. https:/);
  });

  test('el mensaje de la lista trae una línea por prenda y el total', () => {
    const blu = ejemplo.productos.find((p) => p.codigo === 'BLU-002');
    const m = mensajeLista({
      catalogo: ejemplo,
      items: [{ producto: VES001, talla: 'M', color: 'Coral' }, { producto: blu, talla: 'S', color: 'Mostaza' }],
      ahora: Date.parse(ejemplo.generado_en),
    });
    expect(m).toContain('- Vestido Lino Coral (VES-001) · M · Coral · S/ 66.75');
    expect(m).toContain('- Blusa Off-Shoulder Mostaza (BLU-002) · S · Mostaza · S/ 59');
    expect(m).toContain('S/ 125.75');
  });

  test('el mensaje desde la revista no pide talla', () => {
    const m = mensajeRevista({ catalogo: ejemplo, producto: VES001, ahora: Date.parse(ejemplo.generado_en) });
    expect(m).toContain('revista');
    expect(m).not.toContain('Talla:');
  });
});

describe('enlaces', () => {
  test('WhatsApp codifica el mensaje', () => {
    expect(enlaceWhatsApp('51000000001', 'Hola ñ')).toBe('https://wa.me/51000000001?text=Hola%20%C3%B1');
  });

  test('redes: chat y perfil, y null si no hay usuario', () => {
    expect(urlRed('instagram', 'tienda.x', 'chat')).toBe('https://ig.me/m/tienda.x');
    expect(urlRed('instagram', 'tienda.x', 'perfil')).toBe('https://instagram.com/tienda.x');
    expect(urlRed('facebook', 'tiendax', 'chat')).toBe('https://m.me/tiendax');
    expect(urlRed('tiktok', 'tienda.x', 'perfil')).toBe('https://www.tiktok.com/@tienda.x');
    expect(urlRed('instagram', null, 'chat')).toBeNull();
  });

  test('rutas relativas a la base y URL absoluta del producto', () => {
    expect(rutaProducto('VES-014')).toBe('p/ves-014/');
    expect(rutaTemporada('verano-2027')).toBe('temporada/verano-2027/');
    expect(urlProducto(ejemplo, 'VES-014')).toBe('https://cayogabriel.github.io/catalogo-ropa/p/ves-014/');
  });
});
