# Modelo de datos — hoja «Catálogo Ropa — Base de datos»

Una pestaña por entidad. La fila 1 tiene los encabezados exactos de abajo, congelada. La fuente ejecutable es `ESQUEMA` en `apps-script/panel/src/server/esquema.js`, y un test comprueba que este documento y `ESQUEMA` coinciden.

## Tipos de columna

| Tipo | Cómo se guarda en Sheets | Cómo viaja en JSON |
|---|---|---|
| id | texto `<prefijo>_<8 hex>` | texto |
| texto | texto | texto (`''` si está vacío) |
| número | número | número o `null` |
| booleano | casilla (TRUE/FALSE) | `true`/`false` |
| fecha-hora | fecha y hora de Sheets (la hoja usa la zona America/Lima) | ISO 8601 con desfase, o `null` |
| lista | texto separado por comas (`S,M,L`) | arreglo de textos |
| json | texto JSON | objeto |

Toda pestaña editable lleva `version` (número): sube en 1 con cada cambio y el autoguardado la usa para detectar choques. Lo que se edite a mano en la hoja no sube `version` ni queda en el historial, y el Panel lo tolera.

## `productos`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `prd` | único |
| `codigo` | texto | `AAA-000`: prefijo de la categoría + correlativo. Se genera al crear y no cambia después de publicar |
| `nombre` | texto | obligatorio, ≤ 80 |
| `descripcion` | texto | ≤ 600 |
| `categoria_id` | id `cat` | debe existir |
| `precio_regular` | número | > 0 |
| `stock` | número | vacío = no se controla. Con número, «Últimas unidades» se activa si es ≤ `umbral_ultimas_unidades` |
| `tallas` | lista | p. ej. `S,M,L,XL` |
| `tallas_agotadas` | lista | subconjunto de `tallas` |
| `colores` | lista | |
| `fotos` | lista | ids de Drive en orden; la primera es la principal |
| `texto_alt` | texto | vacío = nombre + primer color |
| `etiquetas` | lista | libres, p. ej. `nuevo,destacado` |
| `estado` | texto | `borrador`, `publicado`, `agotado` o `archivado` |
| `vendedora_id` | id `ven` | vacío = vendedora por defecto |
| `orden` | número | |
| `creado_en` | fecha-hora | |
| `actualizado_en` | fecha-hora | |
| `publicado_en` | fecha-hora | se fija la primera vez que se publica |
| `version` | número | |

## `categorias`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `cat` | |
| `nombre` | texto | |
| `slug` | texto | único, `a-z0-9-` |
| `prefijo_codigo` | texto | 3 letras mayúsculas, único (p. ej. `VES`) |
| `orden` | número | |
| `visible` | booleano | |
| `foto` | texto | id de Drive o vacío |
| `version` | número | |

## `secciones`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `sec` | |
| `titulo` | texto | |
| `subtitulo` | texto | |
| `tipo` | texto | `manual`, `novedades`, `ofertas`, `liquidacion`, `mas_consultados`, `categoria` o `etiqueta` |
| `parametro` | texto | id de categoría (tipo `categoria`) o etiqueta (tipo `etiqueta`) |
| `productos` | lista | ids de producto (tipo `manual`), en orden |
| `diseno` | texto | `carrusel`, `grilla` o `destacado` |
| `limite` | número | máximo de productos; vacío = 12 |
| `orden` | número | |
| `visible` | booleano | |
| `temporada_id` | id `tem` | vacío = en todas las temporadas |
| `version` | número | |

## `portadas`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `por` | |
| `titulo` | texto | |
| `subtitulo` | texto | |
| `boton_texto` | texto | |
| `boton_destino` | texto | ruta interna: `/temporada/<slug>/`, `/catalogo/?categoria=<slug>` o `/p/<código>/` |
| `foto_escritorio` | texto | id de Drive |
| `foto_movil` | texto | id de Drive o vacío |
| `desde` | fecha-hora | vacío = desde ya |
| `hasta` | fecha-hora | vacío = sin fin |
| `orden` | número | |
| `activa` | booleano | |
| `temporada_id` | id `tem` | vacío = en todas |
| `version` | número | |

## `ofertas`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `ofe` | |
| `nombre` | texto | interno |
| `tipo` | texto | `porcentaje` (valor 1–90), `monto` (S/ menos) o `precio_final` |
| `valor` | número | > 0 |
| `alcance` | texto | `producto`, `categoria`, `seccion`, `temporada` o `tienda` |
| `objetivos` | lista | ids según el alcance; vacío si es `tienda` |
| `desde` | fecha-hora | vacío = desde ya |
| `hasta` | fecha-hora | vacío = sin fin |
| `prioridad` | número | si dos ofertas coinciden, gana la mayor; si empatan, gana el mayor descuento. No se suman |
| `etiqueta` | texto | texto de la insignia; vacío = `-NN%` |
| `es_liquidacion` | booleano | |
| `cuenta_regresiva` | booleano | solo se muestra si hay `hasta` |
| `activa` | booleano | |
| `version` | número | |

## `temporadas`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `tem` | |
| `slug` | texto | único; da la ruta `/temporada/<slug>/` |
| `nombre` | texto | |
| `titulo` | texto | portada de la temporada |
| `subtitulo` | texto | |
| `intro` | texto | texto de introducción (web y revista) |
| `cierre` | texto | texto de cierre (revista) |
| `paleta_id` | texto | id de `paletas` |
| `foto_portada` | texto | id de Drive |
| `desde` | fecha-hora | |
| `hasta` | fecha-hora | |
| `activa_manual` | texto | vacío = por fechas; `si` la fuerza activa, `no` la apaga. Activa = la forzada o, si no hay, la que contiene «ahora» con el `desde` más reciente |
| `visible_en_web` | booleano | archivo: se sigue viendo cuando no está activa |
| `revista` | booleano | generar revista web y PDF |
| `vigencia_dias` | número | vacío = `vigencia_dias_defecto`. Válido hasta = el mínimo entre hoy + días y el fin de la oferta más próxima de sus prendas |
| `version` | número | |

## `temporada_fotos`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `tfo` | |
| `temporada_id` | id `tem` | |
| `orden` | número | orden del scroll |
| `foto` | texto | id de Drive |
| `tipo` | texto | `producto` o `ambiente` |
| `productos` | lista | ids de las prendas que aparecen |
| `texto` | texto | pie de foto |
| `texto_alt` | texto | vacío = se arma con las prendas |
| `destacada` | booleano | página completa en la revista |
| `version` | número | |

## `paletas`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | texto | slug (predefinidas) o `pal_<8 hex>` (propias) |
| `nombre` | texto | |
| `temporada` | texto | |
| `uso` | texto | meses sugeridos |
| `tokens` | json | los 16 tokens de [tokens-diseno.md](tokens-diseno.md) |
| `fuente_titulos` | texto | familia de Google Fonts |
| `fuente_texto` | texto | familia de Google Fonts |
| `radio` | texto | `12px` |
| `origen` | texto | `predefinida` o `propia` |
| `version` | número | |

## `vendedoras`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `ven` | |
| `nombre` | texto | |
| `whatsapp` | texto | solo dígitos, con código de país (`51987654321`) |
| `activa` | booleano | |
| `por_defecto` | booleano | exactamente una activa con TRUE |
| `version` | número | |

## `textos`

| Columna | Tipo | Regla |
|---|---|---|
| `clave` | texto | `pagina.componente.elemento` (ver `content/textos.json`). Las plantillas de WhatsApp son `whatsapp.producto`, `whatsapp.lista` y `whatsapp.revista` |
| `valor` | texto | |
| `version` | número | |

## `config`

| Columna | Tipo | Regla |
|---|---|---|
| `clave` | texto | ver la lista |
| `valor` | texto | |

Claves y valor por defecto:

| Clave | Valor por defecto |
|---|---|
| `tienda_nombre` | — |
| `tienda_eslogan` | — |
| `logo` | — |
| `moneda_simbolo` | `S/` |
| `moneda_codigo` | `PEN` |
| `pais_codigo` | `51` |
| `zona_horaria` | `America/Lima` |
| `redondeo` | `ninguno` (otras opciones: `entero`, `90`) |
| `inicio_modo` | `temporada` (otra opción: `secciones`) |
| `instagram` | — |
| `facebook` | — |
| `tiktok` | — |
| `horario` | — |
| `envios` | — |
| `sitio_url` | `https://cayogabriel.github.io/catalogo-ropa/` |
| `github_repo` | `cayogabriel/catalogo-ropa` |
| `paleta_defecto` | `neutra-minimal` |
| `umbral_ultimas_unidades` | `3` |
| `dias_nuevo` | `30` |
| `min_clics_mas_consultados` | `3` |
| `vigencia_dias_defecto` | `15` |

Los secretos no van aquí: el token de GitHub vive en las propiedades del script (`CR_GITHUB_TOKEN`).

## `eventos`

La API pública agrega una fila por evento.

| Columna | Tipo | Regla |
|---|---|---|
| `fecha` | fecha-hora | |
| `tipo` | texto | `vista`, `whatsapp`, `favorito`, `compartir` o `revista_descarga` |
| `producto_id` | texto | id `prd` o vacío |
| `temporada_id` | texto | id `tem` o vacío |
| `origen` | texto | `web`, `revista_web`, `pdf` o `catalogo_pdf` |
| `pagina` | texto | ruta, ≤ 200 |
| `sesion` | texto | id anónimo por pestaña, sin datos personales |

## `estadisticas_diarias`

El Panel la consolida cada madrugada a partir de `eventos`.

| Columna | Tipo | Regla |
|---|---|---|
| `fecha` | texto | `AAAA-MM-DD` |
| `producto_id` | texto | id `prd` o vacío (totales de la tienda) |
| `origen` | texto | como en `eventos` |
| `vistas` | número | |
| `whatsapp` | número | |
| `favoritos` | número | |
| `compartidos` | número | |
| `descargas` | número | |

## `historial`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | id `his` | |
| `fecha` | fecha-hora | |
| `usuario` | texto | correo de la sesión |
| `entidad` | texto | nombre de la pestaña |
| `entidad_id` | texto | |
| `campo` | texto | vacío si la acción es crear o eliminar |
| `antes` | texto | JSON del valor anterior |
| `despues` | texto | JSON del valor nuevo |
| `accion` | texto | `crear`, `editar`, `eliminar`, `reordenar` o `deshacer` |
