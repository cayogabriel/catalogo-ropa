import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { revisarPaleta, TOKENS } from '@catalogo/contratos';
import { generarArchivos } from '../../scripts/generar-semillas.mjs';
import { panelInstalado, filasCrudas } from './ayudas.mjs';

const paletas = JSON.parse(readFileSync(new URL('../../../content/paletas.json', import.meta.url), 'utf8')).paletas;

describe('guardarTexto()', () => {
  test('crea la clave si no existe y la actualiza si existe, con versión e historial', () => {
    const { ctx, libro } = panelInstalado();
    expect(ctx.guardarTexto('inicio.portada.titulo', 'Nueva temporada')).toEqual({ clave: 'inicio.portada.titulo', valor: 'Nueva temporada' });
    expect(ctx.guardarTexto('inicio.portada.titulo', 'Verano')).toEqual({ clave: 'inicio.portada.titulo', valor: 'Verano' });
    const fila = filasCrudas(libro, 'textos').find((f) => f.clave === 'inicio.portada.titulo');
    expect(fila).toMatchObject({ valor: 'Verano', version: 2 });
    const h = ctx.historial({ entidad: 'textos' });
    expect(h.map((x) => [x.accion, x.antes, x.despues])).toEqual([['editar', '"Nueva temporada"', '"Verano"'], ['crear', '', '"Nueva temporada"']]);
  });

  test('guardar el mismo valor no sube la versión', () => {
    const { ctx, libro } = panelInstalado();
    ctx.guardarTexto('pie.horario', 'Lunes a sábado');
    ctx.guardarTexto('pie.horario', 'Lunes a sábado');
    expect(filasCrudas(libro, 'textos').find((f) => f.clave === 'pie.horario').version).toBe(1);
  });

  test('rechaza claves mal formadas, las que empiezan con _ y valores enormes', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.guardarTexto('Sin Formato', 'x')).toThrow(/invalido: la clave/);
    expect(() => ctx.guardarTexto('_nota', 'x')).toThrow(/invalido: la clave/);
    expect(() => ctx.guardarTexto('una', 'x')).toThrow(/invalido: la clave/);
    expect(() => ctx.guardarTexto('pie.envios', 'x'.repeat(2001))).toThrow(/^limite:/);
  });

  test('un texto que empieza con = se guarda como texto', () => {
    const { ctx, libro } = panelInstalado();
    ctx.guardarTexto('pie.envios', '=1+1');
    expect(filasCrudas(libro, 'textos').find((f) => f.clave === 'pie.envios').valor).toBe('=1+1');
  });

  test('se puede deshacer', () => {
    const { ctx } = panelInstalado();
    ctx.guardarTexto('pie.envios', 'A');
    ctx.guardarTexto('pie.envios', 'B');
    ctx.deshacer(ctx.historial({ entidad: 'textos' })[0].id);
    expect(ctx.leerTabla_('textos').filas.find((f) => f.clave === 'pie.envios').valor).toBe('A');
  });
});

describe('guardarConfig()', () => {
  test('guarda texto y números y los devuelve normalizados', () => {
    const { ctx } = panelInstalado();
    expect(ctx.guardarConfig('tienda_nombre', '  Mi Tienda ')).toEqual({ clave: 'tienda_nombre', valor: 'Mi Tienda' });
    expect(ctx.guardarConfig('dias_nuevo', '45')).toEqual({ clave: 'dias_nuevo', valor: 45 });
    expect(ctx.leerConfig_()).toMatchObject({ tienda_nombre: 'Mi Tienda', dias_nuevo: 45 });
  });

  test('rechaza una clave que no es de la configuración', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.guardarConfig('cualquier_cosa', 'x')).toThrow(/invalido: no existe la configuración/);
  });

  test('valida cada clave', () => {
    const { ctx } = panelInstalado();
    expect(() => ctx.guardarConfig('redondeo', 'raro')).toThrow(/redondeo: debe ser ninguno, entero, 90/);
    expect(() => ctx.guardarConfig('inicio_modo', 'x')).toThrow(/inicio_modo/);
    expect(() => ctx.guardarConfig('moneda_codigo', 'sol')).toThrow(/moneda_codigo/);
    expect(() => ctx.guardarConfig('pais_codigo', '+51')).toThrow(/pais_codigo/);
    expect(() => ctx.guardarConfig('tienda_nombre', 'x'.repeat(81))).toThrow(/máximo 80/);
    expect(() => ctx.guardarConfig('umbral_ultimas_unidades', -1)).toThrow(/umbral_ultimas_unidades/);
    expect(() => ctx.guardarConfig('vigencia_dias_defecto', 0)).toThrow(/vigencia_dias_defecto/);
    expect(() => ctx.guardarConfig('dias_nuevo', 'muchos')).toThrow(/dias_nuevo/);
    expect(() => ctx.guardarConfig('github_repo', '../../otra/cosa')).toThrow(/github_repo/);
    expect(() => ctx.guardarConfig('sitio_url', 'http://inseguro.com/')).toThrow(/sitio_url/);
    expect(() => ctx.guardarConfig('logo', 'corto')).toThrow(/logo/);
    expect(() => ctx.guardarConfig('paleta_defecto', 'no-existe')).toThrow(/paleta_defecto/);
  });

  test('la URL del sitio termina siempre en /', () => {
    const { ctx } = panelInstalado();
    expect(ctx.guardarConfig('sitio_url', 'https://mitienda.example.com').valor).toBe('https://mitienda.example.com/');
  });

  test('las redes aceptan @usuario o un enlace y guardan solo el usuario', () => {
    const { ctx } = panelInstalado();
    expect(ctx.guardarConfig('instagram', '@mi.tienda').valor).toBe('mi.tienda');
    expect(ctx.guardarConfig('instagram', 'https://www.instagram.com/mi.tienda/?hl=es').valor).toBe('mi.tienda');
    expect(ctx.guardarConfig('tiktok', '').valor).toBe('');
    expect(() => ctx.guardarConfig('facebook', 'mi tienda con espacios')).toThrow(/facebook/);
  });

  test('registra el cambio y se puede deshacer', () => {
    const { ctx } = panelInstalado();
    ctx.guardarConfig('redondeo', 'entero');
    const h = ctx.historial({ entidad: 'config' })[0];
    expect(h).toMatchObject({ entidad_id: 'redondeo', campo: 'valor', antes: '"ninguno"', despues: '"entero"', accion: 'editar' });
    ctx.deshacer(h.id);
    expect(ctx.leerConfig_().redondeo).toBe('ninguno');
  });

  test('marca que hay cambios sin publicar', () => {
    const { ctx } = panelInstalado();
    ctx.guardarConfig('horario', 'Lunes a sábado');
    expect(ctx.hayCambiosSinPublicar_()).toBe(true);
  });
});

describe('validarPaleta()', () => {
  const { ctx, valor } = panelInstalado();

  test('da lo mismo que revisarPaleta del paquete de contratos en las 12 paletas', () => {
    for (const p of paletas) expect(ctx.validarPaleta(p.tokens), p.id).toEqual(revisarPaleta(p.tokens));
  });

  test('avisa de los colores que no pasan el contraste y de los tokens que faltan', () => {
    const mala = { ...paletas[0].tokens, '--color-texto': '#EEEEEE' };
    const r = ctx.validarPaleta(mala);
    expect(r.ok).toBe(false);
    expect(r).toEqual(revisarPaleta(mala));
    expect(r.fallos.length).toBeGreaterThan(0);
    const incompleta = { '--color-fondo': '#FFFFFF' };
    expect(ctx.validarPaleta(incompleta)).toEqual(revisarPaleta(incompleta));
    expect(ctx.validarPaleta({}).faltantes).toHaveLength(16);
  });

  test('un color que no es #RRGGBB es invalido', () => {
    expect(() => ctx.validarPaleta({ ...paletas[0].tokens, '--color-fondo': 'blanco' })).toThrow(/invalido: .*--color-fondo/);
    expect(() => ctx.validarPaleta(null)).toThrow(/invalido/);
  });

  test('los 16 tokens del Panel son los del contrato', () => {
    expect(valor('TOKENS_PALETA')).toEqual(TOKENS);
    expect(valor('TOKENS_CONTRATO')).toEqual(TOKENS);
  });
});

describe('archivos generados', () => {
  test('semillas.js y contraste.js están al día con content/ y con el paquete de contratos', () => {
    for (const [nombre, contenido] of Object.entries(generarArchivos())) {
      const enDisco = readFileSync(new URL(`../../panel/src/server/${nombre}`, import.meta.url), 'utf8');
      expect(enDisco, `${nombre} está desactualizado: corre «npm run semillas -w apps-script»`).toBe(contenido);
    }
  });

  test('las semillas traen las 12 paletas, los textos y las 3 plantillas de WhatsApp', () => {
    const S = panelInstalado().valor('SEMILLAS');
    expect(S.paletas).toHaveLength(12);
    expect(S.paletas[0]).toMatchObject({ origen: 'predefinida', uso: '12,1,2,3' });
    const claves = S.textos.map((t) => t.clave);
    expect(claves).toEqual(expect.arrayContaining(['whatsapp.producto', 'whatsapp.lista', 'whatsapp.revista', 'tienda.eslogan']));
    expect(claves.some((c) => c.startsWith('_'))).toBe(false);
  });
});
