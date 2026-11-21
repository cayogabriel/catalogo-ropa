import { describe, expect, it } from 'vitest';
import { crearEventos, idSesion, limpiarRuta } from '../../src/lib/eventos.mjs';

const RUTA = /^\/[A-Za-z0-9/_.?=&%-]{0,199}$/;

describe('limpiarRuta', () => {
  it('quita la base del sitio', () => {
    expect(limpiarRuta('/catalogo-ropa/p/ves-014/', '/catalogo-ropa/')).toBe('/p/ves-014/');
    expect(limpiarRuta('/catalogo-ropa/', '/catalogo-ropa/')).toBe('/');
    expect(limpiarRuta('/p/ves-014/', '/')).toBe('/p/ves-014/');
  });
  it('siempre cumple el patrón del contrato', () => {
    for (const r of ['/catalogo-ropa/temporada/otoño ñ/', '=HYPERLINK()', '', '/' + 'a'.repeat(400), '/a"b<c>']) {
      expect(limpiarRuta(r, '/catalogo-ropa/')).toMatch(RUTA);
    }
  });
});

describe('idSesion', () => {
  it('16 caracteres [a-z0-9], el mismo en la pestaña', () => {
    const datos = {};
    const almacen = { getItem: (k) => datos[k] ?? null, setItem: (k, v) => (datos[k] = v) };
    const id = idSesion(almacen);
    expect(id).toMatch(/^[a-z0-9]{16}$/);
    expect(idSesion(almacen)).toBe(id);
  });
  it('sin sessionStorage igual da un id válido', () => {
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(idSesion(roto)).toMatch(/^[a-z0-9]{16}$/);
    expect(idSesion(null)).toMatch(/^[a-z0-9]{16}$/);
  });
  it('rechaza un id guardado que no cumple el formato', () => {
    const almacen = { getItem: () => 'MAL ID', setItem() {} };
    expect(idSesion(almacen)).toMatch(/^[a-z0-9]{16}$/);
  });
});

describe('crearEventos', () => {
  const enviados = [];
  const beacon = (url, cuerpo) => {
    enviados.push([url, cuerpo]);
    return true;
  };

  it('envía el formato del contrato con sendBeacon', () => {
    const enviar = crearEventos({ url: 'https://api.example/exec', beacon, sesion: 'a1b2c3d4', ruta: '/p/ves-014/' });
    expect(enviar({ t: 'whatsapp', p: 'prd_1a2b3c4d' })).toBe(true);
    const [url, cuerpo] = enviados.at(-1);
    expect(url).toBe('https://api.example/exec');
    expect(JSON.parse(cuerpo)).toEqual({ t: 'whatsapp', p: 'prd_1a2b3c4d', s: null, o: 'web', pg: '/p/ves-014/', ss: 'a1b2c3d4' });
  });

  it('sin URL no envía nada', () => {
    const antes = enviados.length;
    for (const url of [undefined, '', null]) {
      expect(crearEventos({ url, beacon, sesion: 'a1b2c3d4', ruta: '/' })({ t: 'vista' })).toBe(false);
    }
    expect(enviados.length).toBe(antes);
  });

  it('rechaza tipos u orígenes fuera del contrato', () => {
    const enviar = crearEventos({ url: 'https://api.example/exec', beacon, sesion: 'a1b2c3d4', ruta: '/' });
    expect(enviar({ t: 'clic' })).toBe(false);
    expect(enviar({ t: 'vista', o: 'correo' })).toBe(false);
    expect(enviar({ t: 'revista_descarga', s: 'tem_00000001', o: 'revista_web' })).toBe(true);
  });

  it('si sendBeacon falla o no existe, no rompe', () => {
    const enviar = crearEventos({ url: 'https://api.example/exec', beacon: () => { throw new Error('x'); }, sesion: 'a1b2c3d4', ruta: '/' });
    expect(enviar({ t: 'vista' })).toBe(false);
    expect(crearEventos({ url: 'https://api.example/exec', beacon: null, sesion: 'a1b2c3d4', ruta: '/' })({ t: 'vista' })).toBe(false);
  });
});
