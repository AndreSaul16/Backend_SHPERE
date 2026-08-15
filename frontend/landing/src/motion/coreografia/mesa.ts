/**
 * S4 · La mesa — DIRECCION.md §3.S4.
 *
 * Las cinco placas entran con la física de placa (`back.out(1.15)` / .45), y a
 * la vez sus agujas hacen el barrido de presentación desde cero hasta la
 * confianza que cada director tuvo en la sesión de muestra. Némesis no tiene
 * aguja: tiene un filete oxblood que se dibuja, porque no vota — su papel es
 * romper el consenso, no medirlo.
 *
 * Las cifras del barrido NO se repiten aquí: se leen del `aria-valuenow` que ya
 * está en el marcado, que es lo que ve quien no puede ver la aguja. Una sola
 * fuente para el dato y para la medida.
 */

import { gsap } from '../registro';
import { DURACION, EASE_SETTLE, FISICA_PLACA, REVELADO } from '../tokens';
import { barrerAgujas } from '../../piezas/aguja';

/** Escalonado entre placas y, con ellas, entre agujas (§3.S4). */
const ESCALONADO = 0.06;

export function coreografiarMesa(): void {
  const placas = document.querySelector<HTMLElement>('[data-placas]');
  if (!placas) return;

  const asientos = [...placas.children] as HTMLElement[];
  const agujas = [...placas.querySelectorAll('.aguja')];
  const fileteDelDiablo = placas.querySelector<SVGLineElement>('[data-filete-devil]');

  gsap.from(asientos, {
    opacity: 0,
    y: 16,
    duration: FISICA_PLACA.duration,
    ease: FISICA_PLACA.ease,
    stagger: ESCALONADO,
    scrollTrigger: {
      trigger: placas,
      start: REVELADO.disparo,
      once: true,
      onEnter: () => {
        barrerAgujas(agujas, ESCALONADO);
        if (fileteDelDiablo) {
          gsap.from(fileteDelDiablo, {
            drawSVG: '0%',
            duration: DURACION.reveal,
            ease: EASE_SETTLE,
            delay: ESCALONADO * (asientos.length - 1),
          });
        }
      },
    },
  });
}
