/**
 * El estado que los ~20 manejadores del stream comparten mientras dura un envío.
 *
 * En el fichero de 1267 líneas esto eran tres variables sueltas dentro de
 * `sendMessage` (`activeBotMsgId`, `bubbleByRole`, `claimedInitial`), atrapadas
 * por cierre en cada callback. Al partir los manejadores en dos módulos hay que
 * pasarlas explícitamente y —esto es lo importante— **como un único objeto
 * mutable compartido**: si cada módulo se quedara con su copia, los tokens del
 * CFO acabarían en la burbuja del CTO.
 */
import type { Agent } from '../../types';
import { notify, reasonOf } from '../../lib/toastBus';
import type { ChatGet, ChatSet } from './types';

/** A qué burbuja va cada cosa que llega por el hilo. */
export interface BurbujasEnVuelo {
    /** La burbuja que `sendMessage` abre vacía antes del primer evento. */
    readonly inicialId: string;
    /** Destino de lo que llega sin rol. Cambia con cada `onBoardAgent`. */
    activaId: string;
    /** rol → burbuja. Los directores debaten en paralelo y se intercalan. */
    readonly porRol: Record<string, string>;
    /** ¿Alguien reclamó ya la burbuja inicial vacía? La reclama el primero. */
    reclamadaInicial: boolean;
}

export const nuevasBurbujas = (inicialId: string): BurbujasEnVuelo => ({
    inicialId,
    activaId: inicialId,
    porRol: {},
    reclamadaInicial: false,
});

/**
 * ── El buffer de fotograma (tarea 4.8 · D22) ────────────────────────────────
 *
 * El problema, medido: `onToken` hacía un `set` por token, y ese `set`
 * reconstruye el hilo entero con un `.map()`. Con 100 turnos en pantalla y un
 * modelo emitiendo a 40-60 tokens/s, eso son 60 recorridos de 100 elementos por
 * segundo — 6.000 objetos nuevos por segundo — y cada uno arrastra un render de
 * React. El fotograma dura 16,6 ms: no cabe.
 *
 * Lo que hace este buffer: acumula los añadidos POR BURBUJA y los aplica todos
 * juntos, UNA vez por fotograma, en un solo `set` con un solo `.map()`. Diez
 * tokens que llegan dentro del mismo fotograma se escriben una vez.
 *
 * Tres invariantes que NO se pueden romper (riesgo R5 del plan):
 *
 *  1. **No se pierde un token.** Todo lo encolado se escribe: en el fotograma
 *     siguiente, o antes si alguien llama a `vaciar()`.
 *  2. **No se desordenan.** El buffer es un `Map` por id de burbuja y dentro de
 *     cada uno se concatena en orden de llegada. Los directores debatiendo en
 *     paralelo escriben en burbujas DISTINTAS, así que no compiten. Es el mismo
 *     mecanismo que ya gobernaba el destino: `burbujas.porRol`.
 *  3. **Todo lo que se añade a una burbuja pasa por aquí.** Los marcadores de
 *     utensilio y de artefacto también. Si el texto se escribiera directo
 *     mientras los tokens esperan, el marcador aterrizaría ANTES que tokens que
 *     llegaron antes que él, y el turno saldría con las frases cambiadas de
 *     sitio.
 *
 * §7.4 prohíbe animar el texto en streaming, y esto no lo anima: agrupa
 * escrituras. El texto sigue apareciendo por trozos, sin transición ninguna.
 */
export interface BufferDeTurno {
    /** Encola texto al final del contenido de una burbuja. */
    texto: (bubbleId: string, trozo: string) => void;
    /** Encola razonamiento al final del `thinking` de una burbuja. */
    razonamiento: (bubbleId: string, trozo: string) => void;
    /** Escribe YA lo pendiente. Obligatorio antes de leer el contenido. */
    vaciar: () => void;
    /** ¿Hay algo esperando? Sólo para las pruebas. */
    pendiente: () => number;
}

/** Un fotograma, o lo más parecido que haya en este entorno. */
const enElSiguienteFotograma = (fn: () => void): number =>
    typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        // Sin rAF (un entorno sin DOM) el buffer sigue siendo correcto: agrupa
        // por macrotarea en vez de por fotograma. Lo que nunca hace es perder
        // lo encolado.
        : (setTimeout(fn, 16) as unknown as number);

const cancelarFotograma = (id: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    else clearTimeout(id);
};

interface Añadido { texto: string; razonamiento: string }

export function crearBufferDeTurno(set: ChatSet, sessionId: string): BufferDeTurno {
    let lote = new Map<string, Añadido>();
    let fotograma: number | null = null;

    const entrada = (bubbleId: string): Añadido => {
        let a = lote.get(bubbleId);
        if (!a) { a = { texto: '', razonamiento: '' }; lote.set(bubbleId, a); }
        return a;
    };

    const vaciar = () => {
        if (fotograma !== null) { cancelarFotograma(fotograma); fotograma = null; }
        if (lote.size === 0) return;
        // Se cambia el `Map` ANTES del `set`: si algo dentro del `set` volviera
        // a encolar, iría al lote siguiente y no se perdería ni se duplicaría.
        const aplicar = lote;
        lote = new Map();
        set((state) => ({
            messagesBySession: {
                ...state.messagesBySession,
                [sessionId]: (state.messagesBySession[sessionId] || []).map((m) => {
                    const a = aplicar.get(m.id);
                    if (!a) return m;
                    // Se devuelve la MISMA referencia cuando no hay nada que
                    // añadir a esta burbuja: es lo que permite que `React.memo`
                    // de la burbuja (4.7) descarte el render.
                    if (!a.texto && !a.razonamiento) return m;
                    return {
                        ...m,
                        ...(a.texto ? { content: m.content + a.texto } : null),
                        ...(a.razonamiento ? { thinking: (m.thinking || '') + a.razonamiento } : null),
                    };
                }),
            },
        }));
    };

    const programar = () => {
        if (fotograma === null) fotograma = enElSiguienteFotograma(() => { fotograma = null; vaciar(); });
    };

    return {
        texto: (bubbleId, trozo) => { entrada(bubbleId).texto += trozo; programar(); },
        razonamiento: (bubbleId, trozo) => { entrada(bubbleId).razonamiento += trozo; programar(); },
        vaciar,
        pendiente: () => lote.size,
    };
}

/** Todo lo que un manejador del stream necesita para escribir en el store. */
export interface StreamContext {
    set: ChatSet;
    get: ChatGet;
    /** Referencia local a la sesión: los callbacks no pueden fiarse de `currentSessionId`. */
    sessionId: string;
    allAgents: Agent[];
    selectedAgentId: string | null;
    burbujas: BurbujasEnVuelo;
    /** Agrupa las escrituras de texto en una por fotograma (4.8). */
    buffer: BufferDeTurno;
}

/** La burbuja a la que va un evento: la de su rol si la tiene, o la activa. */
export const destinoDe = (burbujas: BurbujasEnVuelo, role?: string | null): string =>
    (role && burbujas.porRol[role]) ? burbujas.porRol[role] : burbujas.activaId;

/**
 * Fallo AL PINTAR un evento del stream que sí llegó (`onBoardStart`,
 * `onBoardAgent`, `onThinking`). No es un fallo de red: el debate se queda a
 * medias y nadie se entera, porque hasta ahora esto sólo se veía en la consola
 * y encima sólo en desarrollo.
 *
 * Es `warning`, no `error`: lo ya escrito sigue en el hilo y no hay nada que
 * reintentar. Y lleva `dedupeKey` fijo porque `onThinking` corre por token: sin
 * él, un debate roto apilaría un aviso por pieza de texto.
 */
export function reportStreamGlitch(evento: string, e: unknown): void {
    notify({
        title: 'Se ha perdido parte del debate',
        detail: `${reasonOf(e) ?? `Un turno no se pudo pintar (${evento})`}. Lo ya escrito sigue en el hilo.`,
        variant: 'warning',
        dedupeKey: 'stream-glitch',
    });
}
