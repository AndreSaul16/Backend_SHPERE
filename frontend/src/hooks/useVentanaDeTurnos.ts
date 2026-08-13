import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * La ventana del transcript (tarea 4.9).
 *
 * ── El problema ────────────────────────────────────────────────────────────
 * `ChatPanel` monta TODOS los turnos. Cada uno es una burbuja con su markdown,
 * su tabla, su resaltado y sus cinco acciones; 300 turnos son varios miles de
 * nodos que el navegador tiene que maquetar y componer en cada scroll. El §2.3
 * del plan lo resume: «Sin virtualización → transcript largo = jank
 * garantizado».
 *
 * ── Por qué ESTA virtualización y no una librería ──────────────────────────
 * El plan pide «ventana propia con `IntersectionObserver`, sin dependencias», y
 * hay una razón de diseño detrás además del peso: una virtualización de ventana
 * deslizante clásica (la que desmonta también por ABAJO y calcula posiciones
 * absolutas sobre alturas estimadas) es incompatible con dos cosas que este
 * producto ya tiene:
 *
 *  - **El Canto** (§8.4) liga su cursor a la línea de tiempo de scroll con
 *    nombre que publica el transcript. Eso necesita un contenedor con scroll de
 *    verdad y un flujo normal; con posiciones absolutas y alturas estimadas, el
 *    recorrido del cursor deja de corresponder al documento.
 *    (El nombre de esa propiedad CSS no se escribe aquí ni en un comentario: el
 *    detector de clases muertas lee los literales del fichero y una propiedad
 *    con guion le parece una utilidad de Tailwind. Ya pasó en las fases 2 y 3.)
 *  - **Las alturas son desconocidas y cambian.** Un turno con una tabla, un
 *    diagrama y un bloque de código no mide lo mismo antes y después de que
 *    resuelva su `import()`. Estimar altura es exactamente de donde sale el
 *    temblor de scroll de las librerías genéricas.
 *
 * Así que la ventana sólo recorta por ARRIBA: se monta la cola del hilo —lo que
 * el usuario está mirando— y lo viejo se revela a medida que sube. Lo que se
 * pinta está siempre en flujo normal y con su altura real, así que el Canto
 * sigue funcionando y no hay saltos por estimación.
 *
 * Lo que sí cambia para el Canto: al revelar un tramo, el documento se hace más
 * largo y el cursor retrocede en su recorrido. Es honesto —«ahora vas por aquí
 * de un documento más largo»— y el ANCLAJE garantiza que el texto que se está
 * leyendo no se mueve ni un píxel mientras ocurre.
 *
 * ── Accesibilidad ──────────────────────────────────────────────────────────
 * El `IntersectionObserver` es la comodidad del ratón y del dedo. Lo que
 * garantiza el acceso es el BOTÓN que el componente pinta sobre el centinela:
 * quien navega con teclado o con lector de pantalla llega a él tabulando y
 * revela el tramo anterior sin depender de que haya ocurrido un scroll. Sin ese
 * botón, virtualizar sería esconder contenido.
 */

/** Por encima de esto se recorta. Por debajo, el hilo se monta entero. */
export const UMBRAL_DE_VENTANA = 80;

/** Cuántos turnos se revelan de golpe al subir. */
export const PASO_DE_VENTANA = 40;

export interface VentanaDeTurnos<T> {
    /** Los turnos que hay que pintar, en orden. */
    visibles: T[];
    /** Cuántos quedan por encima, sin montar. */
    ocultos: number;
    /** Si hay recorte activo (o sea, si hay que pintar el botón y el centinela). */
    recortando: boolean;
    /** Al `<div>` que va justo encima del primer turno visible. */
    centinela: (nodo: HTMLElement | null) => void;
    /** Revela el siguiente tramo. Es lo que hace el botón. */
    revelarMas: () => void;
    /** Revela el hilo entero de una vez. Lo usan la búsqueda y el salto de fase. */
    revelarTodo: () => void;
}

export interface OpcionesDeVentana {
    /** `false` desactiva el recorte entero (búsqueda, filtros). */
    activa?: boolean;
    umbral?: number;
    paso?: number;
}

/**
 * El contenedor con scroll que contiene a este nodo.
 *
 * El hook NO recibe el scroller como argumento, y no es capricho: pasarlo
 * —como `RefObject` o como getter que lee un `ref`— hace que el objeto que el
 * hook devuelve quede marcado como «valor de ref» para las reglas de
 * `react-hooks`, y entonces usarlo en el JSX es un error de lint («Cannot
 * access refs during render»). Y la regla tiene razón de fondo: un hook que
 * recibe el DOM de fuera para escribirlo esconde un efecto donde no se ve.
 *
 * El centinela ya vive DENTRO del contenedor, así que el contenedor se
 * encuentra subiendo. Es una operación de efecto, no de render.
 */
function contenedorConScroll(nodo: HTMLElement | null): HTMLElement | null {
    let actual = nodo?.parentElement ?? null;
    while (actual) {
        const desborde = getComputedStyle(actual).overflowY;
        if (desborde === 'auto' || desborde === 'scroll') return actual;
        actual = actual.parentElement;
    }
    return null;
}

export function useVentanaDeTurnos<T>(turnos: T[], opciones: OpcionesDeVentana): VentanaDeTurnos<T> {
    const {
        activa = true,
        umbral = UMBRAL_DE_VENTANA,
        paso = PASO_DE_VENTANA,
    } = opciones;

    const total = turnos.length;
    const [montados, setMontados] = useState(umbral);

    /**
     * El nodo centinela va en estado y no en una `ref` a propósito: es lo que
     * hace que el efecto del observador vuelva a correr cuando el nodo aparece
     * o desaparece. Con una `ref`, el efecto se montaría con `null` la primera
     * vez y no habría nada que observar.
     */
    const [nodoCentinela, setNodoCentinela] = useState<HTMLElement | null>(null);

    // Cuánto medía el hilo POR DEBAJO del punto de scroll justo antes de
    // revelar, y en qué contenedor. Es lo que se restaura después para que el
    // contenido que el usuario está mirando no se mueva ni un píxel. Se guarda
    // también el elemento porque al revelarlo todo el centinela se desmonta y
    // ya no habría desde dónde encontrarlo.
    const anclaje = useRef<{ cont: HTMLElement; desdeAbajo: number } | null>(null);

    const recortando = activa && total > umbral && montados < total;
    const desde = recortando ? Math.max(0, total - montados) : 0;
    const visibles = desde === 0 ? turnos : turnos.slice(desde);

    const revelar = useCallback((cuantos: number) => {
        const cont = contenedorConScroll(nodoCentinela);
        anclaje.current = cont ? { cont, desdeAbajo: cont.scrollHeight - cont.scrollTop } : null;
        setMontados((n) => n + cuantos);
    }, [nodoCentinela]);

    const revelarMas = useCallback(() => revelar(paso), [revelar, paso]);
    const revelarTodo = useCallback(() => revelar(Number.MAX_SAFE_INTEGER), [revelar]);

    /**
     * Restaurar el anclaje va en `useLayoutEffect` y no en un `useEffect`: hay
     * que corregir el scroll DESPUÉS de que el navegador haya maquetado los
     * turnos nuevos y ANTES de que pinte. Con `useEffect` el usuario ve el salto.
     */
    useLayoutEffect(() => {
        const pendiente = anclaje.current;
        if (pendiente === null) return;
        anclaje.current = null;
        pendiente.cont.scrollTop = pendiente.cont.scrollHeight - pendiente.desdeAbajo;
    }, [montados]);

    /**
     * El hilo crece por abajo mientras se transmite, y eso NO revela nada por
     * arriba: la ventana se mide sobre el total, así que al llegar un turno
     * nuevo se recorta uno viejo y el número de montados no crece solo.
     */
    useEffect(() => {
        if (!recortando || !nodoCentinela || typeof IntersectionObserver === 'undefined') return;

        const observador = new IntersectionObserver((entradas) => {
            if (entradas.some((e) => e.isIntersecting)) revelarMas();
        }, {
            // El contenedor con scroll, no el viewport: el transcript vive
            // dentro de una columna con su propio scroll.
            root: contenedorConScroll(nodoCentinela),
            // Medio viewport de antelación: revelar CUANDO ya se ve el borde es
            // revelar tarde, y se nota como un tirón.
            rootMargin: '50% 0px 0px 0px',
        });
        observador.observe(nodoCentinela);
        return () => observador.disconnect();
    }, [recortando, revelarMas, nodoCentinela, montados]);

    return {
        visibles,
        ocultos: desde,
        recortando,
        centinela: setNodoCentinela,
        revelarMas,
        revelarTodo,
    };
}
