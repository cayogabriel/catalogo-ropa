# API pública (Apps Script #2)

- **Despliegue:** «ejecutar como yo», acceso «cualquiera».
- **URL:** la `/exec` del despliegue, guardada en la variable del repo `CATALOG_API_URL`.
- **Qué contiene:** el proyecto **no tiene funciones que modifiquen datos**, salvo agregar eventos.

## Formato de respuesta

Todas las rutas devuelven JSON con un sobre:

```json
{ "ok": true, "datos": { } }
{ "ok": false, "error": "codigo" }
```

Apps Script responde siempre con HTTP 200, así que el éxito se lee en `ok`. Antes de entregar la respuesta redirige (302) a `script.googleusercontent.com`. `fetch` sigue esa redirección solo.

## Rutas

| Ruta | Respuesta |
|---|---|
| `GET ?r=catalogo` | `datos` = la copia publicada, tal cual se guardó; cumple `catalog.schema.json` |
| `GET ?r=foto&id=<id de Drive>` | `datos = { mime, base64 }`, **solo si** el id está en `fotos` de la copia publicada **y** el archivo es una imagen (`image/jpeg`, `image/png` o `image/webp`). Los bytes se entregan tal como están guardados: por eso el Panel solo guarda imágenes re-codificadas, sin EXIF ni GPS (ver `subirFoto` en [api-panel.md](api-panel.md)) |
| `POST` (cuerpo `text/plain` con JSON) | registra un evento (abajo) y responde `{ ok: true }` |

## Errores

| Código | Cuándo |
|---|---|
| `sin_instalacion` | no se encontró el puntero `catalogo-ropa.config.json` (todavía no se corrió `instalar()`) |
| `sin_publicacion` | el puntero no tiene `publicado_id` o ese archivo no existe |
| `foto_no_publicada` | el id no está en la copia publicada. En ese caso **no se abre** el archivo de Drive |
| `foto_no_disponible` | el id está publicado, pero el archivo ya no existe en Drive (se borró o está en la papelera) o no es una imagen. El workflow falla y nombra la foto y el producto |
| `foto_muy_grande` | la foto pesa más de 8 MB |
| `ruta_desconocida` | falta `r` o tiene otro valor |
| `evento_invalido` | el cuerpo del POST no cumple el formato |

## Cómo encuentra sus datos

Busca en Drive el archivo `catalogo-ropa.config.json`, que escribe `instalar()`:

```json
{ "version": 1, "hoja_id": "…", "carpetas": { "raiz": "…", "fotos": "…", "…": "…" }, "publicado_id": null }
```

- **Solo cuenta un puntero propio y fuera de la papelera.** Se busca con `DriveApp.searchFiles('title = "catalogo-ropa.config.json" and "me" in owners and trashed = false')`. Un archivo con el mismo nombre compartido por otra cuenta nunca cambia lo que sirve la API.
- Si hay varios, usa el modificado más recientemente.
- **`?r=catalogo` lo vuelve a buscar en cada llamada** (es una por publicación), así una reinstalación se nota enseguida. **`?r=foto` usa el id ya guardado** en la propiedad `CR_PUNTERO_ID`, y solo vuelve a buscar si ese id deja de servir.
- No hay ids escritos en el código.

## Eventos (`POST`)

Cuerpo:

```json
{ "t": "whatsapp", "p": "prd_1a2b3c4d", "s": null, "o": "web", "pg": "/p/ves-014/", "ss": "a1b2c3d4" }
```

| Campo | Valores |
|---|---|
| `t` | `vista`, `whatsapp`, `favorito`, `compartir` o `revista_descarga` |
| `p` | id `prd` o `null` |
| `s` | id `tem` o `null` |
| `o` | `web`, `revista_web`, `pdf` o `catalogo_pdf` |
| `pg` | ruta que cumple `^/[A-Za-z0-9/_.?=&%-]{0,199}$`. Así nunca empieza con `=`, y además la columna tiene formato de texto: nada se vuelve fórmula |
| `ss` | 8 a 32 caracteres `[a-z0-9]`, aleatorio por pestaña del navegador |

- **Límite:** 120 eventos por minuto en total. Lo que pase el límite se descarta en silencio y la respuesta es `{ ok: true, descartado: true }`.
- **Privacidad:** no se guarda IP, correo, nombre ni nada que identifique a la clienta.
- **Desde el navegador:** se envía con `navigator.sendBeacon(CATALOG_API_URL, JSON.stringify(evento))`. Un string viaja como `text/plain`, así que no hay *preflight* de CORS.
