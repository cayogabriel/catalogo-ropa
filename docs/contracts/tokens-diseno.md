# Tokens de diseño

Cada paleta define exactamente estos 16 tokens (colores en `#RRGGBB`), más dos fuentes de Google Fonts y un radio. La lista ejecutable es `TOKENS`, en `@catalogo/contratos`.

| Token | Para qué se usa |
|---|---|
| `--color-fondo` | fondo de la página |
| `--color-superficie` | tarjetas, hojas inferiores, cajones |
| `--color-texto` | texto principal |
| `--color-texto-suave` | texto secundario (debe seguir siendo legible) |
| `--color-borde` | separadores decorativos |
| `--color-control` | bordes de campos y controles (contraste no textual de WCAG) |
| `--color-primario` | botones principales y enlaces |
| `--color-sobre-primario` | texto sobre `primario` |
| `--color-acento` | detalles de marca y chips |
| `--color-sobre-acento` | texto sobre `acento` |
| `--color-oferta` | insignias de descuento y precio en oferta |
| `--color-sobre-oferta` | texto sobre `oferta` |
| `--color-liquidacion` | sección e insignias de liquidación |
| `--color-sobre-liquidacion` | texto sobre `liquidacion` |
| `--color-exito` | confirmaciones («Agregado a tu lista») |
| `--color-foco` | anillo de foco del teclado |

## Contraste mínimo

La lista ejecutable es `PARES_CONTRASTE`.

| Primer color | Sobre | Mínimo |
|---|---|---|
| `texto` | `fondo` | 4.5:1 |
| `texto-suave` | `fondo` | 4.5:1 |
| `texto` | `superficie` | 4.5:1 |
| `texto-suave` | `superficie` | 4.5:1 |
| `sobre-primario` | `primario` | 4.5:1 |
| `sobre-acento` | `acento` | 4.5:1 |
| `sobre-oferta` | `oferta` | 4.5:1 |
| `sobre-liquidacion` | `liquidacion` | 4.5:1 |
| `control` | `fondo` | 3:1 |
| `foco` | `fondo` | 3:1 |
| `primario` | `fondo` | 3:1 |

La fórmula es la de WCAG 2.1: luminancia relativa con canales sRGB linealizados, y contraste = (L1 + 0.05) / (L2 + 0.05).

- **En Node:** `revisarPaleta(tokens)` devuelve los pares que fallan.
- **En el Panel:** `validarPaleta(tokens)` aplica las mismas reglas, en GAS.
- **Al guardar:** el Panel no deja guardar una paleta propia que falle. La web y el workflow confían en esa validación, pero vuelven a revisar al construir y avisan.

## Fuentes y radio

- **Fuentes:** `fuentes.titulos` y `fuentes.texto` son familias de Google Fonts. Se cargan con `display=swap`, con un máximo de 2 familias y 2 pesos por familia.
- **Radio:** `radio` (por ejemplo `16px`) es el redondeo base de tarjetas y botones.
- **Paletas predefinidas:** vienen en `content/paletas.json`, de S5. Su `id` es un slug, por ejemplo `verano-costa`.
