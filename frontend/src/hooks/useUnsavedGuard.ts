/**
 * Guarda de cambios sin guardar — D63 (tarea 5.15).
 *
 * Cuatro formularios largos —el detalle de agente, el perfil, los ajustes de
 * perfil y los de la conversación— dejaban salir sin decir nada. El de agente
 * era el más sangrante: **calculaba `isDirty` y sólo lo usaba para atenuar el
 * botón de guardar**; un clic en el rail se llevaba por delante un prompt de
 * sistema reescrito entero.
 *
 * ── Por qué NO se usa `useBlocker` de Router 7 ──────────────────────────────
 *
 * Porque no se puede. `useBlocker` llama a `useDataRouterContext`, que LANZA
 * fuera de un router de datos, y esta aplicación monta `<BrowserRouter>`
 * (`main.tsx`), no `createBrowserRouter`. Migrar el enrutador entero para poner
 * una guarda es cambiar los cimientos por el tejado, y además rehacer las trece
 * rutas y sus pruebas. Queda anotado para quien migre: el día que el router sea
 * de datos, este hook se reduce a `useBlocker` y se borra la mitad de abajo.
 *
 * ── Qué cubre, entonces ─────────────────────────────────────────────────────
 *
 * 1. **Cerrar o recargar la pestaña**: `beforeunload`, que es el mecanismo del
 *    navegador y funciona igual con cualquier enrutador.
 * 2. **Navegar dentro de la aplicación**: se intercepta el clic en fase de
 *    CAPTURA sobre cualquier enlace interno. Es el caso real —pulsar una junta
 *    del historial, «Configuración», el logo— y el que se lleva el trabajo.
 *
 * ── Qué NO cubre, dicho aquí y no escondido ─────────────────────────────────
 *
 * El botón ATRÁS del navegador. Bloquearlo sin router de datos exige el truco
 * de empujar una entrada centinela al historial y volver a empujarla en cada
 * `popstate`, que deja el historial con entradas fantasma y rompe el gesto de
 * deslizar hacia atrás de iOS. Un remedio peor que la enfermedad. La solución
 * de verdad es el router de datos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface UnsavedGuard {
    /** `true` mientras el diálogo de confirmación tiene que estar abierto. */
    preguntando: boolean;
    /** Sale sin guardar y completa la navegación que se había frenado. */
    salir: () => void;
    /** Se queda donde está. */
    quedarse: () => void;
}

/** ¿Este enlace lleva a otra pantalla de esta misma aplicación? */
function destinoInterno(objetivo: EventTarget | null): string | null {
    const el = objetivo as HTMLElement | null;
    const enlace = el?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!enlace) return null;
    if (enlace.target && enlace.target !== '_self') return null;
    if (enlace.hasAttribute('download')) return null;
    // Un enlace externo se lo come `beforeunload`, que además es lo correcto:
    // ahí el navegador enseña su propio aviso y nosotros no pintamos nada.
    if (enlace.origin !== window.location.origin) return null;
    const destino = `${enlace.pathname}${enlace.search}${enlace.hash}`;
    const actual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return destino === actual ? null : destino;
}

/**
 * @param sucio `true` cuando hay cambios sin guardar.
 */
export function useUnsavedGuard(sucio: boolean): UnsavedGuard {
    const navigate = useNavigate();
    const [pendiente, setPendiente] = useState<string | null>(null);
    // Espejo para los escuchadores nativos, que se registran una vez y no
    // pueden cerrar sobre un `sucio` que cambia en cada pulsación.
    const sucioRef = useRef(sucio);
    useEffect(() => {
        sucioRef.current = sucio;
    }, [sucio]);

    // 1 · Cerrar o recargar. `preventDefault()` es lo que el estándar pide hoy;
    // `returnValue` sigue haciendo falta para los navegadores viejos y no
    // estorba en los nuevos.
    useEffect(() => {
        if (!sucio) return;
        const alSalir = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', alSalir);
        return () => window.removeEventListener('beforeunload', alSalir);
    }, [sucio]);

    // 2 · Navegación interna. Captura y no burbujeo: `<Link>` de Router llama a
    // `navigate()` en su propio manejador, y en fase de burbujeo la navegación
    // ya habría ocurrido antes de que llegásemos.
    useEffect(() => {
        if (!sucio) return;
        const alPulsar = (e: MouseEvent) => {
            // Los modificadores abren en otra pestaña: aquí no se pierde nada.
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (!sucioRef.current) return;
            const destino = destinoInterno(e.target);
            if (!destino) return;
            e.preventDefault();
            e.stopPropagation();
            setPendiente(destino);
        };
        document.addEventListener('click', alPulsar, true);
        return () => document.removeEventListener('click', alPulsar, true);
    }, [sucio]);

    const salir = useCallback(() => {
        const destino = pendiente;
        setPendiente(null);
        // Se apaga el espejo ANTES de navegar: si no, el propio `navigate` de
        // abajo podría volver a entrar por el interceptor.
        sucioRef.current = false;
        if (destino) navigate(destino);
    }, [navigate, pendiente]);

    const quedarse = useCallback(() => setPendiente(null), []);

    return { preguntando: pendiente !== null, salir, quedarse };
}
