// Sube el código de un proyecto Apps Script y actualiza su despliegue web.
// Solo lo usa la sesión coordinadora. Lee los ids de .env.local (fuera del repo).
// Uso: node scripts/desplegar.mjs panel|api
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const proyecto = process.argv[2];
if (!['panel', 'api'].includes(proyecto)) {
  console.error('Uso: node scripts/desplegar.mjs panel|api');
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((linea) => linea && !linea.startsWith('#'))
    .map((linea) => [linea.slice(0, linea.indexOf('=')), linea.slice(linea.indexOf('=') + 1)]),
);
const id = env[`${proyecto.toUpperCase()}_DEPLOYMENT_ID`];
if (!id) {
  console.error(`Falta ${proyecto.toUpperCase()}_DEPLOYMENT_ID en .env.local`);
  process.exit(1);
}

const cwd = `apps-script/${proyecto}`;
execSync('clasp push -f', { cwd, stdio: 'inherit' });
execSync(`clasp update-deployment ${id} -d "${proyecto} ${new Date().toISOString().slice(0, 16)}"`, { cwd, stdio: 'inherit' });
console.log(`Despliegue de ${proyecto} actualizado.`);
