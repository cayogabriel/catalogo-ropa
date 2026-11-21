// google.script.run falso: cada llamada es un fetch a /__gas/<función> del simulador.
// Imita la API de Google: withSuccessHandler, withFailureHandler, withUserObject y cualquier función por nombre.
(function () {
  function crear(ok, fallo, usuario) {
    return new Proxy(
      {},
      {
        get(_, nombre) {
          if (nombre === 'withSuccessHandler') return (f) => crear(f, fallo, usuario);
          if (nombre === 'withFailureHandler') return (f) => crear(ok, f, usuario);
          if (nombre === 'withUserObject') return (o) => crear(ok, fallo, o);
          if (typeof nombre !== 'string') return undefined;
          return (...args) => {
            fetch('/__gas/' + nombre, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ args }),
            })
              .then((r) => r.json())
              .then((r) => {
                if (r.ok) {
                  if (ok) ok(r.valor, usuario);
                } else if (fallo) {
                  fallo(new Error(r.mensaje), usuario);
                } else {
                  console.error('[google.script.run]', r.mensaje);
                }
              })
              .catch((e) => {
                if (fallo) fallo(new Error(e && e.message ? e.message : 'Failed to fetch'), usuario);
              });
          };
        },
      },
    );
  }
  window.google = { script: { run: crear(null, null, undefined), host: { close() {}, setHeight() {}, setWidth() {} } } };
})();
