/**
 * 6.2 · El destino que se conserva cuando la sesión no está.
 *
 * Vive fuera de `RequireAuth.tsx` porque `react-refresh/only-export-components`
 * prohíbe exportar lógica junto a un componente: con esto en el mismo fichero,
 * cada edición de la función invalidaría el módulo entero y el refresco en
 * caliente reventaría el árbol.
 */

/** Lo que `RequireAuth` deja en `location.state` al mandar a `/login`. */
export interface EstadoDeRegreso {
    /** Ruta completa (path + query + hash) que el usuario pedía. */
    destino: string;
}

/**
 * El destino guardado, si lo hay y si es seguro.
 *
 * Sólo se aceptan rutas internas que empiecen por una única `/`: un `state`
 * manipulado con `//evil.com` o `https://…` sería una redirección abierta, y
 * aquí el valor entra desde el historial del navegador, que no controlamos.
 * `/login` y `/register` se descartan además porque volver a ellos tras
 * identificarse es un bucle.
 */
export function destinoDeRegreso(state: unknown): string | null {
    const destino = (state as Partial<EstadoDeRegreso> | null | undefined)?.destino;
    if (typeof destino !== 'string' || destino.length === 0) return null;
    if (!destino.startsWith('/') || destino.startsWith('//')) return null;
    if (/^\/(login|register|verify-email|reset-password)(\/|\?|#|$)/.test(destino)) return null;
    return destino;
}
