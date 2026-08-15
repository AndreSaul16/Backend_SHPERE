/**
 * S7 · Después de la junta — DIRECCION.md §3.S7 / DESIGN.md §8.7.
 *
 * El telégrafo: tres actuaciones que se deslizan desde el canto derecho y se
 * asientan, medio segundo entre una y la siguiente. Cada una gana su check
 * dibujado, y cuando la tercera se asienta rueda el contador «+3 hoy».
 *
 * Medio segundo entre entradas es MUCHO para un stagger, y es a propósito: no
 * es una lista entrando, es un registro de cosas que pasaron en el mundo a las
 * 12:04, las 12:05 y las 12:06. El ritmo cuenta esa parte.
 */

import { gsap } from '../registro';
import { DURACION, EASE_SETTLE, REVELADO } from '../tokens';
import { rodarDeclarado } from '../../piezas/odometro';

/** Segundos entre una actuación y la siguiente (§3.S7). */
const ESCALONADO = 0.5;

export function coreografiarDespues(): void {
  const telegrafo = document.querySelector<HTMLElement>('[data-telegrafo]');
  if (!telegrafo) return;

  const entradas = [...telegrafo.querySelectorAll<HTMLElement>('.telegrafo__entrada')];
  const checks = [...telegrafo.querySelectorAll<SVGPathElement>('[data-check]')];
  const contador = telegrafo.querySelector<HTMLElement>('[data-contador-actuaciones]');
  if (entradas.length === 0) return;

  if (checks.length > 0) gsap.set(checks, { drawSVG: '0%' });

  const linea = gsap.timeline({
    scrollTrigger: { trigger: telegrafo, start: REVELADO.disparo, once: true },
  });

  entradas.forEach((entrada, indice) => {
    const momento = indice * ESCALONADO;
    linea.from(
      entrada,
      { opacity: 0, x: 24, duration: DURACION.pop, ease: EASE_SETTLE },
      momento,
    );

    const check = checks[indice];
    if (check) {
      linea.to(
        check,
        { drawSVG: '100%', duration: DURACION.pop, ease: EASE_SETTLE },
        momento + DURACION.pop,
      );
    }
  });

  if (contador) {
    linea.call(
      () => {
        rodarDeclarado(contador);
      },
      [],
      (entradas.length - 1) * ESCALONADO + DURACION.pop * 2,
    );
  }
}
