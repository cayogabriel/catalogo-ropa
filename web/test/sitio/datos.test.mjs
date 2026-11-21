import { describe, expect, it } from 'vitest';
import {
  vigente,
  productoPorId,
  temporadaActiva,
  temporadasPublicadas,
  temporadasArchivo,
  portadasVigentes,
  requisitoSeccion,
  seccionesInicio,
} from '../../src/lib/datos.mjs';
import { producto, EN_OFERTA, ANTES_OFERTA, T } from './ayuda.mjs';

const temporada = (id, extra = {}) => ({ id, slug: id.replace('_', '-'), visible_en_web: false, ...extra });
const portada = (id, extra = {}) => ({ id, desde: null, hasta: null, orden: 1, temporada_id: null, ...extra });
const seccion = (id, extra = {}) => ({ id, titulo: id, subtitulo: '', tipo: 'manual', diseno: 'grilla', orden: 1, productos: [], ...extra });

const conOferta = producto({ id: 'prd_00000002', codigo: 'VES-002' }, { oferta: {} });
const conLiq = producto({ id: 'prd_00000003', codigo: 'VES-003' }, { oferta: { liquidacion: true } });
const normal = producto({ id: 'prd_00000001', categoria_id: 'cat_00000002' });

const catalogo = (extra = {}) => ({
  productos: [normal, conOferta, conLiq],
  categorias: [
    { id: 'cat_00000001', slug: 'vestidos', nombre: 'Vestidos', orden: 1, foto: null },
    { id: 'cat_00000002', slug: 'blusas', nombre: 'Blusas', orden: 2, foto: null },
  ],
  temporadas: [temporada('tem_00000001'), temporada('tem_00000002', { visible_en_web: true }), temporada('tem_00000003')],
  temporada_activa_id: 'tem_00000001',
  portadas: [],
  secciones: [],
  ...extra,
});

describe('vigente', () => {
  it('desde ≤ ahora < hasta, null sin límite', () => {
    expect(vigente({ desde: null, hasta: null }, 0)).toBe(true);
    expect(vigente({ desde: '2026-12-10T00:00:00-05:00', hasta: null }, T('2026-12-10T00:00:00-05:00'))).toBe(true);
    expect(vigente({ desde: null, hasta: '2026-12-10T00:00:00-05:00' }, T('2026-12-10T00:00:00-05:00'))).toBe(false);
  });
});

describe('productoPorId', () => {
  it('encuentra por id y devuelve undefined si no existe', () => {
    const buscar = productoPorId(catalogo());
    expect(buscar('prd_00000002').codigo).toBe('VES-002');
    expect(buscar('prd_ffffffff')).toBeUndefined();
  });
});

describe('temporadas', () => {
  it('activa, publicadas (activa + visibles) y archivo (visibles no activas)', () => {
    const c = catalogo();
    expect(temporadaActiva(c).id).toBe('tem_00000001');
    expect(temporadasPublicadas(c).map((t) => t.id)).toEqual(['tem_00000001', 'tem_00000002']);
    expect(temporadasArchivo(c).map((t) => t.id)).toEqual(['tem_00000002']);
  });
  it('sin temporada activa', () => {
    const c = catalogo({ temporada_activa_id: null });
    expect(temporadaActiva(c)).toBeNull();
    expect(temporadasPublicadas(c).map((t) => t.id)).toEqual(['tem_00000002']);
  });
});

describe('portadasVigentes', () => {
  it('ordena, quita las terminadas y marca las futuras como pendientes', () => {
    const c = catalogo({
      portadas: [
        portada('por_00000001', { orden: 3 }),
        portada('por_00000002', { orden: 1, hasta: '2026-12-01T00:00:00-05:00' }),
        portada('por_00000003', { orden: 2, desde: '2026-12-20T00:00:00-05:00' }),
      ],
    });
    const r = portadasVigentes(c, EN_OFERTA);
    expect(r.map((p) => [p.id, p.pendiente])).toEqual([
      ['por_00000003', true],
      ['por_00000001', false],
    ]);
  });
});

describe('secciones del inicio (regla 2)', () => {
  it('requisito según el tipo', () => {
    expect(requisitoSeccion({ tipo: 'ofertas' })).toBe('oferta');
    expect(requisitoSeccion({ tipo: 'liquidacion' })).toBe('liquidacion');
    expect(requisitoSeccion({ tipo: 'novedades' })).toBeNull();
  });

  it('ofertas muestra solo las candidatas con oferta vigente', () => {
    const c = catalogo({
      secciones: [seccion('sec_00000001', { tipo: 'ofertas', productos: ['prd_00000001', 'prd_00000002', 'prd_00000003'] })],
    });
    const [s] = seccionesInicio(c, EN_OFERTA);
    expect(s.productos.map((p) => p.codigo)).toEqual(['VES-002', 'VES-003']);
    expect(s.candidatas.map((p) => p.codigo)).toEqual(['VES-001', 'VES-002', 'VES-003']);
    expect(s.requisito).toBe('oferta');
    expect(s.enlace).toBe('catalogo/?oferta=1');
  });

  it('liquidacion exige liquidacion: true', () => {
    const c = catalogo({ secciones: [seccion('sec_00000001', { tipo: 'liquidacion', productos: ['prd_00000002', 'prd_00000003'] })] });
    expect(seccionesInicio(c, EN_OFERTA)[0].productos.map((p) => p.codigo)).toEqual(['VES-003']);
  });

  it('se oculta si no queda ninguna, y con ids que no existen', () => {
    const c = catalogo({
      secciones: [
        seccion('sec_00000001', { tipo: 'ofertas', productos: ['prd_00000002'] }),
        seccion('sec_00000002', { tipo: 'manual', productos: ['prd_ffffffff'] }),
      ],
    });
    expect(seccionesInicio(c, ANTES_OFERTA)).toEqual([]);
  });

  it('ordena por orden y arma el enlace de categoría', () => {
    const c = catalogo({
      secciones: [
        seccion('sec_00000001', { orden: 2, tipo: 'categoria', productos: ['prd_00000002', 'prd_00000003'] }),
        seccion('sec_00000002', { orden: 1, tipo: 'novedades', productos: ['prd_00000001'] }),
        seccion('sec_00000003', { orden: 3, tipo: 'mas_consultados', productos: ['prd_00000001'] }),
      ],
    });
    expect(seccionesInicio(c, EN_OFERTA).map((s) => [s.seccion.id, s.enlace])).toEqual([
      ['sec_00000002', 'catalogo/'],
      ['sec_00000001', 'catalogo/?categoria=vestidos'],
      ['sec_00000003', null],
    ]);
  });
});
