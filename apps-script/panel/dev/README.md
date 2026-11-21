# Simulador del Panel

Sirve la interfaz de `../src/ui/` sin Google: resuelve los `include`, inyecta un `google.script.run` falso y ejecuta un servidor en memoria con **todas** las funciones de `docs/contracts/api-panel.md`, con los datos de `fixtures/catalogo.ejemplo.json`.

```powershell
node apps-script/panel/dev/servidor.mjs 5173
```

Abre `http://127.0.0.1:5173`. Los datos viven en memoria: al reiniciar el simulador, o con «Reiniciar datos» de la barra, vuelven al ejemplo.

La barra «Simulador» (arriba a la derecha) programa fallas para la próxima llamada: `conflicto`, `limite`, `no_autorizado`, `invalido`; también demora de 2 s, corte de conexión y publicación fallida.

| Archivo | Qué hace |
|---|---|
| `servidor.mjs` | servidor HTTP y arranque |
| `plantilla.mjs` | arma la página (`include` + inyección del simulador) |
| `gas-falso.mjs` | el servidor falso (contrato completo, historial, versiones, fallas) |
| `datos-semilla.mjs` | convierte el catálogo de ejemplo en filas del modelo de datos |
| `fotos-sim.mjs`, `precios-sim.mjs` | miniaturas, regla de EXIF y precios simplificados |
| `cargar-parcial.mjs` | ayuda de pruebas: ejecuta el JS de un parcial `.html` en Node |

Es un doble: las reglas finas (precios con redondeo, ofertas que se pisan, límites reales) son las del servidor de S2, no las de este archivo.
