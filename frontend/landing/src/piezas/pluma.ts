/**
 * La Pluma del Acta — DESIGN.md §8.8 / DIRECCION.md §4.2.
 *
 * Mientras el acta se redacta, un trazo bajo su título AVANZA con cada trozo
 * recibido y se reinicia al llegar al final, como una línea manuscrita que
 * llena renglones. Al cerrarse el acta el trazo se completa y entonces cae el
 * sello: debate → escritura → constancia, encadenado y a la vista.
 *
 * POR QUÉ RENGLONES Y NO PORCENTAJE. El backend nunca dice cuánto falta. Una
 * barra al 60 % afirmaría «queda el 40 %», que sería mentira; un renglón que se
 * llena y vuelve a empezar afirma «esto se está escribiendo», que es verdad.
 * Doce trozos por renglón (§8.8).
 *
 * SIN TEMPORIZADORES Y SIN TWEEN. El avance es función del número de trozos
 * recibidos y DE NADA MÁS: si dejan de llegar trozos, la pluma se para — que es
 * la verdad. Lo único que interpola es una transición CSS de 90 ms sobre
 * `scaleX`, que es compositor puro y que `prefers-reduced-motion` ya reduce a
 * un salto sin que nadie tenga que comprobarlo (§8.8: «la línea salta de 0 a 1
 * sin interpolar»).
 *
 * La aritmética vive separada del DOM porque es la única parte con cuenta, y
 * probarla sin navegador es lo que defiende de verdad la propiedad contratada.
 */

export const TROZOS_POR_RENGLON = 12;

/**
 * Avance del trazo (0 → 1) tras `trozos` recibidos. El renglón completo se ve
 * lleno antes de volver a empezar: en el trozo 12 vale 1, no 0.
 */
export function avanceDePluma(trozos: number): number {
  if (trozos <= 0) return 0;
  const resto = trozos % TROZOS_POR_RENGLON;
  return resto === 0 ? 1 : resto / TROZOS_POR_RENGLON;
}

/** Cuántos renglones se han llenado del todo. */
export function renglonesLlenos(trozos: number): number {
  return Math.floor(Math.max(0, trozos) / TROZOS_POR_RENGLON);
}

function pintar(trazo: HTMLElement, avance: number): void {
  trazo.style.transform = `scaleX(${avance.toFixed(4)})`;
}

/** Mueve el trazo al avance que le toca por número de trozos recibidos. */
export function avanzarPluma(trazo: HTMLElement, trozos: number): void {
  pintar(trazo, avanceDePluma(trozos));
}

/** El acta se cierra: el renglón se llena del todo y ahí cae el sello. */
export function completarPluma(trazo: HTMLElement): void {
  pintar(trazo, 1);
}

/** Renglón en blanco: todavía no se ha escrito nada. */
export function reiniciarPluma(trazo: HTMLElement): void {
  pintar(trazo, 0);
}
