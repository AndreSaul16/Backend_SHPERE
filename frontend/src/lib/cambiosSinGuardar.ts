/**
 * 6.5 — cuántas cosas hay sin guardar, no si las hay.
 *
 * Los formularios largos de SPHERE ya sabían decir «hay cambios» (D63 puso el
 * diálogo de salida en la fase 5), pero «hay cambios» es la información menos
 * útil posible cuando el formulario tiene diecinueve controles repartidos en
 * cinco secciones y el usuario lleva veinte minutos dentro: no sabe si le queda
 * una cosa por revisar o siete, ni dónde.
 *
 * Esto cuenta **hojas distintas**: cada campo que de verdad cambió de valor
 * respecto de lo último que dijo el servidor. Anidar no multiplica —cambiar
 * `professional_profile.role` es UN cambio, no dos—, y un objeto entero que
 * aparece o desaparece cuenta por sus hojas, que es lo que el usuario ve.
 */

/** Un valor sin estructura: lo que ya es un cambio por sí solo. */
function esHoja(valor: unknown): boolean {
    return valor === null || typeof valor !== 'object';
}

/** Número de hojas que cuelgan de un valor (mínimo 1: él mismo). */
function hojasDe(valor: unknown): number {
    if (esHoja(valor)) return 1;
    if (Array.isArray(valor)) return 1; // una lista es una sola decisión del usuario
    const claves = Object.keys(valor as Record<string, unknown>);
    if (claves.length === 0) return 1;
    return claves.reduce((n, k) => n + hojasDe((valor as Record<string, unknown>)[k]), 0);
}

/**
 * Cuántos campos difieren entre lo guardado y lo que hay en pantalla.
 *
 * `undefined` y `null` se tratan como el mismo «vacío»: el backend devuelve
 * secciones ausentes y el formulario las crea vacías en cuanto se toca un
 * hermano, y contar eso como cambio haría que el contador subiera solo.
 */
export function contarCambios(guardado: unknown, actual: unknown): number {
    const vacio = (v: unknown) => v === undefined || v === null || v === '';
    if (vacio(guardado) && vacio(actual)) return 0;

    if (esHoja(guardado) || esHoja(actual) || Array.isArray(guardado) || Array.isArray(actual)) {
        if (Array.isArray(guardado) && Array.isArray(actual)) {
            return JSON.stringify(guardado) === JSON.stringify(actual) ? 0 : 1;
        }
        if (esHoja(guardado) && esHoja(actual)) return guardado === actual ? 0 : 1;
        // Uno tiene estructura y el otro no: cuenta por las hojas del que la tiene.
        return Math.max(hojasDe(guardado), hojasDe(actual));
    }

    const a = guardado as Record<string, unknown>;
    const b = actual as Record<string, unknown>;
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    let total = 0;
    claves.forEach((k) => { total += contarCambios(a[k], b[k]); });
    return total;
}

/** «3 cambios sin guardar» / «1 cambio sin guardar». */
export function frasePendiente(n: number): string {
    return n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`;
}
