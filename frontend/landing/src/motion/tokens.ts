/**
 * Tokens de movimiento — DIRECCION.md §3.0.
 *
 * DECISIÓN CERRADA, NO SE REABRE. Las curvas de DESIGN.md §7.1 son
 * `cubic-bezier` y GSAP no las acepta sin `CustomEase`. En vez de cargar un
 * plugin más (el presupuesto de §7 de DIRECCION.md cuenta cada KB), se fijan
 * CUATRO aproximaciones nativas y no se inventan otras.
 *
 *   settle  cubic-bezier(0.16, 1, 0.30, 1)  → "expo.out"
 *   travel  cubic-bezier(0.83, 0, 0.17, 1)  → "power3.inOut"
 *   exit    cubic-bezier(0.4, 0, 1, 1)      → "power2.in"
 *   mech    linear                          → "none"
 */

export const EASE_SETTLE = 'expo.out';
export const EASE_TRAVEL = 'power3.inOut';
export const EASE_EXIT = 'power2.in';
export const EASE_MECH = 'none';

/**
 * El equivalente de `--ease-impact`. D7: UN solo momento en toda la página —
 * el aterrizaje del sello en S6 y su gemelo en la demo del hero, que son el
 * mismo efecto. Si todo golpea, nada golpea.
 */
export const EASE_IMPACTO = 'back.out(2.2)';

/** Duraciones de DESIGN.md §7.2, en segundos (GSAP no habla en ms). */
export const DURACION = {
  tap: 0.09,
  pop: 0.16,
  reveal: 0.22,
  panel: 0.32,
  escena: 0.56,
} as const;

/**
 * Física de la aguja de confianza (equivale a `SPRING_NEEDLE`): sobrepasa UNA
 * vez y se posa. Una aguja es un objeto con masa, no una interpolación.
 */
export const FISICA_AGUJA = { ease: 'back.out(1.6)', duration: 0.7 } as const;

/** Física de la placa de asiento (`SPRING_PLATE`): se alza, sin rebote. */
export const FISICA_PLACA = { ease: 'back.out(1.15)', duration: 0.45 } as const;

/** Reveal estándar de sección (DIRECCION.md §3.0). */
export const REVELADO = {
  /** Líneas del titular: yPercent 110 → 0, enmascaradas. */
  desplazamientoLinea: 110,
  staggerTitular: 0.08,
  staggerLista: 0.04,
  /** Más de 8 con stagger es un desfile, no una entrada. */
  topeStagger: 8,
  desplazamientoCuerpo: 12,
  disparo: 'top 78%',
} as const;
