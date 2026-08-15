// @vitest-environment happy-dom

/**
 * El odómetro y la pluma — DESIGN.md §8.12 y §8.8.
 *
 * Lo que estas dos piezas contratan, y que es lo que aquí se defiende:
 *
 *   CERO TEMPORIZADORES. Ni `setTimeout`, ni `setInterval`, ni un `rAF` propio.
 *   El rodillo del odómetro es una animación CSS de una iteración que se
 *   relanza remontando el dígito, y la pluma es una transición CSS sobre un
 *   `scaleX` que sólo cambia cuando llega un trozo. Si alguna de las dos
 *   montase un reloj estaría inventando movimiento donde no ha pasado nada, y
 *   §7.4 lo rechaza por nombre. Los relojes falsos de este fichero cuentan los
 *   temporizadores montados y exigen 0.
 *
 *   EL TEXTO ES SIEMPRE LA CIFRA VIGENTE. Durante el rodillo, el dígito
 *   saliente vive en un pseudo-elemento alimentado por `data-saliente` y no en
 *   el DOM: si fuese texto, 9 → 10 se leería «190» mientras rueda.
 *
 *   EL AVANCE DE LA PLUMA ES FUNCIÓN DEL Nº DE TROZOS Y DE NADA MÁS.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fijarOdometro,
  parpadearSubrayado,
  rodarDeclarado,
  rodarOdometro,
} from '../src/piezas/odometro';
import {
  TROZOS_POR_RENGLON,
  avanceDePluma,
  avanzarPluma,
  completarPluma,
  reiniciarPluma,
  renglonesLlenos,
} from '../src/piezas/pluma';

function montarOdometro(cifras: string, salientes?: string[]): HTMLElement {
  const odometro = document.createElement('span');
  odometro.className = 'odometro';
  [...cifras].forEach((cifra, indice) => {
    const digito = document.createElement('span');
    digito.className = 'odometro__digito';
    const saliente = salientes?.[indice];
    if (saliente !== undefined) digito.dataset['saliente'] = saliente;

    const rodillo = document.createElement('span');
    rodillo.className = 'odometro__rodillo';
    rodillo.textContent = cifra;
    digito.append(rodillo);
    odometro.append(digito);
  });
  document.body.append(odometro);
  return odometro;
}

function cifraVisible(odometro: HTMLElement): string {
  return [...odometro.querySelectorAll('.odometro__rodillo')]
    .map((rodillo) => rodillo.textContent ?? '')
    .join('');
}

beforeEach(() => {
  document.body.replaceChildren();
  // Se falsean TODOS los relojes que una pieza podría montar a escondidas.
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'requestAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('odómetro · cero temporizadores', () => {
  it('rodar no monta ni un solo reloj', () => {
    const odometro = montarOdometro('1');
    rodarOdometro(odometro, '2');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fijar no monta ni un solo reloj', () => {
    const odometro = montarOdometro('9');
    fijarOdometro(odometro, '4');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('el subrayado tampoco: se relanza remontándolo, no con un reloj', () => {
    const odometro = montarOdometro('3');
    parpadearSubrayado(odometro);
    parpadearSubrayado(odometro);
    expect(vi.getTimerCount()).toBe(0);
    expect(odometro.querySelectorAll('.odometro__subrayado')).toHaveLength(1);
  });

  it('una cadena larga de cambios sigue sin acumular relojes', () => {
    const odometro = montarOdometro('0');
    for (const valor of ['1', '2', '3', '9', '4', '7']) rodarOdometro(odometro, valor);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('odómetro · el texto es siempre la cifra vigente', () => {
  it('el saliente vive en el atributo, no en el DOM', () => {
    const odometro = montarOdometro('9');
    rodarOdometro(odometro, '4');

    expect(cifraVisible(odometro)).toBe('4');
    expect(odometro.textContent).toBe('4');

    const digito = odometro.querySelector<HTMLElement>('.odometro__digito');
    expect(digito?.dataset['saliente']).toBe('9');
    expect(digito?.dataset['rodando']).toBe('');
  });

  it('no rueda si la cifra no ha cambiado: no se inventa un movimiento', () => {
    const odometro = montarOdometro('5');
    rodarOdometro(odometro, '5');

    expect(odometro.querySelector<HTMLElement>('.odometro__digito')?.dataset['rodando']).toBeUndefined();
    expect(odometro.querySelector('.odometro__subrayado')).toBeNull();
  });

  it('al cambiar el número de dígitos reconstruye la fila sin tocar el texto de al lado', () => {
    const odometro = montarOdometro('9');
    const sufijo = document.createTextNode(' hoy');
    odometro.append(sufijo);

    rodarOdometro(odometro, '10');

    expect(cifraVisible(odometro)).toBe('10');
    expect(odometro.textContent).toContain('hoy');
    expect(odometro.querySelectorAll('.odometro__digito')).toHaveLength(2);
  });

  it('fijar deja la cifra sin rodillo y sin subrayado (movimiento reducido)', () => {
    const odometro = montarOdometro('2', ['1']);
    parpadearSubrayado(odometro);
    fijarOdometro(odometro, '7');

    const digito = odometro.querySelector<HTMLElement>('.odometro__digito');
    expect(cifraVisible(odometro)).toBe('7');
    expect(digito?.dataset['rodando']).toBeUndefined();
    expect(digito?.dataset['saliente']).toBeUndefined();
    expect(odometro.querySelector('.odometro__subrayado')).toBeNull();
  });
});

describe('odómetro · las cifras que declara el marcado', () => {
  it('rueda desde el data-saliente hasta la cifra escrita', () => {
    const odometro = montarOdometro('2', ['1']);
    rodarDeclarado(odometro);

    expect(cifraVisible(odometro)).toBe('2');
    expect(odometro.querySelector<HTMLElement>('.odometro__digito')?.dataset['saliente']).toBe('1');
  });

  it('llamarlo dos veces no vuelve a rodar: el `once` está en el dato', () => {
    const odometro = montarOdometro('2', ['1']);
    rodarDeclarado(odometro);
    const primero = odometro.querySelector('.odometro__subrayado');

    rodarDeclarado(odometro);
    expect(odometro.querySelector('.odometro__subrayado')).toBe(primero);
    expect(cifraVisible(odometro)).toBe('2');
  });

  it('sin data-saliente no hay nada que rodar', () => {
    const odometro = montarOdometro('5');
    rodarDeclarado(odometro);
    expect(odometro.querySelector('.odometro__subrayado')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('pluma · el avance es función de los trozos y de nada más', () => {
  it('doce trozos llenan un renglón', () => {
    expect(TROZOS_POR_RENGLON).toBe(12);
    expect(avanceDePluma(0)).toBe(0);
    expect(avanceDePluma(6)).toBeCloseTo(0.5);
    expect(avanceDePluma(12)).toBe(1);
  });

  it('el renglón lleno se ve lleno antes de volver a empezar', () => {
    expect(avanceDePluma(12)).toBe(1);
    expect(avanceDePluma(13)).toBeCloseTo(1 / 12);
    expect(avanceDePluma(24)).toBe(1);
    expect(avanceDePluma(25)).toBeCloseTo(1 / 12);
  });

  it('cuenta los renglones llenos', () => {
    expect(renglonesLlenos(0)).toBe(0);
    expect(renglonesLlenos(11)).toBe(0);
    expect(renglonesLlenos(12)).toBe(1);
    expect(renglonesLlenos(25)).toBe(2);
  });

  it('un número negativo de trozos no dibuja nada', () => {
    expect(avanceDePluma(-3)).toBe(0);
    expect(renglonesLlenos(-3)).toBe(0);
  });
});

describe('pluma · cero temporizadores', () => {
  it('avanzar, completar y reiniciar no montan ningún reloj', () => {
    const trazo = document.createElement('span');
    document.body.append(trazo);

    for (let trozos = 1; trozos <= 30; trozos += 1) avanzarPluma(trazo, trozos);
    completarPluma(trazo);
    reiniciarPluma(trazo);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('lo único que escribe es un scaleX', () => {
    const trazo = document.createElement('span');
    document.body.append(trazo);

    avanzarPluma(trazo, 6);
    expect(trazo.style.transform).toBe('scaleX(0.5000)');

    completarPluma(trazo);
    expect(trazo.style.transform).toBe('scaleX(1.0000)');

    reiniciarPluma(trazo);
    expect(trazo.style.transform).toBe('scaleX(0.0000)');
  });
});
