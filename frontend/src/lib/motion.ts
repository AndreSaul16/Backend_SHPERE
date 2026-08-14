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

/** §7.4 — lo que separa a dos turnos que llegan juntos, en segundos. */
export const STAGGER_TURNO = 0.04;

/**
 * §7.5 — cuántos turnos escalonan antes de que la tanda entre junta.
 *
 * «Máximo 8 filas con stagger (las siguientes entran juntas): una lista de 200
 * filas no es un desfile». Sin tope, reabrir un debate largo costaría 8
 * segundos de entradas encadenadas; con él, el último turno de cualquier tanda
 * entra a los 320ms, dentro de la ventana de `--duration-scene`.
 */
export const TOPE_STAGGER = 8;

/** El retraso de entrada del turno `indice` de una tanda, en segundos. */
export function retrasoDeEntrada(indice: number): number {
    return Math.min(indice, TOPE_STAGGER) * STAGGER_TURNO;
}

/** Lo que Framer necesita para la entrada de un turno. */
interface EntradaDelTurno {
    initial: { opacity: number; y?: number };
    animate: { opacity: number; y?: number };
    // La tupla exacta, no `number[]`: Framer tipa la bezier como
    // `readonly [number, number, number, number]` y un array suelto no encaja.
    transition: { duration: number; ease?: readonly [number, number, number, number]; delay?: number };
}

/**
 * La entrada del Turno — §9.11, con los tokens de §7.2/§7.1 (Viveza-1).
 *
 * Lo que había en `MessageBubble` era `{ duration: 0.4, ease: "easeOut" }` y
 * `{ opacity: 0, y: 10, scale: 0.97 }` escritos a pelo: 400ms son **2,5× el
 * techo** de `--duration-pop`, `easeOut` no es ninguna de las cuatro curvas de
 * §7.1, y el `scale` no lo firma nadie —hacía «botar» la burbuja al entrar—.
 * §7.4 contrata exactamente `opacity 0→1` + `translateY 6px→0`.
 *
 * Vive aquí y no en el componente porque el escalonado es la única pieza con
 * aritmética del sistema de movimiento, y probarla sin DOM ni framer es lo que
 * mantiene el tope de 8 defendido de verdad.
 */
export function entradaDelTurno(reducido: boolean | null, indice: number): EntradaDelTurno {
    // §7.6: con movimiento reducido el turno APARECE, no viaja — y sin esperar
    // su hueco en la cola. La información no se pierde; se pierde el tiempo.
    if (reducido) {
        return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: SIN_MOVIMIENTO };
    }
    return {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: DURACION.pop, ease: CURVA.settle, delay: retrasoDeEntrada(indice) },
    };
}
