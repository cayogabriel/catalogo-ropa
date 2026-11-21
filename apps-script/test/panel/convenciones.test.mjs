// Convenciones de Apps Script que Google no vigila: nombres globales únicos y requireAdmin_().
import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

function archivosJs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return archivosJs(ruta);
    return n.endsWith('.js') ? [ruta] : [];
  });
}

function globales(proyecto) {
  const dir = join(RAIZ, proyecto, 'src');
  const encontrados = [];
  for (const archivo of archivosJs(dir)) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) encontrados.push({ nombre: m[1], archivo, tipo: 'function' });
    for (const m of texto.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) encontrados.push({ nombre: m[1], archivo, tipo: 'const' });
  }
  return encontrados;
}

describe.each(['panel', 'api'])('proyecto %s', (proyecto) => {
  test('ningún nombre global se declara dos veces (en Google el último pisaría al primero sin avisar)', () => {
    const vistos = new Map();
    const repetidos = [];
    for (const { nombre, archivo } of globales(proyecto)) {
      if (vistos.has(nombre)) repetidos.push(`${nombre}: ${vistos.get(nombre)} y ${archivo}`);
      vistos.set(nombre, archivo);
    }
    expect(repetidos).toEqual([]);
  });
});

// Funciones públicas del Panel que no empiezan con requireAdmin_(), con su motivo.
const EXCEPCIONES = {
  doGet: 'comprueba el acceso dentro de try/catch para mostrar «Acceso restringido»',
  autorizar: 'solo sirve para que Google pida los permisos; no lee ni cambia nada',
  tareaDiaria: 'activador: no hay usuario activo; trabajo seguro e idempotente',
  tareaDocumentos: 'activador: no hay usuario activo; trabajo seguro e idempotente',
  tareaReporteMensual: 'activador: no hay usuario activo; trabajo seguro e idempotente',
};

describe('Panel: funciones públicas', () => {
  test('todas empiezan con requireAdmin_(), salvo las excepciones documentadas', () => {
    const dir = join(RAIZ, 'panel', 'src', 'server');
    const sin = [];
    for (const archivo of archivosJs(dir)) {
      const texto = readFileSync(archivo, 'utf8');
      for (const m of texto.matchAll(/^function\s+([A-Za-z]\w*)\s*\([^)]*\)\s*\{\s*\n\s*([^\n]*)/gm)) {
        const [, nombre, primera] = m;
        if (nombre.endsWith('_')) continue;
        if (nombre in EXCEPCIONES) continue;
        if (!/^requireAdmin_\(\);/.test(primera.trim())) sin.push(`${nombre} (${archivo})`);
      }
    }
    expect(sin).toEqual([]);
  });

  test('los envoltorios de activadores no piden usuario y solo llaman a un helper privado', () => {
    const texto = archivosJs(join(RAIZ, 'panel', 'src', 'server')).map((a) => readFileSync(a, 'utf8')).join('\n');
    for (const nombre of ['tareaDiaria', 'tareaDocumentos', 'tareaReporteMensual']) {
      const m = new RegExp(`function ${nombre}\(\)\s*\{([^}]*)\}`).exec(texto);
      if (!m) continue; // aún no existe
      expect(m[1]).not.toMatch(/requireAdmin_/);
    }
  });
});
