/**
 * El constructor de URLs de registro — DIRECCION.md §2.14.
 *
 * Lo que este test defiende no es que la plantilla concatene bien: es que hay
 * CUATRO posiciones y solo cuatro, que cada una produce su `utm_content`, y que
 * el login queda fuera del rastreo. Si alguien añade una quinta posición sin
 * pasar por el contrato, aquí se entera.
 */

import { describe, expect, it } from 'vitest';
import { APP_URL, CTA_REGISTRO, POSICIONES_CTA, URL_LOGIN } from '../src/config';

describe('CTA_REGISTRO', () => {
  it('solo existen cuatro posiciones: nav, hero, precios y cierre', () => {
    expect([...POSICIONES_CTA]).toEqual(['nav', 'hero', 'precios', 'cierre']);
  });

  it.each([...POSICIONES_CTA])('construye la URL de %s con su utm_content', (posicion) => {
    const url = new URL(CTA_REGISTRO(posicion));

    expect(url.origin + url.pathname).toBe(`${APP_URL}/register`);
    expect(url.searchParams.get('utm_source')).toBe('landing');
    expect(url.searchParams.get('utm_medium')).toBe('web');
    expect(url.searchParams.get('utm_campaign')).toBe('lanzamiento');
    expect(url.searchParams.get('utm_content')).toBe(posicion);
  });

  it('no añade ningún parámetro más allá de los cuatro del contrato', () => {
    const url = new URL(CTA_REGISTRO('hero'));
    expect([...url.searchParams.keys()].sort()).toEqual([
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
    ]);
  });

  it('las cuatro URLs son distintas entre sí', () => {
    const urls = POSICIONES_CTA.map((posicion) => CTA_REGISTRO(posicion));
    expect(new Set(urls).size).toBe(POSICIONES_CTA.length);
  });
});

describe('URL_LOGIN', () => {
  it('apunta al login de la aplicación', () => {
    expect(URL_LOGIN).toBe(`${APP_URL}/login`);
  });

  it('no lleva UTM: quien entra ya es usuario', () => {
    expect(new URL(URL_LOGIN).search).toBe('');
  });
});
