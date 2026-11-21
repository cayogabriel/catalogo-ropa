# Contratos

Acuerdos que comparten todas las sesiones. Si una sesión necesita cambiar algo de aquí, se lo pide a la sesión coordinadora: no lo cambia por su cuenta.

| Contrato | Qué fija | Lo produce | Lo consume |
|---|---|---|---|
| [modelo-datos.md](modelo-datos.md) | Pestañas y columnas de la hoja «Catálogo Ropa — Base de datos» | S2 (`esquema.js`, `instalar()`) | S2, S4 |
| [api-panel.md](api-panel.md) | Funciones del Panel que la interfaz llama con `google.script.run` | S2 | S4 |
| [api-publica.md](api-publica.md) | Rutas de la API pública (`?r=catalogo`, `?r=foto`, eventos) | S2 (`apps-script/api`) | S6 (workflow), S3 (eventos) |
| [`contratos/catalog.schema.json`](../../contratos/catalog.schema.json) | Forma exacta de la copia publicada | S2 (`publicar()`) | S3, S6 |
| [datos-web.md](datos-web.md) | `web/src/data/catalogo.json` (copia + imágenes procesadas) y reglas de la web | S6 (`publicar.mjs`) | S3, S6 |
| [documentos.md](documentos.md) | PDFs, JPG de carrusel, páginas `/ir/` y copias en Drive | S6 | S2, S4 |
| [tokens-diseno.md](tokens-diseno.md) | Tokens de paleta y pares de contraste | S5 (`content/paletas.json`) | S3, S4, S6 |

## Validadores ejecutables

El paquete `@catalogo/contratos` (carpeta `contratos/`) es la versión que se puede ejecutar de estos contratos:

```js
import { validarCatalogo, TOKENS, PARES_CONTRASTE, contraste, revisarPaleta } from '@catalogo/contratos';

validarCatalogo(json); // → { ok, errores[] }: esquema + referencias + lista blanca de fotos + ventanas de precio
revisarPaleta(tokens); // → { ok, faltantes[], fallos[] }
```

- S2 lo usa en sus tests para comprobar que `publicar()` arma un catálogo válido.
- S6 lo usa en el workflow para no desplegar nunca un catálogo inválido.

## Convenciones comunes

- **Ids:** `<prefijo>_<8 hex en minúscula>`. Prefijos:

  | Prefijo | Entidad |
  |---|---|
  | `prd` | productos |
  | `cat` | categorías |
  | `sec` | secciones |
  | `por` | portadas |
  | `ofe` | ofertas |
  | `tem` | temporadas |
  | `tfo` | fotos de temporada |
  | `pal` | paletas propias |
  | `ven` | vendedoras |
  | `his` | historial |

  Las paletas predefinidas usan su slug (`verano-costa`).
- **Fechas en JSON:** ISO 8601 con desfase de Lima (`2026-12-05T00:00:00-05:00`). `null` = sin límite.
- **Dinero:** número en la moneda de la tienda (S/), con decimales si los tiene. El redondeo lo aplica el Panel al publicar.
- **Fotos:** se identifican por su id de archivo de Drive. En la web nunca se usan enlaces de Drive: solo las copias que genera el workflow.
