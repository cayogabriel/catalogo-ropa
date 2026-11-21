// «Mi lista» (favoritos) en localStorage. Contrato: datos-web.md, regla 10.
// Todo acceso va en try/catch: si el almacén está bloqueado, la lista vive en memoria.
export const CLAVE_LISTA = 'catalogo-ropa:lista';

const texto = (v) => (typeof v === 'string' && v !== '' ? v : null);

const normalizar = (datos) =>
  Array.isArray(datos)
    ? datos
        .filter((i) => i && typeof i === 'object' && typeof i.codigo === 'string' && i.codigo)
        .map((i) => ({ codigo: i.codigo, talla: texto(i.talla), color: texto(i.color) }))
    : [];

export function crearLista(almacen) {
  let memoria = null;

  const leer = () => {
    if (memoria) return memoria.map((i) => ({ ...i }));
    try {
      const crudo = almacen?.getItem(CLAVE_LISTA);
      return crudo ? normalizar(JSON.parse(crudo)) : [];
    } catch {
      return [];
    }
  };

  const guardar = (items) => {
    const limpios = normalizar(items);
    try {
      if (!almacen) throw new Error('sin almacén');
      almacen.setItem(CLAVE_LISTA, JSON.stringify(limpios));
      memoria = null;
    } catch {
      memoria = limpios;
    }
    return limpios;
  };

  const contiene = (codigo) => leer().some((i) => i.codigo === codigo);

  return {
    leer,
    guardar,
    contiene,
    agregar: ({ codigo, talla = null, color = null }) => {
      const items = leer().filter((i) => i.codigo !== codigo);
      const previo = leer().findIndex((i) => i.codigo === codigo);
      const nuevo = { codigo, talla, color };
      if (previo >= 0) items.splice(previo, 0, nuevo);
      else items.push(nuevo);
      return guardar(items);
    },
    actualizar: (codigo, cambios) => guardar(leer().map((i) => (i.codigo === codigo ? { ...i, ...cambios } : i))),
    quitar: (codigo) => guardar(leer().filter((i) => i.codigo !== codigo)),
    vaciar: () => guardar([]),
  };
}
