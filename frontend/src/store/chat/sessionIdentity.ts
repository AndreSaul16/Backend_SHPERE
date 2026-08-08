/**
 * Qué es una sesión que se reabre: con quién se habla y qué mesa se monta.
 *
 * Es el corazón del P0 F2. `loadSession` tiene DOS ramas —caché y servidor— y
 * el bug original fue precisamente que divergían. Por eso las dos llaman a
 * `identidadDeSesion`, que devuelve las dos respuestas de una vez: si una rama
 * se olvidase del war-room, no compilaría.
 */
import type { Message, ChatSession } from '../../types';
import type { BoardSessionState } from './types';
import { rebuildBoardSession } from './boardSession';

/** El identificador de la junta. Es un valor legítimo, nunca un centinela. */
export const GROUP_CHAT_ID = 'group-chat';

/**
 * F2 (P0) — qué agente identifica a una sesión que se reabre.
 *
 * El código anterior escribía `session?.base_agent_id || 'group-chat'` y acto
 * seguido `if (detectedAgentId === 'group-chat') { …inferir del primer turno… }`.
 * O sea que `'group-chat'` hacía DOS papeles a la vez: centinela de «no hay
 * valor» y valor legítimo —el que identifica a una junta—. Resultado: la única
 * sesión que sí traía identidad de grupo era precisamente la que la perdía, y
 * al recargar una junta se volvía un chat 1-a-1 con el CEO (`isGroupChat`
 * falso → sin mesa de directores, coste «1 por mensaje», y todas las burbujas
 * con el color del CEO).
 *
 * Aquí «ausente» es `undefined`/`''`, y `'group-chat'` es un valor como
 * cualquier otro. Sólo se infiere de los mensajes cuando la sesión no dice nada.
 */
export function resolveSessionAgentId(
    session: Pick<ChatSession, 'base_agent_id' | 'type'> | undefined,
    messages: Message[],
): string {
    const base = session?.base_agent_id;
    if (typeof base === 'string' && base.trim() !== '') return base;

    // Sin `base_agent_id`: el tipo de sesión sigue siendo prueba de junta.
    if (session?.type === 'group') return GROUP_CHAT_ID;

    const agentIds = messages
        .filter(m => m.agentId && m.agentId !== 'system')
        .map(m => m.agentId as string);
    return agentIds.length > 0 ? agentIds[0] : GROUP_CHAT_ID;
}

export interface IdentidadDeSesion {
    /** El canal que queda seleccionado al abrir la sesión. */
    agentId: string;
    /**
     * El war-room que corresponde a esta sesión: reconstruido si es una junta
     * con rastro de debate, y `null` si no lo es —para retirar la mesa de la
     * sesión anterior, que era de otra conversación—.
     */
    boardSession: BoardSessionState | null;
}

/**
 * Las dos respuestas que `loadSession` necesita, resueltas juntas.
 *
 * Que vayan juntas no es comodidad: antes de F2 el `boardSession` sólo lo
 * escribía el stream, y separarlo otra vez de la identidad de la sesión es
 * justo lo que hacía que la mesa no volviera a montarse jamás al recargar.
 */
export function identidadDeSesion(
    session: Pick<ChatSession, 'base_agent_id' | 'type'> | undefined,
    messages: Message[],
): IdentidadDeSesion {
    const agentId = resolveSessionAgentId(session, messages);
    const esJunta = agentId === GROUP_CHAT_ID;
    return { agentId, boardSession: esJunta ? rebuildBoardSession(messages) : null };
}
