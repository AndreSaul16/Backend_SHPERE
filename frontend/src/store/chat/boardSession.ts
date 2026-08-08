/**
 * El war-room como dato: cómo nace y cómo se reconstruye.
 *
 * Funciones puras, sin `set`/`get`. Sus dos consumidores son el stream SSE
 * —que crea uno en blanco al abrir un envío de junta— y `loadSession`, que
 * reconstruye el de un debate ya cerrado a partir del historial.
 */
import type { Message, BoardVote, BoardPhase } from '../../types';
import type { BoardSessionState, BoardAgentStatus } from './types';

/**
 * War-room recién estrenado, el que abre cada envío a la junta.
 *
 * Nace con `active: false`: hasta que el backend anuncia el debate no hay mesa
 * que enseñar, y `ChatPanel` lo distingue con `hayMesaQueEnsenar`.
 */
export const nuevoBoardSession = (): BoardSessionState => ({
    active: false, phase: null, participants: [], statusByRole: {},
    votes: {}, tally: null, unanimous: false, earlyExit: false,
    cost: 5, devil: false, lastIntervention: null,
});

/**
 * F2 (segunda mitad) — reconstruir el war-room de un debate ya terminado.
 *
 * `boardSession` sólo lo escribían los eventos SSE del stream, así que al
 * reabrir una junta no había de dónde sacar la mesa: la banda no volvía a
 * aparecer nunca, ni siquiera con la sesión bien identificada.
 *
 * Todo lo que la banda necesita ya viaja persistido en los mensajes
 * (`additional_kwargs.board_vote`, `board_phase`, `agent_role`), que es lo que
 * `loadSession` acaba de mapear. Lo único que NO se puede reconstruir es el
 * coste real del debate —3 o 5 créditos, lo decide el triage y no se guarda en
 * el historial—; se deja en el precio de catálogo (5) y **si se quiere exacto
 * hace falta que el backend persista `board_cost` en la sesión**.
 *
 * Devuelve `null` si la sesión no tiene rastro de debate, para no pintar una
 * mesa vacía sobre un chat normal.
 */
export function rebuildBoardSession(messages: Message[]): BoardSessionState | null {
    const turnos = messages.filter(m => m.role !== 'user' && m.role !== 'system');
    if (turnos.length === 0) return null;

    const votes: Record<string, BoardVote> = {};
    const statusByRole: Record<string, BoardAgentStatus> = {};
    const participants: string[] = [];
    let devil = false;
    let phase: BoardPhase | null = null;

    for (const m of turnos) {
        const role = m.role as string;
        if (role === 'DEVIL') devil = true;
        else if (!participants.includes(role)) participants.push(role);
        statusByRole[role] = 'done';
        if (m.vote) votes[role] = m.vote;
        if (m.phase) phase = m.phase;
    }

    // Rastro de junta: o votó alguien, o hubo fases, o hablaron ≥2 directores.
    const esDebate = Object.keys(votes).length > 0 || phase !== null || participants.length > 1 || devil;
    if (!esDebate) return null;

    const tally = Object.values(votes).reduce<Record<string, number>>((acc, v) => {
        acc[v.decision] = (acc[v.decision] ?? 0) + 1;
        return acc;
    }, {});

    return {
        // `active` significa «hay un debate EN VUELO», y este ya terminó: la
        // banda se monta igual (ver `ChatPanel`), pero nada la trata como viva.
        active: false,
        phase,
        participants,
        statusByRole,
        votes,
        tally: Object.keys(tally).length > 0 ? tally : null,
        unanimous: Object.keys(tally).length === 1 && Object.keys(votes).length > 1,
        earlyExit: false,
        cost: 5,
        devil,
        lastIntervention: null,
    };
}
