import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { validarCatalogo } from '@catalogo/contratos';

const raiz = new URL('../fixtures/', import.meta.url);
const ejemplo = JSON.parse(readFileSync(new URL('catalogo.ejemplo.json', raiz), 'utf8'));
const rutaImagen = (id) => new URL(`img/${id}.jpg`, raiz);

describe('catálogo de ejemplo', () => {
  test('cumple el contrato completo', () => {
    const r = validarCatalogo(ejemplo);
    expect(r.errores).toEqual([]);
  });

  test('tiene 20 productos', () => {
    expect(ejemplo.productos).toHaveLength(20);
  });

  test('la temporada activa tiene 10 fotos', () => {
    const activa = ejemplo.temporadas.find((t) => t.id === ejemplo.temporada_activa_id);
    expect(activa).toBeDefined();
    expect(activa.fotos).toHaveLength(10);
  });

  test('hay al menos una oferta con cuenta regresiva y una liquidación', () => {
    const ventanas = ejemplo.productos.flatMap((p) => p.precio.ventanas);
    expect(ventanas.some((v) => v.cuenta_regresiva && v.hasta !== null)).toBe(true);
    expect(ventanas.some((v) => v.liquidacion)).toBe(true);
  });

  test('los números de WhatsApp de ejemplo no son celulares reales de Perú', () => {
    for (const v of ejemplo.vendedoras) expect(v.whatsapp).toMatch(/^510{6}/);
  });

  test('cada foto del índice tiene su JPG', () => {
    const faltan = Object.keys(ejemplo.fotos).filter((id) => !existsSync(rutaImagen(id)));
    expect(faltan).toEqual([]);
  });

  test('las fotos son 4:5 de 1200×1500, salvo las portadas de escritorio (1920×1080)', async () => {
    const escritorio = new Set(ejemplo.portadas.map((p) => p.foto_escritorio.id));
    for (const id of Object.keys(ejemplo.fotos)) {
      const { width, height } = await sharp(readFileSync(rutaImagen(id))).metadata();
      const esperado = escritorio.has(id) ? [1920, 1080] : [1200, 1500];
      expect([id, width, height]).toEqual([id, ...esperado]);
    }
  });
});
