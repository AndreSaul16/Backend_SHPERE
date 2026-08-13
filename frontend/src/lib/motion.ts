/**
 * Los muelles del sistema — DESIGN §7.3.
 *
 * «Las agujas y las placas no interpolan por duración: son objetos con masa.»
 * Viven aquí, y no dentro de los componentes que los usan, por dos razones:
 * son contrato compartido (la aguja del Palco y la del asiento en foco tienen
 * que posarse igual) y la regla `react-refresh/only-export-components` no deja
 * que un fichero de componente exporte además constantes.
 */
export const SPRING_NEEDLE = { type: 'spring', stiffness: 120, damping: 14, mass: 1 } as const;
export const SPRING_PLATE = { type: 'spring', stiffness: 220, damping: 26, mass: 0.8 } as const;
export const SPRING_PANEL = { type: 'spring', stiffness: 180, damping: 30, mass: 1 } as const;

/**
 * El corte: lo que usa todo lo animado cuando el sistema pide movimiento
 * reducido (§7.6). No es «no animar»: es llegar al estado final en 0ms, para
 * que la información siga estando y sólo desaparezca el tiempo.
 */
export const SIN_MOVIMIENTO = { duration: 0 } as const;

/** Duraciones de §7.2, en segundos, que es como las quiere Framer Motion. */
export const DURACION = {
    tap: 0.09,
    pop: 0.16,
    reveal: 0.22,
    panel: 0.32,
    scene: 0.56,
} as const;

/** Curvas de §7.1 como tupla de bezier, que es lo que acepta Framer Motion. */
export const CURVA = {
    settle: [0.16, 1, 0.3, 1],
    travel: [0.83, 0, 0.17, 1],
    exit: [0.4, 0, 1, 1],
    impact: [0.34, 1.42, 0.64, 1],
} as const;

/**
 * Envuelve una transición para que respete `prefers-reduced-motion`.
 *
 * `useReducedMotion()` de Framer devuelve `boolean | null` (null mientras no ha
 * podido consultar al sistema), y `null` se trata como «no reducido».
 */
export function conMovimiento<T>(reducido: boolean | null, transicion: T) {
    return reducido ? SIN_MOVIMIENTO : transicion;
}
