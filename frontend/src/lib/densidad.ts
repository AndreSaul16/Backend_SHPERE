/**
 * Densidad de la interfaz — PLAN §6 Q11 (tarea 5.7), DESIGN §4.4.
 *
 * Dos densidades y nada más: `comfortable` (44px de fila) y `compact` (34px).
 * Las dos custom properties (`--row-h`, `--pad-y`) ya viven en `index.css`
 * desde la fase 0, incluida la regla que **fuerza `comfortable` en punteros
 * gruesos**: en táctil, una fila de 34px rompe el mínimo de 44×44 de §12.11, y
 * eso no puede depender de que el usuario elija bien.
 *
 * Por qué es local y no del perfil del backend: la densidad es una preferencia
 * del DISPOSITIVO, no de la persona. El mismo fundador quiere compacto en el
 * portátil de 27 pulgadas y cómodo en el móvil; guardarla en la cuenta le
 * impondría la elección del otro aparato.
 *
 * Todo acceso a `localStorage` va envuelto, por lo mismo que en `useDraft`: en
 * Safari privado existe y LANZA al escribir.
 */
export type Densidad = 'comfortable' | 'compact';

export const CLAVE_DENSIDAD = 'sphere:densidad';
export const DENSIDAD_POR_DEFECTO: Densidad = 'comfortable';

export function esDensidad(v: unknown): v is Densidad {
    return v === 'comfortable' || v === 'compact';
}

/** Lo guardado, o el valor por defecto si no hay nada o hay basura. */
export function leerDensidad(): Densidad {
    try {
        const guardada = window.localStorage.getItem(CLAVE_DENSIDAD);
        return esDensidad(guardada) ? guardada : DENSIDAD_POR_DEFECTO;
    } catch {
        return DENSIDAD_POR_DEFECTO;
    }
}

/**
 * Fija la densidad en el elemento raíz y la recuerda.
 *
 * `comfortable` no escribe atributo: es el valor por defecto de `:root`, y un
 * `data-density="comfortable"` sería una segunda fuente de verdad para el mismo
 * estado. El fallo seguro con el atributo ausente tiene que ser el modo que
 * cumple el mínimo táctil.
 */
export function aplicarDensidad(densidad: Densidad): void {
    const raiz = document.documentElement;
    if (densidad === 'compact') raiz.setAttribute('data-density', 'compact');
    else raiz.removeAttribute('data-density');
    try {
        window.localStorage.setItem(CLAVE_DENSIDAD, densidad);
    } catch {
        /* Sin almacenamiento: la densidad vale para esta sesión y ya. */
    }
}

/** Se llama una vez al arrancar, antes del primer pintado. */
export function inicializarDensidad(): void {
    const densidad = leerDensidad();
    if (densidad === 'compact') document.documentElement.setAttribute('data-density', 'compact');
}
