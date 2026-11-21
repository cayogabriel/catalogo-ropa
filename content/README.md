# content/ — Marketing y contenido (S5)

Contenido que consumen la web (S3), el panel (S4) y la revista (S6). Se carga como datos iniciales en la hoja de Google Sheets.

| Archivo | Qué contiene | Quién lo usa |
|---|---|---|
| `marca.md` | Entrevista de marca, voz, principios de honestidad y pendientes | Todos (referencia) |
| `paletas.json` | 12 paletas con `id`, `nombre`, `temporada`, `uso` (meses), `fuentes`, `radio` y 16 `tokens` CSS | Pestaña `paletas`, web, revista, editor del panel |
| `informe-contraste.md` | Resultado WCAG 2.1 AA de cada paleta (12/12 aprobadas) | Referencia / CI |
| `scripts/verificar-contraste.mjs` | Verificador sin dependencias; regenera el informe. Sale con error si una paleta falla | `npm test` / manual |
| `textos.json` | Textos con claves `pagina.componente.elemento` (variables como `{fecha}`, `{monto}`, `{tienda}`) | Pestaña `textos`, web, revista |
| `plantillas-whatsapp.json` | Plantillas de producto, lista y «desde la revista» | Pestaña `vendedoras`/`config`, web, revista |
| `campanas.json` | Calendario comercial de Perú: fechas MM-DD, paleta sugerida, tácticas, textos de portada y revista | Panel (temporadas), web |
| `guia-marketing.md` | Tácticas honestas, dónde y cuándo usarlas | Administradora, S8 |

## Verificar

```powershell
node content/scripts/verificar-contraste.mjs
```

## Notas

- Nombre de tienda, números de WhatsApp y enlaces de redes están pendientes: se cargan en el panel (`{tienda}` en los textos).
- Fechas móviles (Madre, Padre, Cyber Wow, Black Friday): confirmar cada año.
- Las fuentes son de Google Fonts; la web debe cargar solo las de la paleta activa.
