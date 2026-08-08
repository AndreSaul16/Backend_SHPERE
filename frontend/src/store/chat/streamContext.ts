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

/** Todo lo que un manejador del stream necesita para escribir en el store. */
export interface StreamContext {
    set: ChatSet;
    get: ChatGet;
    /** Referencia local a la sesión: los callbacks no pueden fiarse de `currentSessionId`. */
    sessionId: string;
    allAgents: Agent[];
    selectedAgentId: string | null;
    burbujas: BurbujasEnVuelo;
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
