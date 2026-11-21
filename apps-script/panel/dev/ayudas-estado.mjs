// Ayuda de pruebas: monta los stores de la interfaz sobre el servidor falso, sin Alpine ni navegador.
import { cargarParcial } from './cargar-parcial.mjs';
import { crearGasFalso } from './gas-falso.mjs';

export const MODULOS = [
  'ui/js/util', 'ui/js/servidor', 'ui/js/cola', 'ui/js/fotos', 'ui/js/miniaturas', 'ui/js/validar', 'ui/js/estado',
];

export function montarStores({ gas = crearGasFalso(), visible = true, opcionesGas } = {}) {
  const { Panel } = cargarParcial(MODULOS);
  const llamadas = [];
  const servidor = {
    llamar: (nombre, ...args) => {
      llamadas.push(nombre);
      return gas.llamar(nombre, args).catch((e) => {
        const a = Panel.servidor.analizarError(e);
        const err = new Error(a.crudo);
        err.codigo = a.codigo;
        err.detalle = a.detalle;
        err.amable = Panel.servidor.mensajeAmable(a.codigo, a.detalle);
        throw err;
      });
    },
  };
  const estado = { visible, hash: '' };
  const stores = Panel.crearStores({
    servidor,
    otro: (n) => stores[n],
    hash: { leer: () => estado.hash, escribir: (r) => (estado.hash = r) },
    visible: () => estado.visible,
    enfocar: () => {},
    preferencias: { leer: () => null, escribir: () => {} },
    intervaloSondeo: 1000,
    ...opcionesGas,
  });
  return { Panel, stores, gas, llamadas, estado, servidor };
}

export const asentar = async (n = 30) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
