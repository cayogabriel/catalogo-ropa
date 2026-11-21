# Datos de la web (`web/src/data/catalogo.json`)

El script `web/scripts/publicar.mjs` (de S6) lo escribe antes de `astro build`. Contiene la copia publicada **tal cual**, más un mapa `imagenes` con las fotos ya procesadas:

```json
{
  "...": "todas las claves de catalog.schema.json",
  "imagenes": {
    "<id de foto>": {
      "ancho": 1200,
      "alto": 1500,
      "lqip": "data:image/webp;base64,…",
      "webp": { "480": "img/<id>-480.webp", "960": "img/<id>-960.webp" },
      "og": "img/og/<id>.jpg"
    }
  }
}
```

**Las imágenes:**
- `webp` tiene solo los anchos de 480, 960 y 1440 px que no superan el original. Nunca se agranda una foto.
- Si el original mide menos de 480 px, hay una sola entrada, con su ancho real.
- `og` es un JPG de 1200 px de ancho (o menos, si el original es más chico) que pesa como máximo 300 KB.
- Las rutas son relativas a la base del sitio: no empiezan con `/`. En Astro se arman con `import.meta.env.BASE_URL`.

## Rutas del sitio

| Página | Ruta |
|---|---|
| Inicio | `/` (base `/catalogo-ropa/` en GitHub Pages) |
| Producto | `p/<código en minúsculas>/` (`VES-014` → `p/ves-014/`) |
| Temporada | `temporada/<slug>/` |
| Catálogo | `catalogo/`, con filtros por parámetros: `?categoria=<slug>`, `?talla=M`, `?oferta=1` |
| Mi lista | `lista/` |
| Redirección que cuenta el clic | `ir/…` (ver [documentos.md](documentos.md)) |

## Reglas que aplica la web

Las reglas 1, 6, 7 y 9 ya están implementadas y probadas en `web/src/compartido/`:

| Archivo | Qué trae |
|---|---|
| `precio.mjs` | `ventanaVigente`, `precioVigente`, `formatearMonto`, `formatearFecha` |
| `mensajes.mjs` | `interpolar`, `vendedoraPara`, `mensajeProducto`, `mensajeLista`, `mensajeRevista` |
| `enlaces.mjs` | `rutaProducto`, `rutaTemporada`, `urlProducto`, `urlTemporada`, `enlaceWhatsApp`, `urlRed` |

S3 y S6 las importan y no las reescriben.

1. **Precio vigente:**
   - es la ventana con `desde ≤ ahora < hasta`, donde `null` significa sin límite;
   - el HTML sale con la ventana vigente al momento de construir el sitio;
   - un JS pequeño la vuelve a elegir al cargar la página, para que una oferta empiece o termine a su hora.
2. **Secciones `ofertas` y `liquidacion`:**
   - `productos` son las candidatas;
   - se muestran solo las que tienen ventana vigente con `oferta_id` (y `liquidacion: true` para la sección de liquidación);
   - si no queda ninguna, la sección se oculta.
3. **Cuenta regresiva:** solo si la ventana vigente tiene `cuenta_regresiva: true` y `hasta` no es `null`.
4. **Insignias:**
   - `nuevo` → Nuevo;
   - descuento → `etiqueta` o `-NN%`;
   - `liquidacion` → Liquidación;
   - `ultimas_unidades` → Últimas unidades;
   - `popularidad` de 1 a 3 → Más consultado.

   Ninguna se inventa.
5. **Tema:** la temporada activa usa los tokens de `paletas[tema_paleta_id]`; cada página de temporada usa los de su propia paleta. Los tokens se escriben en `:root` dentro del HTML, para que no haya un parpadeo de colores al cargar.
6. **WhatsApp:**
   - el enlace es `https://wa.me/<whatsapp>?text=<encodeURIComponent(mensaje)>`;
   - el número es el de la vendedora del producto o, si no tiene, el de la vendedora por defecto;
   - el mensaje sale de `textos['whatsapp.producto']`, `textos['whatsapp.lista']` o `textos['whatsapp.revista']`, reemplazando `{vendedora}`, `{producto}`, `{codigo}`, `{talla}`, `{color}`, `{precio}`, `{enlace}`, `{lista}` y `{total}`;
   - si una variable queda vacía (por ejemplo, no se eligió talla), se elimina **la línea completa** que la contiene antes de reemplazar;
   - si falta una plantilla, se usa: `Hola, me interesa {producto} ({codigo}). {enlace}`.
7. **Otras redes:** se arman con el usuario guardado en `tienda.redes`.

   | Red | Enlace |
   |---|---|
   | Instagram (chat) | `https://ig.me/m/<usuario>` |
   | Instagram (perfil) | `https://instagram.com/<usuario>` |
   | Facebook (chat) | `https://m.me/<usuario>` |
   | TikTok (perfil) | `https://www.tiktok.com/@<usuario>` |

   Si una red es `null`, su botón no se muestra.
8. **Eventos:** se envían a `import.meta.env.PUBLIC_API_URL` (la misma URL que `CATALOG_API_URL`) con el formato de [api-publica.md](api-publica.md). Si la variable falta, los eventos no se envían.
9. **Variables en los textos:** los textos de `textos` pueden traer estas variables, que la web reemplaza.

   | Variable | Se reemplaza por |
   |---|---|
   | `{tienda}` | `tienda.nombre` |
   | `{fecha}` | `dd/mm` |
   | `{monto}` | `S/ 59` o `S/ 59.90`; los decimales solo si los hay |
   | `{porcentaje}` | número sin `%` |
   | `{cantidad}` | número |
   | `{codigo}` | código del producto |
   | `{anio}` | año, `aaaa` |
   | `{producto}` | nombre del producto |

   Las claves que empiezan con `_` son notas y no se muestran.
10. **Favoritos:**
   - se guardan en `localStorage` con la clave `catalogo-ropa:lista`, como un arreglo de `{ codigo, talla, color }`;
   - todo acceso va dentro de `try/catch`;
   - si `localStorage` está bloqueado, la lista solo dura mientras la pestaña está abierta.
