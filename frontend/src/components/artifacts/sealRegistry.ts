/**
 * Qué juntas ya llevan su sello estampado en esta pestaña.
 *
 * Vive fuera de `ActaSeal.tsx` por una razón mecánica: un fichero de componente
 * que además exporta funciones rompe el refresco en caliente de Vite
 * (`react-refresh/only-export-components`), y el reinicio hace falta para que
 * una prueba no contamine a la siguiente.
 *
 * §8.3: «sucede exactamente una vez por debate». Cambiar de pestaña de artefacto
 * y volver al acta no vuelve a estampar. Es memoria de proceso a propósito: al
 * recargar la página el usuario llega nuevo al acta y el aterrizaje vuelve a ser
 * información en vez de ruido.
 */
const yaEstampadas = new Set<string>();

/** ¿Le toca caer a esta junta? Devuelve `true` sólo la primera vez. */
export function reclamarSello(sessionId: string): boolean {
    const primeraVez = !yaEstampadas.has(sessionId);
    yaEstampadas.add(sessionId);
    return primeraVez;
}

/** Reinicio para las pruebas. */
export function __resetSellosEstampados(): void {
    yaEstampadas.clear();
}
