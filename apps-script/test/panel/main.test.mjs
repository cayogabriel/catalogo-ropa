import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cargarGas } from '../gas/cargar.mjs';
import { crearDobles } from '../gas/dobles/index.mjs';

const conUsuario = (usuario) => cargarGas('panel', { dobles: crearDobles({ usuario, dueno: 'duena@example.com' }) }).ctx;

describe('doGet()', () => {
  test('a la dueña le muestra el panel', () => {
    const salida = conUsuario('duena@example.com').doGet({ parameter: {} });
    expect(salida.getContent()).toContain('id="panel"');
    expect(salida.getTitle()).toBe('Panel · Catálogo');
  });

  test('el panel provisional ofrece instalar y publicar la prueba sin abrir el editor', () => {
    const html = conUsuario('duena@example.com').doGet({ parameter: {} }).getContent();
    expect(html).toContain("correr('instalar'");
    expect(html).toContain("correr('publicarPrueba'");
  });

  test('a cualquier otra persona le muestra «Acceso restringido» y nada del panel', () => {
    const salida = conUsuario('').doGet({ parameter: {} });
    expect(salida.getContent()).toContain('Acceso restringido');
    expect(salida.getContent()).not.toContain('id="panel"');
  });
});

describe('manifiesto del Panel', () => {
  const manifiesto = JSON.parse(readFileSync(new URL('../../panel/src/appsscript.json', import.meta.url), 'utf8'));

  test('se ejecuta como la dueña y solo ella puede abrirlo', () => {
    expect(manifiesto.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'MYSELF' });
    expect(manifiesto.timeZone).toBe('America/Lima');
    expect(manifiesto.runtimeVersion).toBe('V8');
  });

  test('pide de una vez todos los permisos de la v1', () => {
    expect(manifiesto.oauthScopes.sort()).toEqual([
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });
});
