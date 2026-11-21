# S1 · Fundación y contratos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dejar el repo, los contratos, los dos proyectos Apps Script y la tubería de publicación funcionando de punta a punta con datos de ejemplo, para que S2, S3, S4 y S6 trabajen en paralelo sin pisarse.

**Architecture:** monorepo con npm workspaces (`apps-script`, `web`, `contratos`). El código GAS se prueba en Node cargando los archivos en un contexto `vm` compartido con dobles de los servicios de Google. La API pública sirve la copia publicada desde Drive; el workflow la valida con el esquema, convierte fotos con sharp y despliega Astro en Pages.

**Tech Stack:** Apps Script V8 + clasp 3.4, Node 24, Vitest, Ajv (JSON Schema 2020-12), sharp, Astro, GitHub Actions/Pages, `gh`.

**Spec:** `docs/superpowers/specs/2026-11-20-catalogo-ropa-design.md`

## Global Constraints

- Moneda `S/` (`PEN`), código de país `51`, zona horaria `America/Lima`, temporadas del hemisferio sur.
- Repo **público** `cayogabriel/catalogo-ropa`; web en `https://cayogabriel.github.io/catalogo-ropa/` (base `/catalogo-ropa`).
- Panel: `executeAs: USER_DEPLOYING`, `access: MYSELF`. API: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.
- La API solo expone `?r=catalogo`, `?r=foto&id=` (solo IDs publicados) y `doPost` (eventos, lo completa S2). Ninguna otra escritura.
- **Ni IDs de Drive/Sheets ni secretos ni el correo de la usuaria en el repo.** `.clasp.json` va en `.gitignore`; los commits usan el correo *noreply* de GitHub.
- Nombres de dominio en español (`productos`, `ofertas`, `temporadas`); helpers privados de GAS terminan en `_`.
- Fotos publicadas: WebP de 480/960/1440 px (sin agrandar) + `og` JPG de 1200 px **≤ 300 KB** + miniatura borrosa (lqip).
- Producto en `/p/<código en minúsculas>/` (`VES-014` → `/p/ves-014/`); temporada en `/temporada/<slug>/`.
- 16 tokens de paleta y pares de contraste exactamente como el spec (4.5:1 texto/`sobre-X`; 3:1 `control`, `foco`, `primario`).
- Solo la sesión coordinadora hace `clasp push`/despliegues; `content/` es de S5 y no entra en los commits de S1 hasta revisarlo. `plan.md` (borrador viejo de la usuaria) no se versiona.

## Review Focus

1. `?r=foto` con un ID que existe en Drive pero no está publicado → nunca devuelve el archivo (privacidad). Test en Task 6.
2. La usuaria ejecuta `instalar()` dos veces → no duplica hoja ni carpetas; completa lo que falte. Test en Task 5.
3. Dos archivos puntero `catalogo-ropa.config.json` (carpeta copiada) → la API usa el actualizado más recientemente. Test en Task 6.
4. La API devuelve un catálogo inválido → el workflow falla **antes** de desplegar y la web anterior sigue en línea. Test en Task 9.
5. Una foto publicada se borró de Drive → el workflow falla con un mensaje que nombra la foto y el producto. Test en Task 9.

---

## Estructura de archivos

```
package.json, package-lock.json, vitest.config.mjs, .gitignore, .gitattributes
CLAUDE.md, README.md
docs/superpowers/{specs,plans}/…            docs/contracts/{README,modelo-datos,api-panel,api-publica,documentos,datos-web,tokens-diseno}.md
contratos/        package.json · index.mjs · catalog.schema.json · tokens.mjs · validar-catalogo.mjs
fixtures/         generar-imagenes.mjs · generar-catalogo.mjs · catalogo.ejemplo.json · img/*.jpg
test/             contratos.test.mjs · fixtures.test.mjs
apps-script/      package.json
  test/gas/       cargar.mjs · dobles/{index,hojas,drive,servicios}.mjs · dobles.test.mjs · cargar.test.mjs
  test/panel/     esquema.test.mjs · instalar.test.mjs · seguridad.test.mjs · main.test.mjs · pruebas.test.mjs
  test/api/       api.test.mjs
  panel/src/      appsscript.json · server/{constantes,esquema,instalar,seguridad,main,pruebas}.js · ui/index.html
  api/src/        appsscript.json · main.js · datos.js · respuesta.js
web/              package.json · astro.config.mjs · src/pages/{index.astro,p/[codigo].astro} · scripts/publicar.mjs · scripts/lib/{obtener,fotos}.mjs · test/publicar.test.mjs
.github/workflows/ ci.yml · publicar.yml
```

---

### Task 1: Andamiaje del repo

**Files:** Create `package.json`, `vitest.config.mjs`, `.gitignore`, `.gitattributes`, `apps-script/package.json`, `contratos/package.json`, `web/package.json`, `test/humo.test.mjs`.

**Interfaces:** Produces: `npm test` corre `vitest run` sobre `test/**`, `apps-script/test/**`, `web/test/**`, `contratos/**/*.test.mjs`.

- [ ] **Step 1:** `git init -b main`; config local `user.email` = `<id>+cayogabriel@users.noreply.github.com` (id de `gh api user --jq .id`), `user.name` = `cayogabriel`.
- [ ] **Step 2:** root `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["apps-script", "contratos", "web"]`, `"engines": {"node": ">=22"}`, scripts `test`, `test:watch`, `fixtures`. devDeps: `vitest`, `ajv`, `ajv-formats`, `sharp` (versiones exactas que instale npm).
- [ ] **Step 3:** `.gitignore`: `node_modules/`, `.clasp.json`, `.clasprc.json`, `.env*`, `web/dist/`, `web/.astro/`, `web/.cache/`, `web/src/data/catalogo.json`, `web/public/img/`, `plan.md`. `.gitattributes`: `* text=auto eol=lf`, `*.jpg binary`, `*.webp binary`.
- [ ] **Step 4:** test `test/humo.test.mjs` → `expect(typeof process.version).toBe('string')`. Run `npm install && npm test` → 1 passed.
- [ ] **Step 5:** Commit `chore: andamiaje del monorepo` con `docs/superpowers/` incluido (sin `content/` ni `plan.md`).

### Task 2: Contratos (docs + esquema + tokens)

**Files:** Create `docs/contracts/*.md`, `contratos/catalog.schema.json`, `contratos/tokens.mjs`, `contratos/validar-catalogo.mjs`, `contratos/index.mjs`, `test/contratos.test.mjs`.

**Interfaces:**
- Produces `contratos/index.mjs`: `validarCatalogo(datos) → { ok: boolean, errores: string[] }`; `TOKENS: string[16]`; `PARES_CONTRASTE: {a, b, min}[]`; `contraste(hexA, hexB) → number` (WCAG 2.1).
- Produces el esquema `catalog.schema.json` (`$id: "https://cayogabriel.github.io/catalogo-ropa/catalog.schema.json"`, draft 2020-12). Claves de primer nivel requeridas: `version_esquema` (const 1), `generado_en`, `tienda`, `tema_paleta_id`, `paletas`, `textos`, `vendedoras`, `categorias`, `productos`, `secciones`, `portadas`, `temporadas`, `temporada_activa_id`, `fotos`.
  - `Foto = {id, alt}`; `fotos = { [id]: { actualizado: date-time } }` (índice = lista blanca de `?r=foto`).
  - `Producto = {id, codigo (^[A-Z]{3}-\d{3}$), nombre, descripcion, categoria_id, tallas[], tallas_agotadas[], colores[], fotos: Foto[] (≥1), etiquetas[], estado: publicado|agotado, vendedora_id|null, orden, nuevo, ultimas_unidades, popularidad|null, precio: {regular, ventanas: Ventana[] (≥1)}}`.
  - `Ventana = {desde|null, hasta|null, precio, antes|null, descuento_pct|null, etiqueta|null, liquidacion, cuenta_regresiva, oferta_id|null}`.
  - `Temporada = {id, slug, nombre, titulo, subtitulo, intro, cierre, paleta_id, foto_portada: Foto, desde, hasta, visible_en_web, revista, vigencia_hasta (date), fotos: [{id, foto: Foto, tipo: producto|ambiente, productos[], texto, destacada}]}`.
- `validarCatalogo` = Ajv + invariantes: cada `Foto.id` existe en `fotos`; cada id referenciado (categoría, vendedora, producto en sección/temporada, paleta) existe; ventanas ordenadas y sin solaparse; ≤ 1 `temporada_activa_id` válida; exactamente una vendedora `por_defecto`; códigos únicos.
- Docs: `modelo-datos.md` (14 pestañas con columnas, tipo y regla: ids `<prefijo>_<8 hex>` con prefijos `prd cat sec por ofe tem tfo pal ven`; booleanos = casillas; fechas = fecha-hora de Sheets en America/Lima; listas = CSV; `paletas.tokens` = JSON), `api-panel.md` (funciones de `google.script.run`: estado inicial, CRUD genérico `listar/crear/guardarCampo/guardarCampos/eliminar/reordenar`, fotos `subirFoto/miniaturas/biblioteca/altaRapida`, `vistaPreviaPrecios`, `guardarTexto/guardarConfig/guardarTokenGithub`, `publicar/estadoPublicacion`, `resumen`, `documentos`, `validarPaleta`, `deshacer/historial`; con entradas, salidas y errores `codigo: detalle`), `api-publica.md` (rutas, sobre `{ok, datos|error}`, errores `sin_instalacion sin_publicacion foto_no_publicada foto_muy_grande ruta_desconocida`, eventos `vista whatsapp favorito compartir revista_descarga` × origen `web revista_web pdf catalogo_pdf`, límite 120 eventos/min), `documentos.md`, `datos-web.md` (`web/src/data/catalogo.json` = catálogo + `imagenes`), `tokens-diseno.md`.

- [ ] **Step 1: Tests que fallan** en `test/contratos.test.mjs`:
  - `contraste('#000000', '#FFFFFF')` ≈ 21 (±0.01); `contraste('#777777', '#FFFFFF')` ≈ 4.48 (±0.01).
  - `TOKENS` tiene los 16 nombres del spec, en ese orden; `PARES_CONTRASTE` incluye `{a:'--color-sobre-oferta', b:'--color-oferta', min:4.5}` y `{a:'--color-foco', b:'--color-fondo', min:3}`.
  - `validarCatalogo({})` → `ok:false` y `errores` menciona `productos`.
  - Un catálogo mínimo válido construido en el test → `ok:true`; el mismo con una `Foto.id` ausente de `fotos` → error que nombra ese id; con dos ventanas solapadas → error que nombra el código del producto.
- [ ] **Step 2:** `npm test` → FAIL (módulos no existen).
- [ ] **Step 3:** implementar `contratos/*` y escribir los `.md`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `docs: contratos de datos, API, documentos y tokens`.

### Task 3: Datos de ejemplo

**Files:** Create `fixtures/generar-imagenes.mjs`, `fixtures/generar-catalogo.mjs`, `fixtures/catalogo.ejemplo.json`, `fixtures/img/*.jpg`, `test/fixtures.test.mjs`.

**Interfaces:** Consumes `validarCatalogo`. Produces 20 productos (categorías Vestidos `VES`, Blusas `BLU`, Pantalones `PAN`, Accesorios `ACC`), 1 temporada activa `verano-2027` con 10 fotos (mezcla producto/ambiente), 2 portadas, 2 vendedoras, 2 ofertas (una % con `cuenta_regresiva` y fin en 10 días; una liquidación), 2 paletas provisionales. Fotos = JPG 4:5 de 1200×1500 generados con sharp (degradé + texto), nombrados `<id>.jpg` con ids ficticios `fx_<8 hex>`. `generar-catalogo.mjs --ahora=<ISO>` calcula fechas relativas a `ahora` (por defecto, la hora actual).

- [ ] **Step 1: Test que falla** `test/fixtures.test.mjs`: `validarCatalogo(ejemplo).ok === true`; 20 productos; `temporada_activa_id` apunta a una temporada con 10 fotos; cada id de `fotos` tiene `fixtures/img/<id>.jpg`; cada JPG mide 1200×1500.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** escribir los generadores; `npm run fixtures` produce imágenes y JSON.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `test: catálogo e imágenes de ejemplo`.

### Task 4: Banco de pruebas GAS (cargador + dobles)

**Files:** Create `apps-script/test/gas/cargar.mjs`, `apps-script/test/gas/dobles/{index,hojas,drive,servicios}.mjs`, `apps-script/test/gas/ejemplo/{a,b}.js`, `apps-script/test/gas/{dobles,cargar}.test.mjs`.

**Interfaces:**
- `cargarGas(proyecto: 'panel'|'api'|string, { dobles } = {}) → { ctx, dobles, valor(expr) }`: ejecuta todos los `.js` de `apps-script/<proyecto>/src/**` (orden por ruta) en un `vm.Context` compartido cuyos globales son los dobles; `valor('ESQUEMA')` lee constantes de nivel superior.
- `crearDobles({ usuario='duena@example.com', dueno='duena@example.com' } = {}) →` `{ SpreadsheetApp, DriveApp, PropertiesService, CacheService, LockService, UrlFetchApp, Session, ContentService, HtmlService, Utilities, Logger, MimeType }` + ayudas de test `_drive` (archivos/carpetas en memoria) y `_url.responder(regex, {codigo, texto|bytes, tipo})` / `_url.llamadas`.
- Subconjunto implementado (lo que S1 usa; S2 lo amplía): hojas `create/openById/getSheetByName/insertSheet/getSheets/deleteSheet/setSpreadsheetTimeZone/getId/getUrl`, rango `getRange(f,c,nf,nc).getValues/setValues`, `getLastRow/getLastColumn/appendRow/setFrozenRows`; Drive `createFolder/getFolderById/getFileById/getFilesByName/getFoldersByName/createFile/moveTo/getParents/getLastUpdated/getBlob/getSize/setContent`; `Utilities.base64Encode/base64Decode/newBlob/getUuid`; `ContentService.createTextOutput().setMimeType()`; `HtmlService.createTemplateFromFile().evaluate()`, `createHtmlOutputFromFile().getContent()`, `setTitle/addMetaTag/setXFrameOptionsMode`.

- [ ] **Step 1: Tests que fallan:** `cargar.test.mjs` → con `apps-script/test/gas/ejemplo` (a.js define `const SALUDO='hola'`, b.js define `function saludar(){return SALUDO}`) `ctx.saludar() === 'hola'`. `dobles.test.mjs` → ida y vuelta `setValues/getValues`; `createFile` + `getFilesByName` encuentra 1; `CacheService` `put/get`; `Utilities.base64Decode(base64Encode(bytes))` igual; `UrlFetchApp.fetch` devuelve lo programado y lo registra; `Session.getActiveUser().getEmail()` = `usuario`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `test: banco de pruebas para Apps Script`.

### Task 5: Panel — esquema, instalación y seguridad

**Files:** Create `apps-script/panel/src/appsscript.json`, `server/{constantes,esquema,instalar,seguridad,main}.js`, `ui/index.html`, tests en `apps-script/test/panel/`.

**Interfaces:**
- `constantes.js`: `NOMBRE_HOJA='Catálogo Ropa — Base de datos'`, `NOMBRE_CARPETA_RAIZ='Catálogo Ropa'`, `NOMBRE_PUNTERO='catalogo-ropa.config.json'`, `NOMBRE_PUBLICADO='catalogo-publicado.json'`, `CARPETAS` (`fotos, temporadas, portadas, marca, publicado, documentos, revistas, catalogos, reportes` → rutas del spec), `CONFIG_DEFECTO` (`moneda_simbolo:'S/', moneda_codigo:'PEN', pais_codigo:'51', zona_horaria:'America/Lima', redondeo:'ninguno', inicio_modo:'temporada', umbral_ultimas_unidades:3, dias_nuevo:30, min_clics_mas_consultados:3, vigencia_dias_defecto:15`).
- `esquema.js`: `ESQUEMA: { [pestaña]: string[] }` con las 14 pestañas del spec en orden.
- `instalar() → { hojaId, hojaUrl, carpetaRaizId, nueva: boolean }`; escribe el puntero `{version:1, hoja_id, carpetas:{…}, publicado_id:null}` en la carpeta raíz y las propiedades `CR_HOJA_ID`, `CR_CARPETA_RAIZ_ID`, `CR_PUNTERO_ID`.
- `requireAdmin_()` → lanza `Error('no_autorizado')` si `Session.getActiveUser().getEmail()` está vacío o difiere (sin mayúsculas) de `Session.getEffectiveUser().getEmail()`.
- `doGet(e)` → panel (`ui/index.html`, título `Panel · Catálogo`, meta viewport) o página «Acceso restringido»; `include(ruta) → string`; `autorizar() → 'ok'`.
- `appsscript.json`: V8, `America/Lima`, `webapp` del Global Constraints, `oauthScopes`: `spreadsheets`, `drive`, `script.external_request`, `script.scriptapp`, `userinfo.email`.

- [ ] **Step 1: Tests que fallan:**
  - `esquema.test`: 14 pestañas en el orden del spec; `modelo-datos.md` menciona cada pestaña y cada columna entre backticks.
  - `instalar.test`: crea la hoja `NOMBRE_HOJA` con las 14 pestañas, encabezados de `ESQUEMA` y fila 1 congelada; zona horaria `America/Lima`; árbol de carpetas completo; hoja dentro de la carpeta raíz; `config` con los valores de `CONFIG_DEFECTO`; puntero con todos los ids; **segunda llamada** → `nueva:false`, sigue habiendo 1 hoja y 1 carpeta raíz, y una pestaña borrada a mano vuelve a crearse; con `usuario='otra@example.com'` lanza `no_autorizado` y no crea nada.
  - `seguridad.test`: dueño (mayúsculas distintas) pasa; `''` y otro correo lanzan `no_autorizado`.
  - `main.test`: `doGet` como dueño → contenido incluye `id="panel"`; como anónimo → incluye `Acceso restringido` y no `id="panel"`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(panel): esquema, instalar() y control de acceso`.

### Task 6: API pública — catálogo y fotos

**Files:** Create `apps-script/api/src/{appsscript.json,main.js,datos.js,respuesta.js}`, `apps-script/test/api/api.test.mjs`.

**Interfaces:**
- `doGet(e) → TextOutput JSON` con sobre `{ok:true, datos}` / `{ok:false, error}`; `doPost(e) → {ok:false, error:'no_implementado'}` (S2 lo completa); `autorizar() → 'ok'`.
- `config_() →` puntero (busca `NOMBRE_PUNTERO` por nombre; si hay varios, el de `getLastUpdated` más reciente; guarda `CR_PUNTERO_ID`; si el id guardado falla, vuelve a buscar).
- `leerPublicado_() → objeto | null`; `json_(obj) → TextOutput`.
- `?r=foto&id=` → `{ok:true, datos:{mime, nombre, base64}}` solo si `id ∈ publicado.fotos`; tamaño > 8 MB → `foto_muy_grande`.
- `appsscript.json`: V8, `America/Lima`, `webapp` del Global Constraints, scopes `drive.readonly` y `spreadsheets`.

- [ ] **Step 1: Tests que fallan:** sin puntero → `sin_instalacion`; puntero sin publicado → `sin_publicacion`; con publicado → `datos` igual al JSON guardado; foto publicada → base64 que decodifica a los bytes guardados; foto existente **no publicada** → `foto_no_publicada` y `DriveApp.getFileById` nunca recibe ese id; foto de 9 MB → `foto_muy_grande`; ruta rara → `ruta_desconocida`; dos punteros → usa el más reciente; segunda llamada no vuelve a buscar por nombre; el código de `apps-script/api/src` no define funciones `crear|guardar|eliminar|publicar|instalar` (regex sobre el código fuente).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(api): catálogo publicado y fotos con lista blanca`.

### Task 7: Proyectos Apps Script reales (clasp)

**Files:** Create `apps-script/panel/.clasp.json`, `apps-script/api/.clasp.json` (ignorados), `.env.local` (ignorado: URLs de panel y API). Modify root `package.json` scripts `push:panel`, `push:api`, `desplegar:panel`, `desplegar:api` (`clasp -P apps-script/<p> push -f` / `redeploy <id>`).

- [ ] **Step 1:** `clasp create-script --type standalone --title "Catálogo Ropa · Panel" --rootDir src` dentro de `apps-script/panel` (ídem `Catálogo Ropa · API pública` en `apps-script/api`).
- [ ] **Step 2:** `npm run push:panel` y `npm run push:api` → «Pushed N files».
- [ ] **Step 3:** `clasp -P apps-script/<p> create-deployment -d "v1"` en ambos; guardar ids y URLs `/exec` en `.env.local`.
- [ ] **Step 4:** Verificar: `git status --short` no muestra `.clasp.json` ni `.env.local`.
- [ ] **Step 5:** Commit `chore: scripts de clasp`.

### Task 8: Repositorio en GitHub, Pages y CI

**Files:** Create `.github/workflows/ci.yml` (push/PR → `npm ci`, `npm test`, `npm run build:fixture -w web`, `npm run verificar:build -w web`; Node 24; versiones mayores de `actions/*` vigentes, consultadas con `gh api repos/actions/<x>/releases/latest`).

- [ ] **Step 1:** `gh repo create cayogabriel/catalogo-ropa --public --source . --push`.
- [ ] **Step 2:** `gh api -X POST repos/cayogabriel/catalogo-ropa/pages -f build_type=workflow`; `gh variable set CATALOG_API_URL --body <url API>`.
- [ ] **Step 3:** push de `ci.yml` (tras Task 9, para que el build exista) y `gh run watch` → success.

### Task 9: Web mínima y script de publicación

**Files:** Create `web/package.json` (astro, sharp; scripts `dev`, `build`, `build:fixture`, `verificar:build`), `web/astro.config.mjs` (`site` y `base` desde `SITIO_URL`/`SITIO_BASE`, por defecto los del Global Constraints), `web/src/pages/index.astro`, `web/src/pages/p/[codigo].astro`, `web/scripts/{publicar.mjs, verificar-build.mjs}`, `web/scripts/lib/{obtener,fotos}.mjs`, `web/test/publicar.test.mjs`, `.github/workflows/publicar.yml`.

**Interfaces:**
- `obtenerCatalogo({ origen:'api'|'fixture', apiUrl, fetch, rutaFixture }) → catálogo` (valida con `validarCatalogo`; lanza `Error` con la lista de errores, o `API respondió: <error>`).
- `procesarFoto(buffer, { id, dirSalida }) → { ancho, alto, lqip, webp: {[ancho]: ruta}, og: ruta }` (rutas relativas a la base, sin `/` inicial).
- `descargarFotos(catalogo, { origen, apiUrl, fetch, dirCache, dirFixture }) → Map<id, Buffer>` (solo las nuevas o con `actualizado` distinto del índice `web/.cache/fotos/indice.json`; si una falla lanza `Error` con el id y los códigos de producto que la usan).
- `publicar.mjs --origen=api|fixture` escribe `web/src/data/catalogo.json` = catálogo + `imagenes` (`datos-web.md`).
- Páginas de prueba: inicio con la lista de productos; `/p/<código>/` con `<title>`, `og:title`, `og:description`, `og:image` absoluto. S3 y S6 las reemplazan.
- `publicar.yml`: `workflow_dispatch` + `repository_dispatch: [publicar]`; `concurrency: pages`; permisos `contents: read`, `pages: write`, `id-token: write`; caché de `web/.cache` (clave por `run_id`, `restore-keys` por prefijo); `publicar.mjs --origen=api` → `astro build` → `verificar:build` → upload + deploy (el job de deploy depende del build).

- [ ] **Step 1: Tests que fallan:** fixture válido → objeto con 20 productos; API con `{ok:false,error:'sin_publicacion'}` → lanza `API respondió: sin_publicacion`; catálogo sin `productos` → lanza y el mensaje incluye `productos`; `procesarFoto` de un JPG de 1200×1500 → WebP de 480 y 960 (no 1440), `og` de ≤ 300 000 bytes, `lqip` que empieza con `data:image/webp;base64,`; foto de 600 px → solo WebP de 480 y su ancho original sin agrandar; segunda llamada a `descargarFotos` con el mismo índice → 0 descargas; una foto que responde `foto_no_publicada` → lanza con el id y `VES-001`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementar; `verificar-build.mjs` revisa que `dist/p/ves-001/index.html` tenga `og:image` con `https://cayogabriel.github.io/catalogo-ropa/` y que el JPG exista y pese ≤ 300 KB.
- [ ] **Step 4:** `npm test` → PASS; `npm run build:fixture -w web && npm run verificar:build -w web` → «OK».
- [ ] **Step 5:** Commit `feat(web): sitio mínimo, script de publicación y workflow`; push y CI en verde (Task 8 Step 3).

### Task 10: Prueba de punta a punta con Google real

**Files:** Create `apps-script/panel/src/server/pruebas.js`, `apps-script/test/panel/pruebas.test.mjs`.

**Interfaces:** `publicarPrueba() → { productos, fotos, archivoId }` (requiere admin): descarga `fixtures/catalogo.ejemplo.json` y 3 imágenes de `raw.githubusercontent.com/cayogabriel/catalogo-ropa/main/fixtures/…`, las sube a `Fotos/`, reemplaza en el catálogo todos los ids de foto por esos 3 (en rueda), rehace `fotos`, guarda `catalogo-publicado.json` en `Publicado/` y actualiza `publicado_id` del puntero.

- [ ] **Step 1: Test que falla:** con `UrlFetchApp` programado, el JSON guardado pasa `validarCatalogo`, `Object.keys(fotos).length === 3` y el puntero tiene `publicado_id`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar. **Step 4:** `npm test` → PASS; `npm run push:panel`.
- [ ] **Step 5 (usuaria):** en el editor de cada proyecto ejecutar `autorizar` y aceptar permisos; en el Panel, ejecutar `instalar` y luego `publicarPrueba`.
- [ ] **Step 6: Verificar con Google real:** `curl -sL "$API?r=catalogo"` → `ok:true` y `validarCatalogo` OK; `curl -sL "$API?r=foto&id=<publicado>"` → `ok:true`; con un id no publicado → `foto_no_publicada`.
- [ ] **Step 7:** `gh workflow run publicar.yml` → `gh run watch` → success; en el navegador integrado `https://cayogabriel.github.io/catalogo-ropa/p/ves-001/` muestra la foto y el `og:image` responde 200 con ≤ 300 KB.
- [ ] **Step 8:** Commit `test: prueba de publicación de punta a punta`.

### Task 11: Cierre y arranque de sesiones

**Files:** Create `CLAUDE.md`, `README.md`; Modify spec (sección «Notas de implementación S1»: cargador `vm`, paquete `contratos/`, `.clasp.json` ignorado, puntero de configuración, solo la coordinadora despliega).

- [ ] **Step 1:** `CLAUDE.md`: propósito, enlaces al spec y contratos, tabla de carpetas por sesión, convenciones GAS, comandos, reglas (no `clasp push` fuera de la coordinadora, cambios de contrato vía coordinadora, sin secretos ni IDs, marketing honesto, WCAG AA).
- [ ] **Step 2:** `README.md` para la usuaria (qué es, cómo publicar, dónde está cada cosa en Drive).
- [ ] **Step 3:** `npm test` → PASS; commit `docs: CLAUDE.md, README y notas de S1`; push; CI en verde.
- [ ] **Step 4:** revisar la entrega de S5 (JSON válidos, 12 paletas que pasan `PARES_CONTRASTE`); si está lista, commit `content: marca, paletas, textos y campañas`.
- [ ] **Step 5:** arrancar S2, S3, S4 y S6 en worktrees desde `main`, con briefs que nombren spec, contratos, carpetas propias y criterio de «listo».
