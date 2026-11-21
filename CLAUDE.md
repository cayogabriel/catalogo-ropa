# Catálogo de ropa

Catálogo web para vender ropa por WhatsApp. La tienda está en Perú (Ayacucho), vende ropa para mujer y niñas, solo con envíos, y todavía no tiene nombre.

- **Web pública:** sitio estático (Astro) en GitHub Pages, en `https://cayogabriel.github.io/catalogo-ropa/`.
- **Panel de la administradora:** Apps Script (proyecto 1). Solo entra la cuenta Google de la dueña.
- **API pública de solo lectura:** Apps Script (proyecto 2).
- **Datos:** Google Sheets y Drive de la dueña.

Documentos de referencia:

| Qué | Dónde |
|---|---|
| Diseño aprobado (fuente de verdad) | `docs/superpowers/specs/2026-11-20-catalogo-ropa-design.md` |
| Contratos entre sesiones | `docs/contracts/` (empieza por su `README.md`) |
| Validadores ejecutables | paquete `@catalogo/contratos` (`contratos/`) |
| Marca, voz, paletas, textos y campañas | `content/` (de S5) |

## Quién es dueña de qué

El trabajo está repartido en sesiones. **Cada sesión toca solo sus carpetas.** Para cambiar un contrato o un archivo de otra sesión, pídeselo a la sesión coordinadora (la que te abrió). No lo cambies tú.

| Sesión | Carpetas propias |
|---|---|
| Coordinadora (S1/S7) | raíz (`package.json`, `CLAUDE.md`, `README.md`), `docs/`, `contratos/`, `fixtures/`, `scripts/`, `.github/workflows/ci.yml`, `web/src/compartido/`, `web/test/compartido/`, `web/sitio.config.mjs` |
| S2 · Backend Apps Script | `apps-script/panel/src/server/`, `apps-script/api/`, `apps-script/test/` (incluye los dobles) |
| S3 · Web pública | `web/src/` (salvo lo de S6), `web/public/` (salvo `img/`, que se genera), `web/astro.config.mjs`, `web/test/sitio/` |
| S4 · Interfaz del panel | `apps-script/panel/src/ui/`, `apps-script/panel/dev/` |
| S5 · Marketing y contenido | `content/` |
| S6 · Revista, PDFs y publicación | `web/scripts/`, `web/src/pages/imprimir/`, `web/src/pages/ir/`, `web/src/components/imprimir/`, `web/test/publicacion/`, `.github/workflows/publicar.yml` |

**Lógica compartida de la web:** S3 (web) y S6 (revista/PDF) usan `web/src/compartido/` y no la duplican. Ahí están el precio vigente, los formatos de monto y fecha, los mensajes de WhatsApp y los enlaces a redes y rutas.

Si necesitas una dependencia npm nueva, agrégala en el `package.json` de tu workspace con versión exacta (`--save-exact`) y menciónala en tu informe. Los choques de `package-lock.json` los resuelve la coordinadora al integrar.

## Comandos

```bash
npm test                          # todas las pruebas (Vitest)
npm run fixtures                  # regenera fixtures/ (imágenes + catálogo con fechas de hoy)
npm run dev -w web                # web local (antes: npm run build:fixture -w web, para generar los datos)
npm run build:fixture -w web      # datos de ejemplo + astro build
npm run verificar:build -w web    # revisa las páginas y las vistas previas (og:image)
```

**Solo la sesión coordinadora** sube código a Apps Script y despliega, porque dos ramas subiendo al mismo proyecto se pisarían:

```bash
npm run push:panel
npm run push:api
npm run desplegar:panel
npm run desplegar:api
```

## Convenciones de Apps Script (`apps-script/`)

- **El código:**
  - Es V8 con un solo ámbito global: sin `import`/`export`, igual que en Google.
  - Los helpers privados terminan en `_`: no se pueden llamar desde `google.script.run`.
  - Toda función pública del Panel empieza con `requireAdmin_()`.
  - El proyecto `api` nunca tiene funciones que modifiquen datos, salvo agregar eventos. Un test lo vigila.
- **Las pruebas:**
  - Se escriben en Node con `cargarGas('panel' | 'api', { dobles })` (`apps-script/test/gas/cargar.mjs`). Ese cargador ejecuta los `.js` en un contexto `vm` compartido.
  - Los servicios de Google son dobles en memoria (`apps-script/test/gas/dobles/`). Si te falta un método, amplía el doble con su propio test.
- **Ids y secretos:**
  - Nada de ids de Drive o Sheets en el código: la API encuentra el puntero `catalogo-ropa.config.json` por nombre.
  - Los secretos van en las propiedades del script.
  - `.clasp.json` y `.env.local` están en `.gitignore`.
- **clasp:** `clasp create` o `clone` pisan `appsscript.json` con el de Google. Haz una copia antes y restáurala.

## Reglas del proyecto

- **El repositorio es público.** Nunca subas ids de Drive o Sheets, URLs `/exec` del Panel, tokens, correos ni teléfonos reales. Los commits usan el correo *noreply* de GitHub.
- **Marketing honesto** (ver `content/marca.md`). No se inventan reseñas, cifras, urgencia ni escasez:
  - cuenta regresiva solo con fecha de fin real;
  - «Últimas unidades» solo con stock real;
  - «Más consultados» solo con clics reales.
- **Accesibilidad WCAG 2.1 AA:**
  - contraste según `PARES_CONTRASTE`;
  - teclado y foco visible;
  - `alt` en cada foto;
  - `prefers-reduced-motion`;
  - áreas táctiles de al menos 44 px.
- **Textos:** en español de Perú, tuteando, con la voz de `content/marca.md`.
- **Flujo de trabajo (superpowers):** writing-plans → test-driven-development → verification-before-completion → requesting-code-review.
  - Al terminar, deja tu rama con los commits hechos. No hagas merge ni push.
  - Termina con un resumen corto.
- **Commits:** terminan con `Co-Authored-By: Claude <modelo> <noreply@anthropic.com>`.
