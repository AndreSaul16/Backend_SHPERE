/**
 * Borrador persistido por sesión — PLAN §6 Q3, y la mayor pérdida de trabajo
 * que tenía la aplicación.
 *
 * Un prompt de junta bien escrito son cuatro o seis líneas de contexto. Hasta
 * ahora vivía SÓLO en el `useState` del compositor, así que desaparecía al
 * navegar a otra junta, al recargar y —lo peor— cuando el envío fallaba: el
 * input ya se había vaciado de forma optimista.
 *
 * Lo que hace este hook:
 *   · guarda con retardo de 400 ms en `localStorage`, con clave por sesión, de
 *     modo que dos juntas abiertas no se pisan el borrador;
 *   · restaura al montar y al cambiar de sesión, y avisa de que lo ha hecho
 *     (`restored`) para que la interfaz pueda decir «Borrador recuperado» con
 *     su «Descartar» — un texto que reaparece sin explicación asusta más que
 *     uno que se pierde;
 *   · `commit()` se llama cuando el envío SÍ ha salido: sólo entonces se borra.
 *
 * Todo acceso a `localStorage` va envuelto: en modo privado de Safari y con las
 * cookies de terceros bloqueadas, `localStorage` existe pero LANZA al escribir.
 * Un borrador que no se puede guardar es una molestia; un compositor que revienta
 * al teclear es una aplicación rota.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const DRAFT_PREFIX = 'sphere:draft:';
export const DRAFT_DEBOUNCE_MS = 400;

/** Sesión todavía sin crear: el borrador también cuenta, y se hereda al crearla. */
export const DRAFT_NEW_SESSION = 'nueva';

export function draftKey(sessionId: string | null | undefined): string {
    return `${DRAFT_PREFIX}${sessionId || DRAFT_NEW_SESSION}`;
}

function leer(key: string): string {
    try {
        return window.localStorage.getItem(key) ?? '';
    } catch {
        return '';
    }
}

function escribir(key: string, value: string): void {
    try {
        if (value) window.localStorage.setItem(key, value);
        else window.localStorage.removeItem(key);
    } catch {
        /* Sin almacenamiento: el borrador vive sólo en memoria. */
    }
}

export interface DraftHandle {
    /** El texto del compositor. */
    value: string;
    setValue: (next: string | ((current: string) => string)) => void;
    /** `true` si al abrir esta sesión había un borrador guardado con texto. */
    restored: boolean;
    /** Lo tira el usuario: vacía el campo y el almacén, y quita el aviso. */
    discard: () => void;
    /** El envío ha salido: se borra el guardado y se olvida el aviso. */
    commit: () => void;
    /** El envío ha fallado: el texto vuelve al campo y se vuelve a guardar. */
    restore: (text: string) => void;
}

export function useDraft(sessionId: string | null | undefined): DraftHandle {
    const key = draftKey(sessionId);
    // Inicialización perezosa: el primer render ya trae el borrador, así que el
    // campo nunca parpadea de vacío a lleno.
    const [value, setValueState] = useState(() => leer(key));
    const [restored, setRestored] = useState(() => leer(key).length > 0);
    /** La clave con la que se pintó el render anterior. */
    const [claveAnterior, setClaveAnterior] = useState(key);
    // Espejo del valor para los manejadores que necesitan leerlo sin volver a
    // crearse en cada pulsación (`restore`). Se sincroniza en un efecto y no
    // durante el render: escribir en una `ref` mientras se renderiza es lo que
    // rompe la memoización del compilador de React (`react-hooks/refs`).
    const valueRef = useRef(value);
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    /*
     * Cambio de sesión: se abre el borrador de la sesión nueva.
     *
     * D43 · 7.4 — esto era un `useEffect` sobre `[key]` que llamaba a dos
     * `setState` (`react-hooks/set-state-in-effect`), y no es un detalle de
     * estilo: con el efecto, el render intermedio pinta el compositor con el
     * texto de la sesión ANTERIOR y el navegador puede llegar a mostrarlo —el
     * borrador de otra junta, medio parpadeo, en el campo de ésta—. Ajustar el
     * estado DURANTE el render es el patrón que React documenta justo para
     * esto: React descarta el render a medias y vuelve a empezar con los
     * valores nuevos, sin pintar nada intermedio.
     *
     * También desaparece la `ref` que iba por delante del render y obligaba a
     * comparar antes de escribir en el efecto de guardado.
     */
    if (claveAnterior !== key) {
        setClaveAnterior(key);
        const recuperado = leer(key);
        setValueState(recuperado);
        setRestored(recuperado.length > 0);
    }

    // Guardado con retardo.
    useEffect(() => {
        const timer = setTimeout(() => escribir(key, value), DRAFT_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [key, value]);

    const setValue = useCallback((next: string | ((current: string) => string)) => {
        setValueState((current) => (typeof next === 'function' ? next(current) : next));
        // Teclear es aceptar el borrador recuperado: el aviso ya no aporta.
        setRestored(false);
    }, []);

    const discard = useCallback(() => {
        setValueState('');
        setRestored(false);
        escribir(key, '');
    }, [key]);

    const commit = useCallback(() => {
        setValueState('');
        setRestored(false);
        escribir(key, '');
    }, [key]);

    const restore = useCallback((text: string) => {
        // Si el usuario ya está escribiendo otra cosa no se le pisa: lo suyo
        // manda, y lo que falló ya está contado en el aviso.
        const next = valueRef.current || text;
        setValueState(next);
        setRestored(false);
        // Inmediato, sin esperar al retardo: si el fallo de envío viene de una
        // pestaña que se está cerrando, 400 ms no llegan.
        escribir(key, next);
    }, [key]);

    return { value, setValue, restored, discard, commit, restore };
}
