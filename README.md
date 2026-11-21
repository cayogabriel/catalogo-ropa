# Catálogo de ropa

Catálogo web para vender ropa por WhatsApp. Lo usan dos personas: las clientas, que miran las prendas y escriben con un mensaje ya armado, y la administradora, que maneja precios, ofertas, temporadas y colores desde un panel privado.

## Cómo funciona

| Parte | Dónde vive | Quién la usa |
|---|---|---|
| **Web pública** | GitHub Pages: <https://cayogabriel.github.io/catalogo-ropa/> | las clientas |
| **Panel** | Google Apps Script. El enlace es privado: solo abre con la cuenta Google de la dueña | la administradora |
| **Datos** | Google Sheets «Catálogo Ropa — Base de datos» y la carpeta «Catálogo Ropa» de Drive | el Panel |

Los cambios del Panel se guardan al instante, pero salen a la web solo al pulsar **Publicar**. GitHub tarda unos minutos en actualizar el sitio.

## En tu Drive (`Catálogo Ropa/`)

| Carpeta | Qué guarda |
|---|---|
| `Fotos/` | fotos de productos (privadas; la web usa copias optimizadas) |
| `Temporadas/` | fotos de ambiente y de modelo de cada temporada |
| `Portadas/` | portadas de la web |
| `Marca/` | logo |
| `Publicado/` | la copia del catálogo que lee la web |
| `Documentos/Revistas/` | revista PDF de cada temporada e imágenes de carrusel |
| `Documentos/Catálogos/` | catálogo PDF |
| `Documentos/Reportes/` | reporte mensual de consultas |

## Estado

En construcción, repartido en sesiones. El detalle está en [docs/superpowers/specs/](docs/superpowers/specs/2026-11-20-catalogo-ropa-design.md).

## Para desarrollar

Ver [CLAUDE.md](CLAUDE.md). Resumen:

```bash
npm install
npm test
npm run build:fixture -w web && npm run dev -w web
```
