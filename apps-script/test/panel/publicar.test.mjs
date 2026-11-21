import { describe, test, expect } from 'vitest';
import { validarCatalogo } from '@catalogo/contratos';
import { cargarGas } from '../gas/cargar.mjs';
import { tiendaDeEjemplo, programarGithub, TOKEN_DE_PRUEBA } from './escenario.mjs';

const REPO = 'cayogabriel/catalogo-ropa';

function tiendaConToken(opciones) {
  const t = tiendaDeEjemplo(opciones);
  programarGithub(t.dobles, { runs: [] });
  t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
  t.dobles._url.llamadas.length = 0;
  return t;
}

const puntero = (t) => JSON.parse(t.dobles.DriveApp.getFilesByName('catalogo-ropa.config.json').next().getBlob().getDataAsString());
const publicado = (t) => {
  const id = puntero(t).publicado_id;
  return id ? JSON.parse(t.dobles.DriveApp.getFileById(id).getBlob().getDataAsString()) : null;
};
const envios = (t) => t.dobles._url.llamadas.filter((l) => /dispatches$/.test(l.url));

describe('guardarTokenGithub() / estadoTokenGithub()', () => {
  test('valida el token contra el repositorio y lo guarda sin devolverlo', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles);
    expect(t.ctx.estadoTokenGithub()).toEqual({ configurado: false, repo: REPO });
    const r = t.ctx.guardarTokenGithub(`  ${TOKEN_DE_PRUEBA} `);
    expect(r).toEqual({ ok: true, repo: REPO });
    expect(JSON.stringify(r)).not.toContain(TOKEN_DE_PRUEBA);
    expect(t.ctx.estadoTokenGithub()).toEqual({ configurado: true, repo: REPO });
    expect(t.dobles._propiedades.get('CR_GITHUB_TOKEN')).toBe(TOKEN_DE_PRUEBA);
    const llamada = t.dobles._url.llamadas[0];
    expect(llamada.url).toBe(`https://api.github.com/repos/${REPO}`);
    expect(llamada.opciones.headers).toEqual({ Authorization: `Bearer ${TOKEN_DE_PRUEBA}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  });

  test('el token nunca queda en la hoja ni en el historial', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles);
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    for (const libro of t.dobles._hojas.values()) {
      for (const h of libro.getSheets()) {
        if (h.getLastRow() === 0) continue;
        expect(JSON.stringify(h.getDataRange().getValues())).not.toContain(TOKEN_DE_PRUEBA);
      }
    }
  });

  test('rechaza un formato imposible sin llamar a GitHub', () => {
    const t = tiendaDeEjemplo();
    for (const malo of ['', 'corto', 'con espacios adentro de un token largo largo', null, 123]) {
      expect(() => t.ctx.guardarTokenGithub(malo)).toThrow(/^invalido:/);
    }
    expect(t.dobles._url.llamadas).toEqual([]);
  });

  test('cada fallo de GitHub tiene su mensaje y no guarda el token (ni lo repite)', () => {
    for (const [codigo, texto] of [[401, /no aceptó el token/], [403, /no tiene permiso/], [404, /no se encontró cayogabriel\/catalogo-ropa/], [500, /código 500/]]) {
      const t = tiendaDeEjemplo();
      programarGithub(t.dobles, { repo: codigo });
      let error;
      try {
        t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
      } catch (e) {
        error = e;
      }
      expect(error.message).toMatch(/^github:/);
      expect(error.message).toMatch(texto);
      expect(error.message).not.toContain(TOKEN_DE_PRUEBA);
      expect(t.ctx.estadoTokenGithub().configurado).toBe(false);
    }
  });

  test('un token que solo puede leer se rechaza: no podría avisar para publicar', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { repoPush: false });
    expect(() => t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA)).toThrow(/Contents: write/);
  });

  test('si no hay conexión lanza github sin detalles internos', () => {
    const t = tiendaDeEjemplo(); // sin respuestas programadas: el doble lanza al hacer fetch
    expect(() => t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA)).toThrow(/^github: no se pudo conectar con GitHub/);
  });

  test('un repositorio con formato raro en la configuración no llega a la URL', () => {
    const t = tiendaDeEjemplo();
    const tabla = t.ctx.leerTabla_('config');
    const fila = tabla.filas.find((f) => f.clave === 'github_repo');
    fila.valor = '../../orgs/x';
    t.ctx.escribirFila_('config', tabla, fila);
    expect(() => t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA)).toThrow(/github_repo no es válido/);
    expect(t.dobles._url.llamadas).toEqual([]);
  });
});

describe('publicar()', () => {
  test('sin token lanza sin_token y no guarda nada', () => {
    const t = tiendaDeEjemplo();
    expect(() => t.ctx.publicar()).toThrow(/^sin_token:/);
    expect(puntero(t).publicado_id).toBe(null);
  });

  test('sin nombre de tienda lanza invalido antes de enviar nada', () => {
    const t = tiendaConToken();
    t.ctx.guardarConfig('tienda_nombre', '');
    expect(() => t.ctx.publicar()).toThrow(/^invalido: la tienda todavía no tiene nombre/);
    expect(t.dobles._url.llamadas).toEqual([]);
    expect(puntero(t).publicado_id).toBe(null);
  });

  test('si una foto ya no está en Drive, lanza invalido y no guarda ni avisa', () => {
    const t = tiendaConToken();
    t.dobles.DriveApp.getFileById(t.fotos[0]).setTrashed(true);
    expect(() => t.ctx.publicar()).toThrow(`invalido: la foto ${t.fotos[0]} de VES-001 ya no está en Drive`);
    expect(envios(t)).toHaveLength(0);
    expect(puntero(t).publicado_id).toBe(null);
  });

  test('guarda la copia validada, actualiza el puntero y avisa a GitHub', () => {
    const t = tiendaConToken();
    const estado = t.ctx.publicar();
    expect(estado).toMatchObject({ estado: 'en_cola', terminado_en: null, url_ejecucion: null, documentos_guardados: false });
    expect(estado.iniciado_en).toMatch(/^2026-12-01T.*-05:00$/);

    const copia = publicado(t);
    expect(copia).not.toBe(null);
    expect(validarCatalogo(copia)).toEqual({ ok: true, errores: [] });
    const archivo = t.dobles.DriveApp.getFileById(puntero(t).publicado_id);
    expect(archivo.getName()).toBe('catalogo-publicado.json');
    expect(archivo.getParents().next().getId()).toBe(puntero(t).carpetas.publicado);

    expect(envios(t)).toHaveLength(1);
    const e = envios(t)[0];
    expect(e.url).toBe(`https://api.github.com/repos/${REPO}/dispatches`);
    expect(e.opciones.method).toBe('post');
    expect(e.opciones.payload).toBe('{"event_type":"publicar"}');
    expect(e.opciones.headers).toEqual({ Authorization: `Bearer ${TOKEN_DE_PRUEBA}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  });

  test('la API pública sirve esa copia y sus fotos', () => {
    const t = tiendaConToken();
    t.ctx.publicar();
    const api = cargarGas('api', { dobles: t.dobles }).ctx;
    const llamar = (parametros) => JSON.parse(api.doGet({ parameter: parametros }).getContent());
    expect(llamar({ r: 'catalogo' })).toEqual({ ok: true, datos: publicado(t) });
    const foto = llamar({ r: 'foto', id: t.fotos[0] });
    expect(foto).toMatchObject({ ok: true, datos: { mime: 'image/jpeg' } });
    expect(llamar({ r: 'foto', id: t.fotos[4] })).toEqual({ ok: false, error: 'foto_no_publicada' }); // la del borrador
  });

  test('fija publicado_en la primera vez, sin subir la versión ni dejar historial', () => {
    const t = tiendaConToken();
    const antes = t.ctx.listar('productos').filas.find((p) => p.id === t.ids.v1.id);
    const historialAntes = t.ctx.historial({ limite: 500 }).length;
    t.ctx.publicar();
    const despues = t.ctx.listar('productos', { incluir_archivados: true }).filas;
    const v1 = despues.find((p) => p.id === t.ids.v1.id);
    expect(antes.publicado_en).toBe(null);
    expect(v1.publicado_en).toMatch(/^2026-12-01T.*-05:00$/);
    expect(v1.version).toBe(antes.version);
    expect(despues.find((p) => p.id === t.ids.borrador.id).publicado_en).toBe(null);
    expect(t.ctx.historial({ limite: 500 }).length).toBe(historialAntes);
    // y el código ya no se puede cambiar
    expect(() => t.ctx.guardarCampo('productos', v1.id, 'codigo', 'VES-999', v1.version)).toThrow(/no cambia después de publicar/);
  });

  test('publicar otra vez reutiliza el mismo archivo y no cambia «actualizado» de las fotos', () => {
    const t = tiendaConToken();
    t.ctx.publicar();
    const id1 = puntero(t).publicado_id;
    const fotos1 = publicado(t).fotos;
    t.dobles._reloj.saltar(7_200_000);
    t.ctx.publicar();
    expect(puntero(t).publicado_id).toBe(id1);
    expect(publicado(t).fotos).toEqual(fotos1);
    expect(envios(t)).toHaveLength(2);
    let n = 0;
    const it = t.dobles.DriveApp.getFilesByName('catalogo-publicado.json');
    while (it.hasNext()) (it.next(), n++);
    expect(n).toBe(1);
  });

  test('si la copia publicada fue a la papelera, crea una nueva', () => {
    const t = tiendaConToken();
    t.ctx.publicar();
    t.dobles.DriveApp.getFileById(puntero(t).publicado_id).setTrashed(true);
    t.ctx.publicar();
    expect(t.dobles.DriveApp.getFileById(puntero(t).publicado_id).isTrashed()).toBe(false);
  });

  test('«cambios sin publicar» se apaga al publicar y vuelve a prenderse al editar', () => {
    const t = tiendaConToken();
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(true);
    t.dobles._reloj.saltar(1000);
    t.ctx.publicar();
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(false);
    t.dobles._reloj.saltar(1000);
    t.ctx.guardarConfig('horario', 'Lunes a sábado');
    expect(t.ctx.hayCambiosSinPublicar_()).toBe(true);
  });

  test('si GitHub rechaza el aviso lanza github; la copia ya quedó guardada para la próxima', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { dispatch: 401, runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    let error;
    try {
      t.ctx.publicar();
    } catch (e) {
      error = e;
    }
    expect(error.message).toMatch(/^github: GitHub no aceptó el token/);
    expect(error.message).not.toContain(TOKEN_DE_PRUEBA);
    expect(publicado(t)).not.toBe(null);
    expect(t.dobles._propiedades.get('CR_PUBLICADO_EN')).toBeUndefined();
  });

  test('solo la dueña puede publicar', () => {
    const t = tiendaConToken();
    const otra = cargarGas('panel', { dobles: Object.assign(Object.create(null), t.dobles, { Session: { getActiveUser: () => ({ getEmail: () => 'intrusa@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'duena@example.com' }), getScriptTimeZone: () => 'America/Lima' } }) }).ctx;
    expect(() => otra.publicar()).toThrow(/^no_autorizado:/);
  });

  test('con candado ocupado no publica nada', () => {
    const t = tiendaConToken();
    t.dobles._candado.fallar = true;
    expect(() => t.ctx.publicar()).toThrow(/^conflicto:/);
    expect(envios(t)).toHaveLength(0);
  });
});

describe('estadoPublicacion()', () => {
  const corrida = (extra) => ({
    id: 987, status: 'completed', conclusion: 'success', created_at: '2026-12-01T17:00:30Z', run_started_at: '2026-12-01T17:00:35Z',
    updated_at: '2026-12-01T17:03:10Z', html_url: 'https://github.com/cayogabriel/catalogo-ropa/actions/runs/987', ...extra,
  });
  function conCorridas(runs, antes) {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    antes?.(t);
    return t;
  }

  test('nunca publicado: sin ejecuciones ni aviso', () => {
    const t = conCorridas([]);
    expect(t.ctx.estadoPublicacion()).toEqual({ estado: 'nunca', iniciado_en: null, terminado_en: null, url_ejecucion: null, mensaje: '', documentos_guardados: false });
  });

  test('consulta la última ejecución de repository_dispatch', () => {
    const t = conCorridas([corrida()]);
    t.ctx.estadoPublicacion();
    const l = t.dobles._url.llamadas.find((x) => /actions\/runs/.test(x.url));
    expect(l.url).toBe(`https://api.github.com/repos/${REPO}/actions/runs?event=repository_dispatch&per_page=1`);
    expect(l.opciones.headers.Authorization).toBe(`Bearer ${TOKEN_DE_PRUEBA}`);
  });

  test.each([
    ['queued', null, 'en_cola'],
    ['waiting', null, 'en_cola'],
    ['in_progress', null, 'publicando'],
  ])('una ejecución %s es «%s»', (status, conclusion, esperado) => {
    const t = conCorridas([corrida({ status, conclusion })]);
    const e = t.ctx.estadoPublicacion();
    expect(e.estado).toBe(esperado === 'en_cola' ? 'en_cola' : 'publicando');
    expect(e).toMatchObject({ terminado_en: null, url_ejecucion: 'https://github.com/cayogabriel/catalogo-ropa/actions/runs/987' });
    expect(e.iniciado_en).toBe('2026-12-01T12:00:35-05:00');
  });

  test('terminada con éxito es «publicado»; con otro resultado, «error»', () => {
    const ok = conCorridas([corrida()]).ctx.estadoPublicacion();
    expect(ok).toMatchObject({ estado: 'publicado', terminado_en: '2026-12-01T12:03:10-05:00' });
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
      const e = conCorridas([corrida({ conclusion })]).ctx.estadoPublicacion();
      expect(e.estado).toBe('error');
      expect(e.mensaje).toContain(conclusion);
    }
  });

  test('un enlace de ejecución que no es de github.com no se devuelve', () => {
    const e = conCorridas([corrida({ html_url: 'https://malo.example.com/x' })]).ctx.estadoPublicacion();
    expect(e.url_ejecucion).toBe(null);
  });

  test('recién enviado el aviso, mientras la ejecución nueva no aparece, está «en cola» (no muestra la anterior)', () => {
    const t = conCorridas([corrida({ created_at: '2026-11-30T10:00:00Z', updated_at: '2026-11-30T10:03:00Z' })], (t) => t.dobles._propiedades.set('CR_PUBLICADO_EN', String(t.dobles._reloj.ahora())));
    expect(t.ctx.estadoPublicacion()).toMatchObject({ estado: 'en_cola' });
    t.dobles._reloj.saltar(6 * 60 * 1000);
    expect(t.ctx.estadoPublicacion().estado).toBe('error');
  });

  test('sin token no consulta a GitHub y lo dice', () => {
    const t = tiendaDeEjemplo();
    expect(t.ctx.estadoPublicacion()).toMatchObject({ estado: 'nunca', mensaje: expect.stringContaining('token') });
    expect(t.dobles._url.llamadas).toEqual([]);
  });

  test('un fallo de GitHub al consultar lanza github', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.dobles._url.reiniciar();
    expect(() => t.ctx.estadoPublicacion()).toThrow(/^github:/);
  });
});

describe('obtenerEstadoInicial()', () => {
  test('trae usuario, configuración, textos, conteos, publicación y cambios sin publicar', () => {
    const t = tiendaDeEjemplo();
    t.ctx.guardarTexto('pie.horario', 'Lunes a sábado');
    const e = t.ctx.obtenerEstadoInicial();
    expect(e.usuario).toBe('duena@example.com');
    expect(e.config).toMatchObject({ tienda_nombre: 'Tienda Prueba', moneda_simbolo: 'S/', dias_nuevo: 30 });
    expect(e.textos['pie.horario']).toBe('Lunes a sábado');
    expect(e.conteos).toMatchObject({ productos: 4, categorias: 2, vendedoras: 2, temporadas: 1, temporada_fotos: 2, ofertas: 1 }); // sin la archivada
    expect(e.cambios_sin_publicar).toBe(true);
    expect(e.sitio_url).toBe('https://cayogabriel.github.io/catalogo-ropa/');
    expect(e.publicacion).toMatchObject({ estado: 'nunca' });
  });

  test('un fallo de GitHub no impide abrir el Panel: la publicación sale como error', () => {
    const t = tiendaDeEjemplo();
    programarGithub(t.dobles, { runs: [] });
    t.ctx.guardarTokenGithub(TOKEN_DE_PRUEBA);
    t.dobles._url.reiniciar();
    const e = t.ctx.obtenerEstadoInicial();
    expect(e.publicacion.estado).toBe('error');
    expect(e.publicacion.mensaje).not.toContain(TOKEN_DE_PRUEBA);
  });
});
