# Plan — Catálogo de ropa con panel de administración

## Contexto

Quieres un catálogo web de ropa para vender por WhatsApp: fotos, ofertas y secciones pensadas con marketing. Habrá un **enlace público** para las clientas y un **panel privado** donde la administradora controla precios, ofertas, secciones, temporadas y la paleta de colores de cada una. Todo vive en tu Google: Sheets como base de datos, y fotos y documentos en Drive. El código va a tu GitHub. La carpeta `D:\Venta de ropa` está vacía, así que se construye desde cero, repartido en sesiones especializadas.

**Lo que decidiste:**
- **Dónde vive cada parte:** la web pública, en **GitHub Pages**. El panel y los datos, en **Apps Script + Drive**. El repositorio será **público**: lo exige el plan gratis de GitHub para Pages. Solo lleva código, ningún dato privado.
- **Acceso al panel:** solo entra **tu cuenta Google**.
- **Autoguardado** en el panel, y **favoritos** de las clientas que se envían juntos por WhatsApp.
- **Fotos:** se suben **desde el panel**, desde la computadora o el celular. Se guardan solas en Drive: nunca hay que abrir Drive.
- **Página de cada temporada:** portada y **scroll vertical** con las fotos elegidas para esa temporada, en el orden elegido.
- **Revista de cada temporada:** versión web y PDF en **formato celular 4:5** (1080 × 1350 px), **con precios y fecha de vigencia**. Los botones se pueden tocar: abren WhatsApp con el mensaje armado, o tus redes.
- **Documentos en Drive:** revista PDF, **catálogo PDF** y **reporte de consultas**.

**Ya disponible en tu PC:**
- Node 24 y git.
- GitHub CLI con sesión en la cuenta `cayogabriel`.
- clasp 3.4 con sesión en tu Google y la API de Apps Script activa.
- Plugins instalados: audit-suite (skills de Emil Kowalski), Marketing, Website Copywriting y Remotion. Falta instalar **Social Media Skills**, que usará S8.

## Enfoques considerados

| Enfoque | Qué gana | Qué pierde | Veredicto |
|---|---|---|---|
| **GitHub Pages + Apps Script** | Web rápida, sin la barra gris de Google. Cada producto y cada temporada tiene su página con foto, que aparece en la vista previa de WhatsApp, Facebook e Instagram | Los cambios tardan de 2 a 4 min en verse tras pulsar «Publicar», y hay más piezas | **Elegido** |
| Todo en Apps Script | Lo más simple; cambios al instante | Barra gris «creada por un usuario de Google Apps Script»; enlaces sin foto; fotos que dependen de enlaces de Drive que Google no garantiza | Descartado |
| Apps Script incrustado en Google Sites | Oculta la barra gris | En el celular la web queda dentro de un recuadro con su propio scroll. Mismo problema con las fotos | Descartado |

**PDFs:** los genera el workflow de publicación, imprimiendo con Chromium páginas hechas con el mismo diseño de la web. No se usan plantillas de Google Slides: así la revista se ve como la web, los enlaces del PDF se pueden tocar y el PDF se regenera solo en cada publicación.

**Seguridad del panel:** son **dos proyectos de Apps Script**, no uno con dos despliegues. clasp aplica el mismo acceso a todos los despliegues de un proyecto, y con acceso público Google no garantiza saber quién entra. Separados, el proyecto público no contiene ninguna función que modifique datos.

## Arquitectura

```
 Tú (administradora)                              Clientas
       │                                              │
       ▼                                              ▼
[Panel · Apps Script #1]                 [Web pública · GitHub Pages]
 acceso: solo tu cuenta                   cayogabriel.github.io/catalogo-ropa
 autoguarda en Sheets                     inicio · temporada · catálogo · ficha
 sube fotos a Drive (privadas)            revista web + revista PDF + catálogo PDF
       │ botón «Publicar»                             │ «Pedir por WhatsApp»
       ▼                                              ▼
 Publicado/catalogo.json (Drive) ──► [GitHub Actions: publicar.yml]   wa.me/51…?text=…
       ▲                                │ datos + fotos → sharp (WebP) → Astro
       │                                │ Chromium → PDFs 4:5 + JPG de carrusel
[API pública · Apps Script #2] ◄────────┘ → despliega en Pages
 acceso: cualquiera · solo lectura   ◄──── clics/favoritos anónimos (sendBeacon)
       │
 el Panel copia los PDF y JPG publicados a Drive/Documentos
```

1. **Panel (Apps Script #1).**
   - **Acceso:** «ejecutar como yo», acceso «solo yo». Además, cada función vuelve a comprobar que el correo sea el tuyo.
   - **Contenido:** toda la lógica: productos, fotos y biblioteca, motor de precios y ofertas, secciones, portadas, temporadas con sus fotos, paletas, vendedoras, textos, configuración, historial y reporte de consultas.
   - **Al pulsar «Publicar»:**
     1. Arma la copia publicada (un JSON validado) en Drive.
     2. Avisa a GitHub.
     3. Cuando GitHub termina, copia los PDF y las imágenes generadas a `Documentos/`.
2. **API pública (Apps Script #2).**
   - **Acceso:** «ejecutar como yo», acceso «cualquiera».
   - **Qué hace:** solo tres cosas.
     - `?r=catalogo`: devuelve la copia publicada.
     - `?r=foto&id=…`: devuelve la imagen en base64, **solo si figura en la copia publicada**.
     - `doPost`: registra eventos anónimos, validados y con límite por minuto.
   - **Sin IDs en el repo:** encuentra la hoja sola la primera vez, así que el repo público no lleva ningún ID.
3. **Google Sheets «Catálogo Ropa — Base de datos».** Pestañas: `productos`, `categorias`, `secciones`, `portadas`, `ofertas`, `temporadas`, `temporada_fotos`, `paletas`, `vendedoras`, `textos`, `config`, `eventos`, `estadisticas_diarias`, `historial`.
4. **Drive `Catálogo Ropa/`.** Carpetas: `Fotos/` (productos), `Temporadas/<temporada>/` (fotos de ambiente o modelo), `Portadas/`, `Marca/`, `Publicado/`, `Documentos/Revistas/<temporada>/` (PDF + JPG de carrusel), `Documentos/Catálogos/` y `Documentos/Reportes/`. Las fotos originales quedan privadas.
5. **Web pública (Astro, sitio estático).** Se genera en GitHub Actions. Los precios llevan «ventanas» de fechas ya calculadas, y un JS mínimo elige la vigente: una oferta empieza o termina a su hora sin reconstruir el sitio.
6. **GitHub Actions.**
   - **`publicar.yml`:** se dispara con «Publicar» (`repository_dispatch`), a mano, y cada madrugada entre 00:00 y 01:00 (hora de Lima) con un activador de Apps Script. En cada ejecución:
     1. Descarga datos y fotos, y guarda en caché las fotos que no cambiaron.
     2. Las convierte a WebP con sharp.
     3. Arma el sitio.
     4. Imprime los PDF con Chromium (Playwright) y exporta cada página de la revista como JPG.
     5. Despliega.
   - **`ci.yml`:** corre los tests en cada push.

**Stack:**
- Apps Script V8 + clasp.
- Panel: HtmlService + Alpine.js (versión fija desde CDN).
- Web: Astro + CSS con variables por paleta.
- Tests: Vitest.
- Imágenes: sharp.
- PDF: Playwright/Chromium.

Los nombres del dominio van en español (`productos`, `ofertas`, `temporadas`).

## Qué hace la v1

**Web pública**
- **Inicio:**
  - Primero, la **temporada activa**: portada y sus fotos en scroll vertical.
  - Debajo, las secciones ordenables: Novedades, Ofertas, Liquidación (con estilo propio), Más consultados y Por categoría.
  - Desde el panel se puede cambiar para que el inicio muestre primero las secciones.
- **Página de temporada** (`/temporada/<nombre>/`):
  - Portada a todo el ancho, texto de introducción y las fotos elegidas, una tras otra.
  - Cada foto puede llevar las prendas que aparecen en ella: al tocarlas se abre una hoja inferior con foto, precio, tallas y «Pedir por WhatsApp».
  - Al final:
    - un bloque de contacto (WhatsApp, Instagram, Facebook y TikTok, según cuáles configures);
    - el botón **«Descargar revista (PDF)»**.
  - Las temporadas anteriores pueden quedar visibles como archivo, si lo marcas.
- **Catálogo:** filtros por categoría, talla, color, precio y «solo ofertas»; orden y búsqueda.
- **Ficha de producto** (`/p/<código>/`):
  - galería deslizable con zoom;
  - tallas (las agotadas, tachadas) y colores;
  - precio antes/ahora con su % de descuento;
  - insignias (Nuevo, -30 %, Liquidación, Últimas unidades);
  - botón para compartir.
- **«Pedir por WhatsApp»:** abre `wa.me/<número>` con un mensaje armado desde la plantilla: producto, código, talla, color, precio y el enlace de la ficha. La foto aparece en la vista previa. El número es el de la vendedora asignada o, si no hay, el de la vendedora por defecto.
- **Otras redes:** Instagram abre el chat directo (`ig.me`), Facebook abre Messenger (`m.me`) y TikTok abre tu perfil. Solo WhatsApp garantiza que el mensaje salga ya escrito.
- **Mi lista (favoritos):** se guarda en el navegador de la clienta y se envía completa en un solo mensaje.
- **Tema:** colores y tipografías de la paleta de la temporada activa.
- **Accesibilidad (WCAG 2.1 AA):** contraste verificado, teclado, foco visible, texto alternativo en cada foto, respeto de `prefers-reduced-motion` y botones de al menos 44 px.
- **Animaciones con el criterio de Emil Kowalski:** cortas (150–300 ms), con propósito, solo `transform`/`opacity` e interrumpibles. Por ejemplo:
  - las fotos de la temporada aparecen con un fundido suave al hacer scroll (sin parallax que trabe);
  - transición de vista de la tarjeta a la ficha;
  - respuesta al tocar;
  - cajón de filtros;
  - aviso «Agregado a tu lista».
- **Medición anónima** (sin cookies ni datos personales): vistas, clics a WhatsApp, favoritos y compartidos. Cada evento registra su origen: web, revista web o PDF.
- **Rendimiento:** `srcset`, carga diferida y una miniatura borrosa mientras carga cada foto. Meta en Lighthouse: ≥ 90 en rendimiento y ≥ 95 en accesibilidad, en celular.

**Revista de temporada (sale sola al publicar)**
- **Revista web:** es la página de la temporada. Al compartirla por WhatsApp se ve la portada; adentro, cada prenda tiene su botón. Es la mejor opción para compartir: los precios siempre están al día y los clics se cuentan.
- **Revista PDF 4:5** (1080 × 1350 px por página). Lleva estas páginas:
  - **portada:** foto, nombre de la temporada y logo;
  - **editoriales:** una foto a todo el ancho, o dos con texto;
  - **de prendas:** foto, nombre, precio antes/ahora y botón «Pedir por WhatsApp»;
  - **contraportada:** contactos, botones de redes, enlace a la web y un **QR**.

  En cada página va la nota «Precios válidos hasta el dd/mm». Detalles:
  - **Botones:** pasan un instante por la web para contar el clic y luego abren WhatsApp o la red social.
  - **Peso:** máximo 10 MB, para que se envíe rápido por WhatsApp.
- **Imágenes de carrusel:** cada página de la revista también se exporta como JPG 1080 × 1350, listo para Instagram o Facebook. S8 las usa.
- **Dónde queda:** el PDF se descarga desde la web y además queda una copia en `Drive/Documentos/Revistas/<temporada>/`.

**Catálogo PDF:** mismo formato 4:5, con 4 prendas por página, precios vigentes y botón de WhatsApp en cada una. Se genera en cada publicación y queda copia en `Documentos/Catálogos/`.

**Panel**
- **Resumen:** clics a WhatsApp, vistas y favoritos por producto (7 y 30 días), con su origen (web, revista, PDF). Muestra también los cambios sin publicar y el estado de la última publicación.
- **Productos:**
  - lista con búsqueda y filtros, edición en línea y ficha completa;
  - **alta rápida:** subes varias fotos y se crea un borrador por foto;
  - estados borrador, publicado, agotado y archivado; opción de duplicar.
- **Fotos:**
  - se suben desde la computadora (arrastrando varias a la vez) o desde el celular (cámara o galería);
  - se comprimen en el navegador y se guardan solas en la carpeta correcta de Drive, con el código del producto en el nombre;
  - se ordenan arrastrando.
- **Biblioteca de fotos:** todas las fotos subidas, para reutilizarlas (por ejemplo, en una temporada) sin volver a subirlas. Muestra dónde se usa cada una. El panel muestra las fotos con miniaturas que entrega el propio Apps Script, así que siguen privadas en Drive.
- **Temporadas:**
  - nombre, fechas, paleta (con vista previa en vivo), foto de portada y textos de la revista (introducción y cierre);
  - **fotos de la temporada:** las eliges de la biblioteca o las subes, las ordenas arrastrando, les pones un texto y las prendas que aparecen;
  - vista previa de la revista;
  - días de vigencia de los precios: 15 por defecto, o hasta el fin de la oferta más próxima, lo que llegue antes.
- **Ofertas:**
  - tipo: porcentaje, monto o precio final;
  - alcance: un producto, una categoría, una sección, una temporada o toda la tienda;
  - fechas, prioridad y etiqueta, con vista previa del precio final;
  - atajo de **Liquidación**.
- **Secciones y portadas:** secciones manuales o automáticas según una regla, y portadas con imagen para escritorio y para celular, botón y fechas. Ambas se ordenan arrastrando.
- **Colores:** el editor de paleta propia avisa si un color no pasa el contraste.
- **Vendedoras y WhatsApp:** números con código de país y plantillas de mensaje con vista previa.
- **Textos de la web:** se editan desde la pestaña `textos`.
- **Configuración:** tienda, logo, moneda, redondeo de precios, redes (WhatsApp, Instagram, Facebook, TikTok), horario, envíos, qué muestra primero el inicio y el token de GitHub.
- **Autoguardado** por campo:
  - indicador «Guardando… / Guardado» y reintento si falla;
  - control de versión, para no pisar cambios hechos desde otra pestaña;
  - **historial y «Deshacer»**.
- **Documentos:**
  - enlaces a la última revista de cada temporada, al catálogo PDF y a los JPG de carrusel (las copias en Drive);
  - **reporte de consultas** mensual: se genera solo el día 1, en una hoja de Drive con una pestaña por mes, y también se ve en el panel.
- **Publicar:** el botón muestra el estado en vivo (publicando → publicado → documentos guardados en Drive).
- **En el celular:** el panel también se usa cómodo desde el teléfono.

## Fuera de alcance (v1)

- Pagos en línea o carrito con cobro.
- Cuentas de clientas.
- Más de una cuenta administradora.
- Inventario completo: solo tallas agotadas y un stock opcional.
- Respaldo automático: Sheets ya guarda su historial de versiones.
- Dominio propio: se puede agregar después, y GitHub redirige los enlaces viejos.
- Publicar solo en redes.
- Revista en A4 para imprimir.

## Decisiones mías (corrígeme si alguna no va)

- **Dirección de la web:** repo público `cayogabriel/catalogo-ropa` → `https://cayogabriel.github.io/catalogo-ropa/`.
  - Cada producto vive en `/p/<código>/` (por ejemplo `/p/ves-014/`) y cada temporada en `/temporada/<nombre>/`.
  - El código se genera solo y no cambia tras publicar, así los enlaces compartidos no se rompen.
- **Valores de Perú por defecto** (detectados en tu PC): moneda S/, código +51, zona horaria America/Lima y temporadas del hemisferio sur (verano de diciembre a marzo). Todo se puede cambiar en el panel.
- **Guardar no es publicar:** cada cambio se guarda al instante en Sheets, pero sale a la web y a los PDF solo al pulsar «Publicar». El panel avisa si hay cambios sin publicar.
- **Fotos de la temporada:** pueden ser de productos o de ambiente/modelo. La cantidad y el orden los eliges tú. Sugerencia: entre 8 y 20 fotos, para que el scroll no canse ni la página pese.
- **Ofertas:** no se suman. Gana la de mayor prioridad y, si empatan, la de mayor descuento. El «precio antes» es siempre el precio regular real.
- **Vigencia de la revista:** la fecha de «válidos hasta» se calcula sola (ver Temporadas). Cada madrugada se regenera la revista con la fecha nueva. **Te comprometes a respetar esos precios hasta la fecha impresa**, porque las revistas ya enviadas la conservan.
- **Documentos en Drive:** se guarda solo la última versión de cada revista y del catálogo; al publicar se reemplaza, para no llenar la carpeta. Los reportes mensuales sí se acumulan.
- **Marketing honesto:**
  - cuenta regresiva solo si la oferta tiene fecha de fin;
  - «Últimas unidades» solo con stock cargado;
  - «Más consultados» solo con clics reales (mínimo 3 en 30 días);
  - nada inventado.
- **Token de GitHub:** el botón «Publicar» necesita uno. Lo creas tú una vez (te guío): de un solo repositorio, con permisos *Contents: write* y *Actions: read*. Se pega en Configuración y queda en las propiedades privadas del script, nunca en la hoja ni en el repo.
- **Hoja editable a mano:** puedes editar la hoja directamente y el panel siempre lee lo último. Lo que edites a mano no queda en el historial.

## Sesiones

| # | Sesión | Modelo · esfuerzo | Skills principales | Entrega | Carpetas propias |
|---|---|---|---|---|---|
| **S1** | Fundación y contratos (**esta sesión**) | Opus 5.5 · alto | superpowers: writing-plans, test-driven-development, verification-before-completion | Repo en GitHub y Pages activo, contratos, proyectos de Apps Script creados, `instalar()` y prueba de punta a punta de las fotos | raíz, `docs/`, `fixtures/` y esqueletos iniciales |
| **S5** | Marketing y contenido | Sonnet 5.5 · medio | marketing:campaign-plan, marketing:content-creation, marketing:brand-review, copywriting-kit:brand-voice, copywriting-kit:landing-page-copy, copywriting-kit:copy-proof-check, design:ux-copy | Entrevista de marca contigo, 12 paletas de moda verificadas, textos de la web y de la revista, plantillas de WhatsApp, calendario comercial de Perú y guía de tácticas | `content/` |
| **S2** | Backend Apps Script | Sonnet 5.5 · alto | superpowers: writing-plans, test-driven-development, subagent-driven-development, verification-before-completion, requesting-code-review | Lógica del Panel y de la API pública, con tests | `apps-script/panel/src/server/`, `apps-script/api/`, `apps-script/test/` |
| **S3** | Web pública | Opus 5.5 · alto | frontend-design, audit-suite:emil-design-engineering, audit-suite:web-animation-design, audit-suite:make-interfaces-feel-better, audit-suite:web-design-guidelines, design:accessibility-review, superpowers | Inicio, página de temporada con scroll, catálogo, ficha, Mi lista y contacto, más temas, animaciones y accesibilidad | `web/src/` (salvo lo de S6), `web/public/`, `web/astro.config.mjs` |
| **S4** | Interfaz del panel | Sonnet 5.5 · alto | audit-suite:emil-design-engineering, audit-suite:make-interfaces-feel-better, design:ux-copy, design:accessibility-review, superpowers | Interfaz completa del panel (biblioteca de fotos, editor de temporadas, publicación) y simulador local con datos de ejemplo | `apps-script/panel/src/ui/`, `apps-script/panel/dev/` |
| **S6** | Revista, PDFs y publicación | Opus 5.5 · alto | frontend-design, audit-suite:emil-design-engineering, audit-suite:make-interfaces-feel-better, marketing:content-creation, superpowers | Diseño de la revista 4:5 y del catálogo PDF; PDFs y JPG de carrusel con Playwright; páginas `/ir/` que cuentan el clic; script de publicación y workflow | `web/src/pages/imprimir/`, `web/src/pages/ir/`, `web/src/components/imprimir/`, `web/scripts/`, `.github/workflows/publicar.yml` |
| **S7** | Integración y lanzamiento (**esta sesión, al volver**) | Opus 5.5 · alto | superpowers: requesting-code-review, finishing-a-development-branch, verification-before-completion; security-review; audit-suite:full-audit; design:accessibility-review; design:design-critique; google-workspace | Todo unido, desplegado y auditado, más el manual de uso en un Google Doc de tu Drive | — |
| **S8** | Redes sociales | Sonnet 5.5 · medio | Social Media Skills (por instalar: carousel-writer, caption-writer, reels-script, content-calendar, hashtag-strategy, instagram-growth, facebook-strategy), marketing:campaign-plan, marketing:content-creation | Calendario de contenidos; posts y carruseles con las páginas de la revista; textos y hashtags; guiones de reels y TikTok | `marketing-redes/` |
| **S9** | Videos (opcional) | Sonnet 5.5 · alto | remotion:remotion-create, remotion:remotion-render, remotion:remotion-captions | Videos de producto y temporada en 9:16, hechos con las fotos del catálogo | `videos/` |

Haiku 5.5 no lleva sesión propia: ninguna parte es tan mecánica como para arriesgar calidad. Las sesiones pueden usarlo en subagentes para tareas simples.

## Orden

1. **Al aprobar: S1 aquí y, en paralelo, S5.**
   - S5 no depende de S1: el formato de su entrega está fijado abajo.
   - Trabaja solo en `D:\Venta de ropa\content\`, sin commits ni cambios de rama, porque todavía no hay repo.
   - Cuando termina, reviso su trabajo y lo subo a `main`.
2. **Con S1 terminada: S2, S3, S4 y S6 en paralelo**, cada una en su worktree y rama: `feat/backend`, `feat/web-publica`, `feat/panel-ui` y `feat/revista-publicacion`.
   - Cada una toca solo sus carpetas.
   - Si alguna necesita cambiar un contrato o un archivo compartido, me lo pide a mí.
3. **Cuando terminen: S7 aquí.** Antes de unir ramas, te pido permiso.
4. **S8** cuando haya productos reales y una revista publicada; **S9** después, si lo quieres.

Cada sesión de código sigue superpowers: lee este diseño y los contratos → writing-plans → TDD → verificación → revisión de código → deja su rama lista.

## Formato de entrega de S5 (para que pueda arrancar ya)

- **`content/paletas.json`:** 12 paletas. Cada una lleva `id`, `nombre`, `temporada`, `uso` (meses), `fuentes {titulos, texto}` (Google Fonts), `radio` y `tokens`.
  - Tokens: `--color-fondo`, `--color-superficie`, `--color-texto`, `--color-texto-suave`, `--color-borde`, `--color-control`, `--color-primario`, `--color-sobre-primario`, `--color-acento`, `--color-sobre-acento`, `--color-oferta`, `--color-sobre-oferta`, `--color-liquidacion`, `--color-sobre-liquidacion`, `--color-exito` y `--color-foco`.
  - Contraste de 4.5:1 o más en estos pares:
    - texto y texto-suave sobre fondo;
    - texto y texto-suave sobre superficie;
    - cada `sobre-X` sobre su `X`.
  - Contraste de 3:1 o más para `control`, `foco` y `primario` sobre fondo.
  - Se entrega con un informe de los contrastes.
- **`content/textos.json`:** claves con el formato `pagina.componente.elemento`. Como mínimo:
  - `tienda.eslogan`;
  - `inicio.portada.{titulo,subtitulo,boton}`;
  - `seccion.{novedades,ofertas,liquidacion,mas_consultados}.{titulo,subtitulo}`;
  - `temporada.{ver_prendas,descargar_revista}`;
  - `producto.{boton_whatsapp,elige_talla,talla_agotada,compartir,agregar_lista,quitar_lista}`;
  - `precio.{antes,ahora,ahorras}`;
  - `insignia.{nuevo,oferta,liquidacion,ultimas_unidades,mas_consultado}`;
  - `cuenta_regresiva.termina_en`;
  - `lista.{titulo,vacia,enviar_whatsapp}`;
  - `aviso.agregado_lista`;
  - `catalogo.{filtros,buscar,sin_resultados}`;
  - `revista.{precios_validos_hasta,escanea_qr}`;
  - `contacto.{titulo,whatsapp,instagram,facebook,tiktok}`;
  - `pie.{horario,envios}`.

  Puede agregar claves nuevas.
- **`content/plantillas-whatsapp.json`:** una plantilla para un producto, otra para la lista y otra para «desde la revista» (sin talla elegida). Variables: `{vendedora}`, `{producto}`, `{codigo}`, `{talla}`, `{color}`, `{precio}` y `{enlace}`; para la lista, `{lista}` y `{total}`.
- **`content/campanas.json`:** calendario comercial de Perú.
  - Cada campaña lleva `id`, `nombre`, `desde`/`hasta` (en formato MM-DD), `paleta_sugerida`, `tacticas`, textos de portada `{titulo, subtitulo, boton}` y textos de la revista `{intro, cierre}`.
  - Campañas, por ejemplo: verano, liquidación de verano, Día de la Madre, Día del Padre, Fiestas Patrias, invierno, Cyber Wow, Halloween/Canción Criolla y Navidad.
- **`content/guia-marketing.md`:** qué táctica usar, en qué sección y cuándo. Solo tácticas honestas: precio ancla real, urgencia real, escasez real, prueba social real, combos, liquidación, novedades y revista de temporada.

## S1 en detalle (lo que hago al aprobar)

1. Guardo este diseño en `docs/superpowers/specs/2026-11-20-catalogo-ropa-design.md` y escribo el plan detallado de S1 con writing-plans.
2. Preparo el proyecto: `git init`, npm workspaces, Vitest, `.gitignore`, README y `CLAUDE.md` (convenciones, carpetas de cada sesión y comandos).
3. Escribo los contratos y los datos de ejemplo:
   - `docs/contracts/modelo-datos.md`: pestañas y columnas, con tipos y validaciones, incluidas `temporadas` y `temporada_fotos`.
   - `api-panel.md`: funciones del panel, cada una con lo que recibe y devuelve.
   - `api-publica.md`: rutas, eventos con su origen y límites.
   - `catalog.schema.json`: la copia publicada, incluidas temporadas, fotos, vigencia y redes.
   - `documentos.md`: qué PDF y JPG se generan, sus rutas en la web y en Drive, y su tamaño.
   - `tokens-diseno.md`: tokens y pares de contraste.
   - `fixtures/catalogo.ejemplo.json`: 20 productos ficticios y 1 temporada con 10 fotos, con imágenes de muestra generadas.
4. Dejo listo el patrón para probar código de Apps Script en Node: archivos GAS con exportación condicional, más dobles de prueba de SpreadsheetApp, DriveApp, LockService, CacheService, PropertiesService y UrlFetchApp.
5. Creo con clasp los dos proyectos de Apps Script, con un `appsscript.json` mínimo: V8, America/Lima y solo los permisos necesarios.
   - `instalar()` crea la hoja con sus pestañas y encabezados, las carpetas de Drive y la configuración por defecto.
   - Despliego el Panel (acceso: solo yo) y la API (acceso: cualquiera).
6. Creo el repo público con `gh`, subo `main` y activo Pages con GitHub Actions como fuente. Agrego la variable `CATALOG_API_URL` y `ci.yml`.
7. **Prueba de punta a punta (el mayor riesgo):** foto de prueba en Drive → API → workflow → sharp → página en Pages con `og:image`, abierta y verificada en el navegador.
   - El workflow lo disparo a mano con `gh`; el token del botón «Publicar» se configura en S7.
   - Plan B si falla la entrega de imágenes: el panel guarda una copia compartida por enlace y el workflow la descarga de ahí.
8. Commit y push. Mis commits no incluyen `content/`, que es de S5. Después reviso la entrega de S5, la subo y abro S2, S3, S4 y S6 con sus briefs.

## Lo que haces tú

- **Antes de S8:** instalar **Social Media Skills** (opcional, pero recomendado).
- **En S1:** autorizar los dos proyectos de Apps Script la primera vez. Google muestra «app no verificada» → Configuración avanzada → Ir a… Te aviso en el momento.
- **En S5:** responder la entrevista de marca: nombre de la tienda, público, estilo y redes.
- **En S7:**
  - crear el token de GitHub (paso a paso) y pegarlo en Configuración;
  - cargar tus números de WhatsApp, tus redes, tu logo, tus productos y las fotos de la primera temporada.

## Riesgos y cómo se cubren

- **Fotos de Drive en la web:** no se usan enlaces no oficiales de Drive. La API entrega las imágenes y el workflow las convierte. Se prueba en S1, antes de construir encima.
- **Cuotas gratuitas de Apps Script** (6 min por ejecución, 20 000 llamadas externas por día): sobran para una tienda. Las fotos y los PDF que no cambiaron se reutilizan desde la caché del workflow.
- **Tiempo de publicación:** Chromium suma alrededor de un minuto. Se instala desde caché, y los PDF solo se regeneran si cambió algo de lo que contienen.
- **Botones del PDF:**
  - funcionan en los visores de celular más comunes, incluido el de WhatsApp;
  - si un visor no los abre, quedan el QR y el enlace impreso a la web;
  - el PDF se comprime para pesar 10 MB o menos.
- **Vista previa en WhatsApp:**
  - la imagen debe pesar 300 KB o menos; el workflow genera un JPG de 1200 px para eso;
  - WhatsApp guarda la vista previa en caché, así que un cambio de precio puede tardar en verse en enlaces ya compartidos.
- **Seguridad:**
  - El panel solo abre con tu cuenta y cada función vuelve a comprobar tu correo.
  - La API pública:
    - solo escribe el registro de clics;
    - solo entrega fotos que estén publicadas.
  - El token vive en propiedades privadas.
  - En el repo público no hay IDs ni secretos (GitHub además bloquea los secretos al hacer push).

## Verificación

- **`npm test` (Vitest):**
  - motor de precios y ofertas: prioridad, empates, ventanas de fechas y redondeo;
  - cálculo de la vigencia de la revista;
  - validaciones;
  - contraste de las 12 paletas;
  - mensajes de WhatsApp: producto, lista y revista;
  - copia publicada contra `catalog.schema.json`;
  - cola de autoguardado.
- **Web:** `astro build` con los datos de ejemplo. Revisión en el navegador integrado:
  - a 375 px y en escritorio;
  - página de temporada con scroll fluido y sin saltos;
  - teclado y movimiento reducido;
  - Lighthouse: ≥ 90 en rendimiento y ≥ 95 en accesibilidad.
- **PDF (test automático):**
  - páginas de 1080 × 1350;
  - número y destino de los enlaces (WhatsApp, redes, web);
  - nota de vigencia presente;
  - peso de 10 MB o menos;
  - JPG de carrusel de 1080 × 1350;
  - abrir el PDF en el celular desde WhatsApp y tocar un botón.
- **Apps Script:**
  - `clasp push`, y `instalar()` crea la hoja y las carpetas;
  - `probarTodo()` hace una prueba rápida;
  - la URL del panel, abierta sin tu sesión, la bloquea Google;
  - `?r=catalogo` devuelve un JSON válido;
  - `?r=foto` con un ID no publicado se rechaza.
- **Publicación:**
  - «Publicar» → workflow en verde en 4 min o menos → cambios visibles en la web → PDF y JPG copiados en `Drive/Documentos/`;
  - el enlace de un producto o de una temporada compartido por WhatsApp muestra su foto;
  - el botón de WhatsApp abre el número y el mensaje correctos;
  - la lista de favoritos se envía completa;
  - el clic desde el PDF aparece en el reporte con su origen.

## Notas de implementación S1 (21/11/2026)

Decisiones de la fundación que precisan o cambian algo de lo de arriba:

- **Pruebas de Apps Script:** en lugar de la «exportación condicional» se usa un cargador `vm` (`apps-script/test/gas/cargar.mjs`). Ejecuta los archivos GAS en un único ámbito global, con dobles de los servicios de Google, así que los archivos no llevan código extra.
- **Esquema del catálogo y validadores:** viven en el paquete `@catalogo/contratos` (`contratos/`). Los documentos siguen en `docs/contracts/`. El validador también comprueba la lista blanca exacta de fotos y que las ventanas de precio sean contiguas.
- **Ids:** la API encuentra el puntero `catalogo-ropa.config.json` por nombre en Drive. `.clasp.json` y `.env.local` (URLs de despliegue) quedan fuera del repo público.
- **Despliegues:** solo la sesión coordinadora hace `clasp push` y despliega. Dos ramas subiendo al mismo proyecto de Apps Script se pisarían.
- **Error nuevo de la API:** `foto_no_disponible`, para una foto publicada que ya no está en Drive.
- **Herramientas:** Astro 7.4, Vitest 5, sharp 0.35 y Node 24 en CI.
- **Correo de los commits:** los commits del repo usan el correo *noreply* de GitHub, para no publicar el correo personal.
- **Panel provisional:** trae los botones «Instalar» y «Publicar prueba», para no tener que abrir el editor de Apps Script. S4 los reemplaza.
- **Contenido de S5:** se revisó y se subió antes de lo previsto (12/12 paletas pasan el contraste). La tienda todavía no tiene nombre; los textos usan `{tienda}`.
