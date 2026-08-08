/**
 * Pistas de primera vez — PLAN §6 Q13 (tarea 5.12).
 *
 * Sustituye al `OnboardingChecklist`, y no por gusto: aquel disparaba **tres
 * llamadas a la API en cada montaje** de la pantalla de bienvenida para TODO
 * usuario, parpadeaba porque pintaba antes de saber si el onboarding ya estaba
 * hecho, y explicaba los pasos en abstracto —«Conecta tus herramientas»— fuera
 * de cualquier momento en que sirvieran de algo.
 *
 * Esto no llama a nada. Una pista aparece la PRIMERA VEZ que se ve la cosa que
 * explica —la mesa cuando se monta, la aguja cuando llega un voto, el sello
 * cuando se cierra un acta— y no vuelve. Enseñar el umbral de confianza cuando
 * la aguja se mueve es la única vez que el usuario tiene contexto para
 * entenderlo.
 *
 * ── El contrato que se hereda del componente retirado ───────────────────────
 *
 * Sus pruebas fijaban una regla que sigue valiendo aquí: **no saber no es lo
 * mismo que saber que sí**. Allí era «no saber si hay una conexión no es
 * tenerla», y por eso el paso quedaba pendiente cuando el endpoint fallaba.
 *
 * Aquí el estado dudoso es `localStorage` inaccesible —Safari privado, cookies
 * de terceros bloqueadas—. Y la respuesta es la misma en espíritu: no se da la
 * pista por vista (se enseña, que es lo que informa), pero tampoco se machaca —
 * el registro cae a memoria y la pista sale una vez por sesión, no una por
 * navegación. Ni se traga la información ni se convierte en un moscardón.
 */
import { useCallback, useState } from 'react';

export const PREFIJO_PISTA = 'sphere:pista:';

/** Respaldo en memoria para cuando el almacenamiento no está disponible. */
const vistasEnMemoria = new Set<string>();

function clave(id: string): string {
    return `${PREFIJO_PISTA}${id}`;
}

export function pistaVista(id: string): boolean {
    if (vistasEnMemoria.has(id)) return true;
    try {
        return window.localStorage.getItem(clave(id)) === '1';
    } catch {
        // Sin almacenamiento no sabemos si se vio. No se da por vista: se
        // enseña, que es lo que informa (ver la cabecera del fichero).
        return false;
    }
}

export function marcarPistaVista(id: string): void {
    // La memoria SIEMPRE, no sólo como respaldo: si `localStorage` falla al
    // escribir —Safari privado lanza— sin esto la pista volvería en el
    // siguiente render de la misma sesión.
    vistasEnMemoria.add(id);
    try {
        window.localStorage.setItem(clave(id), '1');
    } catch {
        /* La pista vale para esta sesión y ya. */
    }
}

/** Sólo para las pruebas: olvida lo visto en memoria. */
export function __olvidarPistas(): void {
    vistasEnMemoria.clear();
}

export interface PistaHandle {
    /** `true` si toca enseñarla ahora. */
    mostrar: boolean;
    /** La cierra y la marca como vista para siempre. */
    descartar: () => void;
}

/**
 * @param id      Clave estable de la pista. Cambiarla la resucita para todos.
 * @param activo  Si la cosa que la pista explica está en pantalla. Una pista
 *                sobre la aguja no puede salir antes de que haya aguja: se
 *                gastaría la única vez que se enseña en el momento en que no
 *                significa nada.
 */
export function useFirstTimeHint(id: string, activo = true): PistaHandle {
    // Perezoso y una sola vez: leer en cada render haría que marcar una pista
    // desde otro sitio la hiciera desaparecer a mitad de lectura.
    const [yaVista, setYaVista] = useState(() => pistaVista(id));

    const descartar = useCallback(() => {
        marcarPistaVista(id);
        setYaVista(true);
    }, [id]);

    return { mostrar: activo && !yaVista, descartar };
}
