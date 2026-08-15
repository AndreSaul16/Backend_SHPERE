/**
 * El filamento de deliberación — DESIGN.md §8.11 / DIRECCION.md §3.S1.2.
 *
 * Bajo la placa de quien está hablando corre una línea de 2px en su color, cuyo
 * `scaleX` avanza con los trozos que llegan de ese director — no con el tiempo.
 * Es la misma mecánica de la pluma (§8.8) aplicada a la espera: dice QUIÉN está
 * trabajando y que sigue trabajando, sin inventar cuánto le falta.
 *
 * Al emitir su voto, el filamento se retira y la aguja toma el relevo (§8.11).
 * Por eso esta pieza no tiene estado propio: la escena le dice qué placa está
 * viva y cuántos trozos lleva, y ella pinta. Sin temporizadores y sin bucle.
 */

import { avanceDePluma } from './pluma';

/**
 * Enciende el filamento de un asiento y lo coloca en su avance. El resto de
 * filamentos se apagan: en la mesa habla uno cada vez.
 */
export function encenderFilamento(
  filamentos: Iterable<HTMLElement>,
  activo: HTMLElement | null,
  trozos: number,
): void {
  for (const filamento of filamentos) {
    if (filamento === activo) continue;
    filamento.hidden = true;
    filamento.style.transform = 'scaleX(0)';
  }
  if (!activo) return;
  activo.hidden = false;
  activo.style.transform = `scaleX(${avanceDePluma(trozos).toFixed(4)})`;
}

/** Se acabó la deliberación: ningún filamento corre. */
export function apagarFilamentos(filamentos: Iterable<HTMLElement>): void {
  for (const filamento of filamentos) {
    filamento.hidden = true;
    filamento.style.transform = 'scaleX(0)';
  }
}
