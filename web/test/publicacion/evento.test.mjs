import { describe, test, expect, vi } from 'vitest';
import { origenDe, rutaEvento, idSesion, construirEvento, redirigir } from '../../src/components/imprimir/evento.mjs';

const PATRON_PG = /^\/[A-Za-z0-9/_.?=&%-]{0,199}$/;

describe('evento de las páginas ir/', () => {
  test('el origen sale de ?o= y solo acepta pdf o catalogo_pdf', () => {
    expect(origenDe('?o=catalogo_pdf')).toBe('catalogo_pdf');
    expect(origenDe('?o=pdf&t=verano-2027')).toBe('pdf');
    expect(origenDe('')).toBe('pdf');
    expect(origenDe('?o=web')).toBe('pdf');
  });

  test('la ruta del evento va sin la base del sitio y cumple el patrón del contrato', () => {
    expect(rutaEvento('/catalogo-ropa/ir/ves-001/', '/catalogo-ropa/')).toBe('/ir/ves-001/');
    expect(rutaEvento('/ir/ves-001/', '/')).toBe('/ir/ves-001/');
    const larga = rutaEvento(`/catalogo-ropa/ir/${'x'.repeat(300)}/`, '/catalogo-ropa/');
    expect(larga).toMatch(PATRON_PG);
    expect(rutaEvento('/catalogo-ropa/ir/ñandú/', '/catalogo-ropa/')).toMatch(PATRON_PG);
  });

  test('el id de sesión tiene de 8 a 32 caracteres [a-z0-9]', () => {
    expect(idSesion()).toMatch(/^[a-z0-9]{8,32}$/);
  });

  test('construirEvento arma el cuerpo del contrato', () => {
    expect(construirEvento({ t: 'whatsapp', p: 'prd_00000001', s: null, o: 'pdf', pg: '/ir/ves-001/', ss: 'abcdefgh' })).toEqual({
      t: 'whatsapp',
      p: 'prd_00000001',
      s: null,
      o: 'pdf',
      pg: '/ir/ves-001/',
      ss: 'abcdefgh',
    });
  });

  test('redirigir envía el evento con sendBeacon y luego reemplaza la ubicación', () => {
    const orden = [];
    const navegador = { sendBeacon: vi.fn(() => orden.push('beacon') && true) };
    const ubicacion = { replace: vi.fn(() => orden.push('replace')) };
    redirigir({ destino: 'https://wa.me/1', evento: { t: 'whatsapp' }, apiUrl: 'https://api.test/exec', navegador, ubicacion });
    expect(navegador.sendBeacon).toHaveBeenCalledWith('https://api.test/exec', JSON.stringify({ t: 'whatsapp' }));
    expect(ubicacion.replace).toHaveBeenCalledWith('https://wa.me/1');
    expect(orden).toEqual(['beacon', 'replace']);
  });

  test('sin URL de la API no envía nada, pero redirige igual', () => {
    const navegador = { sendBeacon: vi.fn() };
    const ubicacion = { replace: vi.fn() };
    redirigir({ destino: 'https://wa.me/1', evento: {}, apiUrl: '', navegador, ubicacion });
    expect(navegador.sendBeacon).not.toHaveBeenCalled();
    expect(ubicacion.replace).toHaveBeenCalled();
  });

  test('si sendBeacon falla, redirige igual', () => {
    const navegador = {
      sendBeacon: () => {
        throw new Error('bloqueado');
      },
    };
    const ubicacion = { replace: vi.fn() };
    redirigir({ destino: 'https://wa.me/1', evento: {}, apiUrl: 'https://api.test/exec', navegador, ubicacion });
    expect(ubicacion.replace).toHaveBeenCalled();
  });
});
