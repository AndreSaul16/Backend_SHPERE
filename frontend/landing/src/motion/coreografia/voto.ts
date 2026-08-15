/**
 * S5 · El voto — DIRECCION.md §3.S5.
 *
 * El recuento entra rodando: cada cifra viene del número que declara su
 * `data-saliente` en el marcado, así que el rodillo cuenta un cambio de verdad
 * (0 → 1, 1 → 2) y no un adorno. Las cuatro agujas se posan escalonadas .12 s,
 * y cuando la de Vortex cruza el 70 —el único NO de la mesa, y el dato más
 * interesante de la página— el subrayado de latón del recuento parpadea una vez.
 *
 * El parpadeo va colgado del instante en que llega esa cuarta aguja, no del
 * momento de entrar en el viewport: lo que subraya es el cruce del umbral.
 */

import { gsap } from '../registro';
import { REVELADO } from '../tokens';
import { barrerAgujas } from '../../piezas/aguja';
import { parpadearSubrayado, rodarDeclarado } from '../../piezas/odometro';

/** Escalonado entre las cuatro agujas del recuento (§3.S5). */
const ESCALONADO_AGUJAS = 0.12;

export function coreografiarVoto(): void {
  const pieza = document.querySelector<HTMLElement>('[data-recuento]');
  if (!pieza) return;

  const odometros = [...pieza.querySelectorAll<HTMLElement>('[data-cifra]')];
  const agujas = [...pieza.querySelectorAll('.aguja')];
  const odometroDelNo = pieza.querySelector<HTMLElement>('[data-cifra="no"]');

  const linea = gsap.timeline({
    scrollTrigger: { trigger: pieza, start: REVELADO.disparo, once: true },
  });

  linea.call(
    () => {
      odometros.forEach(rodarDeclarado);
      barrerAgujas(agujas, ESCALONADO_AGUJAS);
    },
    [],
    0,
  );

  if (odometroDelNo) {
    linea.call(
      () => {
        parpadearSubrayado(odometroDelNo);
      },
      [],
      ESCALONADO_AGUJAS * (agujas.length - 1),
    );
  }
}
