// Lo que la interfaz del Panel (S4) le manda al servidor (S2): cada pantalla guarda campo por campo,
// así que el servidor tiene que aceptar filas a medias mientras se llenan. Lo completo se exige al publicar.
// Reproduce el error de integración «no puedo agregar un número de WhatsApp».
import { describe, test, expect } from 'vitest';
import { panelInstalado } from './ayudas.mjs';

// Lo que manda la pantalla «Vendedoras y WhatsApp» al pulsar «Agregar vendedora».
const nuevaDesdeLaPantalla = (primera) => ({ nombre: '', whatsapp: '', activa: true, por_defecto: primera });

describe('vendedoras: como las crea y llena la pantalla «Vendedoras y WhatsApp»', () => {
  test('la primera se crea vacía, activa y por defecto', () => {
    const { ctx } = panelInstalado();
    const v = ctx.crear('vendedoras', nuevaDesdeLaPantalla(true));
    expect(v).toMatchObject({ nombre: '', whatsapp: '', activa: true, por_defecto: true });
  });

  test('se llena campo por campo y en cualquier orden: primero el número, después el nombre', () => {
    const { ctx } = panelInstalado();
    const v = ctx.crear('vendedoras', nuevaDesdeLaPantalla(true));
    const r1 = ctx.guardarCampo('vendedoras', v.id, 'whatsapp', '51900000001', v.version);
    const r2 = ctx.guardarCampo('vendedoras', v.id, 'nombre', 'Ana', r1.version);
    expect(r2.fila).toMatchObject({ nombre: 'Ana', whatsapp: '51900000001', activa: true, por_defecto: true });
  });

  test('una segunda se crea vacía y activa sin quitarle el «por defecto» a la primera', () => {
    const { ctx } = panelInstalado();
    const ana = ctx.crear('vendedoras', { nombre: 'Ana', whatsapp: '51900000001', activa: true, por_defecto: true });
    const otra = ctx.crear('vendedoras', nuevaDesdeLaPantalla(false));
    expect(otra).toMatchObject({ activa: true, por_defecto: false });
    expect(ctx.listar('vendedoras').filas.find((v) => v.id === ana.id).por_defecto).toBe(true);
  });

  test('el número sigue teniendo que ser solo dígitos con código de país', () => {
    const { ctx } = panelInstalado();
    const v = ctx.crear('vendedoras', nuevaDesdeLaPantalla(true));
    expect(() => ctx.guardarCampo('vendedoras', v.id, 'whatsapp', '+51 900', v.version)).toThrow(/^invalido/);
  });
});
