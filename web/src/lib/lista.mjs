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

// Cruza lo guardado con el catálogo actual: descarta códigos que ya no existen y
// limpia tallas agotadas o colores que ya no están. Un solo color se completa solo.
export function resolverLista(guardados, productos) {
  const porCodigo = new Map(productos.map((p) => [p.codigo, p]));
  return guardados.flatMap(({ codigo, talla, color }) => {
    const producto = porCodigo.get(codigo);
    if (!producto) return [];
    const tallaOk = talla && producto.tallas.includes(talla) && !producto.tallas_agotadas.includes(talla) ? talla : null;
    const colorOk = color && producto.colores.includes(color) ? color : producto.colores.length === 1 ? producto.colores[0] : null;
    return [{ producto, talla: tallaOk, color: colorOk, agotado: producto.estado === 'agotado' }];
  });
}

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
