# Documentos generados (revista, catálogo PDF, carrusel)

Los genera el workflow `publicar.yml` (S6) en cada publicación, con Playwright/Chromium, a partir de páginas de impresión del propio sitio. El Panel (S2) copia a Drive lo que lista el manifiesto.

## En el sitio

| Documento | Ruta | Formato |
|---|---|---|
| Revista PDF de cada temporada con `revista: true` | `temporada/<slug>/revista-<slug>.pdf` | páginas de 1080 × 1350 px, enlaces que se pueden tocar, ≤ 10 MB |
| Imágenes de carrusel | `temporada/<slug>/carrusel/<slug>-01.jpg`, `-02.jpg`, … | una por página de la revista; JPG de 1080 × 1350, ≤ 600 KB cada una |
| Catálogo PDF | `catalogo/catalogo.pdf` | 1080 × 1350, 4 prendas por página, ≤ 10 MB |
| Manifiesto | `documentos.json` | ver abajo |

## Contenido de la revista

- **Portada:** `foto_portada`, `titulo`, `subtitulo` y logo.
- **Páginas editoriales:** una por foto con `destacada: true` (a página completa), o dos fotos por página.
- **Páginas de prendas:** foto, nombre, precio antes/ahora y botón «Pedir por WhatsApp».
- **Contraportada:** texto `cierre`, contactos y botones de redes, la URL de la temporada y un QR que lleva a ella.
- **Pie de cada página:** `revista.precios_validos_hasta` con `vigencia_hasta` en formato `dd/mm`, que va en la variable `{fecha}`.

## Manifiesto `documentos.json`

```json
{
  "generado_en": "2026-12-01T00:20:00-05:00",
  "revistas": [
    { "temporada_id": "tem_…", "slug": "verano-2027", "pdf": "temporada/verano-2027/revista-verano-2027.pdf", "paginas": 14, "bytes": 5123456,
      "carrusel": ["temporada/verano-2027/carrusel/verano-2027-01.jpg"] }
  ],
  "catalogo": { "pdf": "catalogo/catalogo.pdf", "paginas": 6, "bytes": 2345678 }
}
```

## Botones que cuentan el clic (`ir/`)

Los botones del PDF no van directo a WhatsApp: pasan por una página estática del sitio que registra el evento y redirige enseguida.

| Página | Qué hace |
|---|---|
| `ir/<código en minúsculas>/?o=pdf` (o `?o=catalogo_pdf`) | envía el evento `whatsapp` con ese origen y abre `wa.me`, con la plantilla `whatsapp.revista` |
| `ir/red/<instagram\|facebook\|tiktok>/?o=pdf` | abre el perfil o el chat |
| `ir/temporada/<slug>/?o=pdf` | lleva a la revista web |

Cada página tiene un `<meta http-equiv="refresh">` de respaldo, para que la redirección funcione aunque JavaScript esté apagado.

## Copias en Drive (las hace el Panel)

Cuando la publicación termina, `guardarDocumentos_()` lee `documentos.json` y descarga cada archivo desde el sitio:

| En el sitio | En Drive |
|---|---|
| revista | `Documentos/Revistas/<nombre de la temporada>/revista-<slug>.pdf` |
| carrusel | `Documentos/Revistas/<nombre de la temporada>/carrusel/` |
| catálogo | `Documentos/Catálogos/catalogo.pdf` |

Se guarda solo la última versión: el archivo anterior va a la papelera.

El reporte de consultas no pasa por el workflow. Lo arma el Panel en `Documentos/Reportes/Reporte de consultas`, una hoja de cálculo con una pestaña `AAAA-MM` por mes.
