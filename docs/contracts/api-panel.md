# API del Panel (`google.script.run`)

**Quién la usa:** la implementa S2 en `apps-script/panel/src/server/` y la llama la interfaz de S4.

**Reglas que valen para todas las funciones:**
- Empiezan con `requireAdmin_()`.
- Devuelven objetos JSON simples: sin `Date` (fechas como texto ISO) y sin `undefined`.
- Los helpers privados terminan en `_` y no se pueden llamar desde el navegador.

**Filas:** una *Fila* es un objeto con las columnas de [modelo-datos.md](modelo-datos.md), ya convertidas. Los booleanos llegan como `true`/`false`, las listas como arreglos, las fechas como ISO o `null`, los números como número o `null`, y `paletas.tokens` como objeto.

**Errores:** se lanzan como `Error('<codigo>: <detalle legible>')`, y la interfaz los recibe en `withFailureHandler`. Códigos:

| Código | Significa |
|---|---|
| `no_autorizado` | la persona no es la dueña |
| `no_encontrado` | no existe |
| `conflicto` | la `version` cambió mientras se editaba |
| `invalido` | un dato no cumple la regla |
| `limite` | se pasó un tamaño o una cantidad máxima |
| `github` | falló la conexión con GitHub |
| `sin_token` | falta el token de GitHub |

**Entidades editables** (`entidad`): `productos`, `categorias`, `secciones`, `portadas`, `ofertas`, `temporadas`, `temporada_fotos`, `paletas` y `vendedoras`.

## Arranque

| Función | Recibe | Devuelve |
|---|---|---|
| `obtenerEstadoInicial()` | — | `{ usuario, config: {clave: valor}, textos: {clave: valor}, conteos: {[entidad]: n}, publicacion: EstadoPublicacion, cambios_sin_publicar: boolean, sitio_url }` |
| `instalar()` | — | `{ hojaId, hojaUrl, carpetaRaizId, nueva }`. Se puede repetir sin miedo: completa lo que falte |
| `autorizar()` | — | `'ok'`. Solo sirve para que Google pida los permisos |

## Edición (autoguardado)

| Función | Recibe | Devuelve |
|---|---|---|
| `listar(entidad, opciones?)` | `opciones = { filtro?: {campo: valor}, incluir_archivados?: false }` | `{ filas: Fila[], leido_en }` |
| `crear(entidad, datos)` | campos iniciales | `Fila`, con `id`, `version: 1` y fechas. En `productos` además genera `codigo` y pone `estado: 'borrador'` |
| `guardarCampo(entidad, id, campo, valor, version)` | `version` que tenía la interfaz | `{ fila, version }`. Lanza `conflicto` si la versión de la hoja es otra |
| `guardarCampos(entidad, id, cambios, version)` | `cambios = {campo: valor}` | `{ fila, version }` |
| `eliminar(entidad, id)` | — | `{ ok: true, archivado }`: los productos pasan a `archivado`; el resto se borra. Siempre deja registro en el historial |
| `reordenar(entidad, ids)` | ids en el nuevo orden (en `temporada_fotos`, los de una temporada) | `{ ok: true }` |
| `duplicarProducto(id)` | — | `Fila` nueva, en borrador, con código nuevo y las mismas fotos |
| `historial(opciones?)` | `{ entidad?, id?, limite?: 50 }` | `Cambio[]` (filas de `historial`, de la más reciente a la más vieja) |
| `deshacer(historialId)` | — | `{ fila }`. Revierte ese cambio y registra `deshacer` |

## Fotos

| Función | Recibe | Devuelve |
|---|---|---|
| `subirFoto(archivo)` | `{ nombre, mime: 'image/jpeg'\|'image/png'\|'image/webp', base64, destino: 'producto'\|'temporada'\|'portada'\|'marca', temporada_id? }`, ≤ 8 MB ya decodificado | `{ id, nombre, miniatura }`. `miniatura` es un data URL de unos 320 px |
| `miniaturas(ids)` | hasta 40 ids | `{ [id]: dataUrl }` |
| `biblioteca(opciones?)` | `{ carpeta?: 'fotos'\|'temporadas'\|'portadas'\|'marca', pagina?: 1 }` | `{ fotos: [{ id, nombre, carpeta, actualizado, usos: [{ entidad, id, etiqueta }] }], pagina, total }` |
| `altaRapida(fotoIds, opciones)` | `{ categoria_id }` | `Fila[]`: un producto en borrador por foto |

Las fotos se guardan en la carpeta de Drive que corresponde al destino, con el código del producto o el slug de la temporada en el nombre, y quedan privadas.

## Precios, textos y configuración

| Función | Recibe | Devuelve |
|---|---|---|
| `vistaPreviaPrecios(opciones)` | `{ producto_id, oferta?: datosDeOfertaSinGuardar }` | `{ regular, ventanas: Ventana[] }`, con la forma de `catalog.schema.json` |
| `validarPaleta(tokens)` | objeto con los 16 tokens | `{ ok, faltantes, fallos: [{a, b, min, valor}] }`, con las mismas reglas que `revisarPaleta` |
| `guardarTexto(clave, valor)` | — | `{ clave, valor }` |
| `guardarConfig(clave, valor)` | clave de [modelo-datos.md](modelo-datos.md#config) | `{ clave, valor }` |
| `guardarTokenGithub(token)` | — | `{ ok: true, repo }`. Lo valida contra `GET /repos/{github_repo}` y lo guarda en `CR_GITHUB_TOKEN`. **Nunca** lo devuelve |
| `estadoTokenGithub()` | — | `{ configurado: boolean, repo }` |

## Publicación, estadísticas y documentos

| Función | Recibe | Devuelve |
|---|---|---|
| `publicar()` | — | `EstadoPublicacion`. Pasos: 1) arma la copia, 2) la valida, 3) la guarda en `Publicado/catalogo-publicado.json`, 4) actualiza `publicado_id` en el puntero, 5) envía `repository_dispatch` (`event_type: 'publicar'`) a GitHub |
| `estadoPublicacion()` | — | `EstadoPublicacion` = `{ estado: 'nunca'\|'en_cola'\|'publicando'\|'publicado'\|'error', iniciado_en, terminado_en, url_ejecucion, mensaje, documentos_guardados }` |
| `resumen(opciones)` | `{ dias: 7\|30 }` | `{ totales: {vistas, whatsapp, favoritos, compartidos, descargas}, por_producto: [{ producto_id, codigo, nombre, …totales }], por_origen: {[origen]: totales} }` |
| `documentos()` | — | `{ revistas: [{ temporada_id, nombre, pdf: {url, actualizado}, carrusel: {url, cantidad} }], catalogo: {url, actualizado} \| null, reportes: [{ mes, url }] }` |

**Activadores programados** (los instala `instalar()`; no se llaman desde la interfaz):
- `diario_()`: entre 00:00 y 01:00 consolida los eventos en `estadisticas_diarias` y vuelve a publicar.
- `guardarDocumentos_()`: al terminar cada publicación, copia a Drive lo que lista `documentos.json`.
- `reporteMensual_()`: el día 1 de cada mes.
