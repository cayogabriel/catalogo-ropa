# S3 · Web pública — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las páginas provisionales por la web pública completa (inicio, temporada, catálogo, ficha, Mi lista, contacto), estática, pensada para celular, a partir de `web/src/data/catalogo.json`.

**Architecture:** Astro genera HTML con el precio vigente al construir. La lógica (selección de datos, insignias, filtros, lista, eventos, tema) vive en módulos `.mjs` puros en `web/src/lib/`, probados con Vitest en Node y reutilizados por los scripts de cliente (`web/src/cliente/`), que Astro empaqueta. El JS del navegador solo mejora: vuelve a elegir la ventana de precio, filtra, abre hojas y guarda la lista. Sin JS, todo enlace sigue funcionando.

**Tech Stack:** Astro 7.4 (sin frameworks de UI), CSS con variables de paleta, Vitest 5 (entorno `node`).

**Spec:** `docs/superpowers/specs/2026-11-20-catalogo-ropa-design.md` + contratos `docs/contracts/datos-web.md`, `tokens-diseno.md`, `api-publica.md` (eventos).

## Global Constraints

- Solo se tocan `web/src/` (salvo `compartido/`, `pages/imprimir/`, `pages/ir/`, `components/imprimir/`), `web/public/` (salvo `img/`), `web/astro.config.mjs` y `web/test/sitio/`.
- Precio, formatos, mensajes de WhatsApp y enlaces: se importan de `web/src/compartido/`; no se reescriben.
- Nunca `set:html`: todos los textos del catálogo son texto plano. Los datos para el cliente viajan en atributos `data-*` (Astro los escapa).
- Tokens de paleta en `:root` dentro del HTML: atributo `style` del `<html>` (es el `:root`), sin parpadeo.
- Google Fonts con `display=swap`, máximo 2 familias y 2 pesos por familia.
- Animaciones de 150–300 ms, solo `transform`/`opacity`, interrumpibles; todo bajo `prefers-reduced-motion` se apaga.
- WCAG 2.1 AA: `lang="es"`, foco visible con `--color-foco`, `alt` en cada foto, áreas táctiles ≥ 44 px. `--color-primario` solo garantiza 3:1 sobre el fondo, así que se usa para fondos de botón, nunca para texto pequeño.
- Insignias solo según la regla 4 de `datos-web.md`; ninguna se inventa.
- Eventos: `navigator.sendBeacon(PUBLIC_API_URL, JSON.stringify({t,p,s,o,pg,ss}))`; sin `PUBLIC_API_URL`, nada.
- `localStorage['catalogo-ropa:lista']` = arreglo de `{ codigo, talla, color }`, todo dentro de `try/catch`.
- Textos desde `catalogo.textos`; si falta una clave, respaldo en `content/textos.json` (S5). Claves `_…` nunca se muestran.
- `og:image` = `URL_BASE` (de `web/sitio.config.mjs`) + `imagenes[id].og`; `npm run verificar:build -w web` en OK.

## Review Focus

1. **`localStorage` bloqueado o con basura** (JSON roto, objetos sin `codigo`, códigos que ya no existen): la lista no rompe la página y sigue en memoria. → tests en Task 2 y filtro de códigos desconocidos en Task 7.
2. **Oferta que empieza o termina entre el build y la visita:** el precio, el % y las secciones Ofertas/Liquidación se recalculan en el navegador. → tests de `presentarPrecio` y `requisitoCumplido` en Task 1.
3. **Parámetros de URL raros en el catálogo** (`?talla=<script>`, `?min=abc`, categoría inexistente): se ignoran sin romper el filtro. → test en Task 3.
4. **Paleta propia con una fuente de un solo peso o un nombre con caracteres raros:** la URL de Google Fonts sigue siendo válida y el `style` no se puede inyectar. → tests en Task 1 (`urlFuentes`, `estiloTokens`).
5. **Ruta del evento con caracteres que el contrato rechaza** (acentos, base `/catalogo-ropa`): `pg` se limpia para cumplir `^/[A-Za-z0-9/_.?=&%-]{0,199}$`. → test en Task 2.

---

### Task 1: Lógica de datos, precio, insignias, tema e imágenes

**Files:**
- Create: `web/src/lib/datos.mjs`, `web/src/lib/vista-precio.mjs`, `web/src/lib/tema.mjs`, `web/src/lib/imagenes.mjs`, `web/src/lib/textos.mjs`
- Test: `web/test/sitio/datos.test.mjs`, `web/test/sitio/vista-precio.test.mjs`, `web/test/sitio/tema.test.mjs`

**Interfaces (Produces):**
- `datos.mjs`
  - `vigente({desde,hasta}, ahora) → boolean` (null = sin límite).
  - `productoPorId(catalogo) → (id) => producto|undefined`.
  - `temporadaActiva(catalogo) → temporada|null`; `temporadasPublicadas(catalogo)` (activa + `visible_en_web`); `temporadasArchivo(catalogo)` (`visible_en_web` y no activa).
  - `portadasVigentes(catalogo, ahora)` ordenadas por `orden`, solo las que no terminaron; cada una con `pendiente: true` si aún no empieza.
  - `requisitoSeccion(seccion) → 'oferta'|'liquidacion'|null`; `seccionesInicio(catalogo, ahora) → [{ seccion, productos, requisito, enlace }]` ordenadas por `orden`, sin las vacías tras aplicar la regla 2. `enlace` = `catalogo/`, `catalogo/?oferta=1` o `catalogo/?categoria=<slug>` (si todas son de una categoría), o `null`.
- `vista-precio.mjs`
  - `presentarPrecio(producto|{precio}, ahora) → { precio, antes, pct, etiqueta, oferta, liquidacion, hasta, cuentaRegresiva }` (`antes`/`pct` solo con `oferta_id`).
  - `requisitoCumplido(requisito, ventana) → boolean`.
  - `insignias(producto, ahora, textos) → [{ tipo: 'nuevo'|'descuento'|'liquidacion'|'ultimas'|'consultado', texto }]` exactamente según la regla 4 (popularidad 1–3).
  - `restante(hastaIso, ahora) → { dias, horas, minutos } | null`.
- `tema.mjs`: `estiloTokens(paleta) → string` (`--color-…:#hex;…;--fuente-titulos:…;--fuente-texto:…;--radio:…`, solo hex válidos y nombres de fuente `[A-Za-z0-9 ]`); `urlFuentes(paleta) → string` (títulos `wght@400`, texto `wght@400;700`, una sola familia si coinciden, `display=swap`).
- `imagenes.mjs`: `srcset(imagen, base)`, `srcMayor(imagen, base)`, `ogAbsoluta(imagen, urlBase)`.
- `textos.mjs`: `crearTextos(catalogo, respaldo) → (clave, variables?) => string` con `{tienda}` y `{anio}` siempre disponibles (usa `interpolar` de `compartido/mensajes.mjs`).

- [ ] Tests (fallan): ventanas pasadas/futuras/null; portada terminada fuera y futura `pendiente`; sección `ofertas` sin candidatas vigentes desaparece; `liquidacion` exige `liquidacion: true`; insignias de VES-001 a la fecha de la oferta = `nuevo`, `descuento '-25%'`, `consultado`; popularidad 4 no da insignia; sin oferta no hay `antes` ni `pct`; `urlFuentes` con `Lato`/`Lato` pide una sola familia; `estiloTokens` descarta `#zzz` y `red;}` y limpia `Poppins</style>`.
- [ ] Implementar, `npx vitest run web/test/sitio` en verde, commit.

### Task 2: Lista y eventos

**Files:** Create `web/src/lib/lista.mjs`, `web/src/lib/eventos.mjs`; Test `web/test/sitio/lista.test.mjs`, `web/test/sitio/eventos.test.mjs`.

**Interfaces (Produces):**
- `CLAVE_LISTA = 'catalogo-ropa:lista'`; `crearLista(almacen|null) → { leer(), guardar(items), agregar({codigo,talla,color}), quitar(codigo), contiene(codigo), actualizar(codigo, cambios), vaciar() }`. Una entrada por código; `leer()` descarta entradas sin `codigo` string; si `almacen` lanza, sigue en memoria.
- `limpiarRuta(pathname, base) → string` (quita la base, deja solo `[A-Za-z0-9/_.?=&%-]`, máximo 200, siempre empieza con `/`).
- `idSesion(almacen|null, aleatorio) → string` de 16 `[a-z0-9]`, guardado en `catalogo-ropa:sesion`.
- `crearEventos({ url, beacon, sesion, ruta }) → enviar({ t, p=null, s=null, o='web' }) → boolean` (false sin `url` o con `t`/`o` fuera de lista).

- [ ] Tests (fallan): almacén que lanza en `getItem`/`setItem`; JSON roto → `[]`; `agregar` dos veces el mismo código actualiza en vez de duplicar; `limpiarRuta('/catalogo-ropa/p/ves-014/', '/catalogo-ropa/') === '/p/ves-014/'` y acentos fuera; sin URL no llama a `beacon`; cuerpo enviado igual al ejemplo del contrato.
- [ ] Implementar, tests verdes, commit.

### Task 3: Filtros del catálogo

**Files:** Create `web/src/lib/filtros.mjs`; Test `web/test/sitio/filtros.test.mjs`.

**Interfaces (Produces):**
- `leerFiltros(params: URLSearchParams, opciones) → { categoria, talla, color, min, max, oferta, q, orden }` (valores fuera de `opciones` → `null`; `min`/`max` numéricos o `null`).
- `escribirFiltros(filtros) → string` (query sin vacíos, orden estable: `categoria, talla, color, min, max, oferta, q, orden`).
- `opcionesFiltro(items) → { categorias, tallas, colores, precioMin, precioMax }`.
- `aplicar(items, filtros) → items` (filtra y ordena). `item = { codigo, nombre, categoria, tallas, agotadas, colores, precio, oferta, orden }`. Talla agotada no cuenta. Búsqueda sin tildes ni mayúsculas, sobre nombre + código + color. Órdenes: `recomendado` (campo `orden`), `precio-asc`, `precio-desc`, `nombre`.
- [ ] Tests (fallan): los casos de arriba + Review Focus 3. Implementar, verde, commit.

### Task 4: Layout, tema y componentes base

**Files:** Create `web/src/layouts/Base.astro`, `web/src/components/{Imagen,Precio,Insignias,TarjetaProducto,Encabezado,Pie,Contacto}.astro`, `web/src/estilos/global.css`, `web/src/lib/sitio.mjs` (carga `catalogo.json`, textos, base, `url(ruta)`), `web/src/cliente/{comun,precios,aviso}.mjs`.

- `Base.astro` props: `titulo, descripcion, ogImagen, rutaCanonica, paleta, origen ('web'|'revista_web'), producto?, temporada?`. Escribe `<html lang="es" style={estiloTokens(paleta)}>`, fuentes (preconnect + `display=swap`), OG/Twitter, canonical, salto al contenido, encabezado (nombre, Catálogo, Contacto, Mi lista con contador), pie (horario, envíos, redes, nota de precios), región `aria-live` del aviso y `data-evento` para la vista.
- `cliente/precios.mjs`: recorre `[data-precio]`, vuelve a elegir la ventana, actualiza ahora/antes/%, insignia de descuento, cuenta regresiva, `[data-requisito]` y portadas `[data-desde]/[data-hasta]`.
- Verificar: `npm run build:fixture -w web` compila con las páginas provisionales usando el layout. Commit.

### Task 5: Inicio y temporada

**Files:** Replace `web/src/pages/index.astro`; Create `web/src/pages/temporada/[slug]/index.astro`, `web/src/components/{BloqueTemporada,Portada,Seccion,HojaProducto,SelectorPedido}.astro`, `web/src/cliente/{temporada,pedido}.mjs`.

- Inicio: `inicio_modo` `temporada` (o sin activa → secciones): temporada activa → portadas restantes → secciones → categorías → archivo. `secciones`: portadas → secciones → categorías → temporada activa → archivo.
- Temporada: portada a todo el ancho, intro, fotos (fundido al entrar en pantalla con `IntersectionObserver`), botones de prendas que son enlaces a la ficha y, con JS, abren `<dialog>` hoja inferior (foto, precio vigente, tallas, colores, «Pedir por WhatsApp», Mi lista, «Ver ficha»), cierre, bloque de contacto, «Descargar revista (PDF)» solo si `revista: true`. Paleta de la temporada; `origen = 'revista_web'`.
- `SelectorPedido` + `cliente/pedido.mjs`: tallas/colores en radios, mensaje con `mensajeProducto`, eventos `whatsapp` y `favorito`. Lo reutiliza la ficha.
- Verificar en build. Commit.

### Task 6: Catálogo y ficha

**Files:** Create `web/src/pages/catalogo/index.astro`, `web/src/cliente/catalogo.mjs`; Replace `web/src/pages/p/[codigo].astro`; Create `web/src/components/Galeria.astro`, `web/src/cliente/{galeria,compartir}.mjs`.

- Catálogo: todas las tarjetas en el HTML con `data-item` (JSON del ítem de Task 3); el cliente lee la URL, filtra/ordena moviendo nodos, actualiza la URL con `history.replaceState`. Cajón de filtros = `<dialog>` lateral; búsqueda y orden visibles.
- Ficha: galería con `scroll-snap`, puntos, zoom en `<dialog>` a pantalla completa (tocar = 2×, se puede desplazar); tallas agotadas tachadas y deshabilitadas; precio antes/ahora/%; insignias; cuenta regresiva; Compartir (Web Share → copiar enlace → aviso «Enlace copiado»); «Pedir por WhatsApp»; Mi lista; «También te puede gustar». `og:image` de la foto principal. Producto `agotado`: aviso «Agotado por ahora», sin botón de pedido.
- Transición de vista entre tarjeta y ficha con `@view-transition` (apagada con movimiento reducido).
- Verificar `npm run verificar:build -w web`. Commit.

### Task 7: Mi lista, contacto y 404

**Files:** Create `web/src/pages/lista/index.astro`, `web/src/cliente/lista-pagina.mjs`, `web/src/pages/contacto/index.astro`, `web/src/pages/404.astro`.

- Lista: datos compactos de todos los productos en `data-productos`; pinta la lista guardada (ignora códigos que ya no existen y agotados fuera del mensaje), permite cambiar talla/color y quitar, total, «Enviar mi lista por WhatsApp» con `mensajeLista` y la vendedora por defecto, «Vaciar lista», nota «solo en este dispositivo».
- Contacto: WhatsApp de la vendedora por defecto, redes con `urlRed`, horario y envíos.
- Commit.

### Task 8: Verificación y revisión

- [ ] `npm test`, `npm run build:fixture -w web && npm run verificar:build -w web` en verde.
- [ ] Navegador integrado (`npm run dev -w web` o `astro preview`): 375 px y escritorio, teclado (Tab, Esc en hojas), movimiento reducido, consola sin errores.
- [ ] Revisión con un revisor nuevo (requesting-code-review); corregir lo crítico e importante; commit.
