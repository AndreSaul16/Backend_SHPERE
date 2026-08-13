/**
 * Manejadores del stream propios de la junta (Board V2).
 *
 * Son los únicos que mueven el registro de burbujas: `onBoardAgent` decide quién
 * habla y por tanto a dónde van los tokens que vengan después. Comparten ese
 * registro con `streamHandlers` por referencia, no por copia.
 *
 * Todos escriben `boardSession` de forma condicional (`state.boardSession ? …`):
 * si no hay war-room —porque el envío era 1-a-1— un evento de junta no lo
 * resucita.
 */
import { v4 as uuidv4 } from 'uuid';
import type { StreamCallbacks } from '../../services/api';
import type { BoardPhase, BoardVote, Message, Role } from '../../types';
import { getBoardAgentByRole } from './agentCatalog';
import { reportStreamGlitch, type StreamContext } from './streamContext';
import type { BoardAgentStatus } from './types';

/** Sólo los eventos de junta: los demás los pone `createStreamHandlers`. */
export type BoardStreamCallbacks = Pick<
    StreamCallbacks,
    'onBoardStart' | 'onBoardPlan' | 'onBoardPhase' | 'onBoardVote' | 'onBoardConsensus' | 'onBoardIntervention' | 'onBoardAgent'
>;

export function createBoardStreamHandlers(ctx: StreamContext): BoardStreamCallbacks {
    const { set, get, sessionId, allAgents, burbujas, buffer } = ctx;

    return {
        onBoardStart: (data) => {
            // Confirmación visual de que el Board Meeting se disparó.
            // Insertamos una nota de sistema JUSTO ANTES de la burbuja
            // activa (estilo "X entró al grupo" de WhatsApp).
            try {
                const note = `**Junta Directiva en sesión** — debatiendo entre ${data.agents.join(', ')}.`;
                set((state) => {
                    const msgs = state.messagesBySession[sessionId] || [];
                    const idx = msgs.findIndex(m => m.id === burbujas.activaId);
                    const sysMsg: Message = {
                        id: uuidv4(),
                        role: 'system',
                        content: note,
                        timestamp: new Date(),
                    };
                    const next = [...msgs];
                    next.splice(idx >= 0 ? idx : next.length, 0, sysMsg);
                    return {
                        messagesBySession: { ...state.messagesBySession, [sessionId]: next },
                        boardSession: state.boardSession
                            ? { ...state.boardSession, active: true }
                            : state.boardSession,
                    };
                });
            } catch (e) {
                reportStreamGlitch('onBoardStart', e);
            }
        },

        onBoardPlan: (data) => {
            set((state) => ({
                boardSession: state.boardSession
                    ? {
                        ...state.boardSession,
                        active: true,
                        participants: data.participants,
                        cost: data.cost,
                        statusByRole: data.participants.reduce(
                            (acc, r) => ({ ...acc, [r]: 'idle' as BoardAgentStatus }),
                            { ...state.boardSession.statusByRole }
                        ),
                    }
                    : state.boardSession,
            }));
        },

        onBoardPhase: (data) => {
            set((state) => ({
                boardSession: state.boardSession
                    ? { ...state.boardSession, phase: data.phase as BoardPhase }
                    : state.boardSession,
            }));
        },

        onBoardVote: (data) => {
            const decision = (data.vote as BoardVote['decision']) || 'CONDICIONAL';
            const vote: BoardVote = {
                decision,
                // Misma regla que el lector del historial: la abstención no lleva cifra.
                confidence:
                    decision === 'ABSTENCION'
                        ? null
                        : typeof data.confidence === 'number'
                          ? data.confidence
                          : 50,
            };
            set((state) => {
                // Pintar el voto como chip en la última burbuja de ese rol.
                const bubbleId = burbujas.porRol[data.role];
                const msgs = (state.messagesBySession[sessionId] || []).map(m =>
                    m.id === bubbleId ? { ...m, vote } : m
                );
                return {
                    messagesBySession: { ...state.messagesBySession, [sessionId]: msgs },
                    boardSession: state.boardSession
                        ? {
                            ...state.boardSession,
                            votes: { ...state.boardSession.votes, [data.role]: vote },
                            statusByRole: { ...state.boardSession.statusByRole, [data.role]: 'done' },
                        }
                        : state.boardSession,
                };
            });
        },

        onBoardConsensus: (data) => {
            set((state) => ({
                boardSession: state.boardSession
                    ? {
                        ...state.boardSession,
                        tally: data.tally,
                        unanimous: data.unanimous,
                        earlyExit: data.early_exit,
                    }
                    : state.boardSession,
            }));
        },

        onBoardIntervention: (data) => {
            set((state) => ({
                boardSession: state.boardSession
                    ? { ...state.boardSession, lastIntervention: data.text }
                    : state.boardSession,
            }));
        },

        onBoardAgent: (data) => {
            // Board V2: cada agente (CEO apertura, CTO/CFO/CMO en paralelo,
            // devil, síntesis) abre SU propia burbuja, indexada por rol en
            // `burbujas.porRol`. El primer agente (CEO apertura) reclama la
            // burbuja inicial vacía; el resto crean burbuja nueva.
            try {
                // 4.8: aquí se LEE el contenido de la burbuja inicial para
                // decidir si está vacía y se puede reclamar. Con tokens
                // esperando en el buffer, la vería vacía y le robaría la
                // burbuja a quien ya estaba hablando. Vaciar es obligatorio.
                buffer.vaciar();
                const matchingAgent = getBoardAgentByRole(allAgents, data.role);
                const phase = data.phase as BoardPhase | undefined;
                const msgs = get().messagesBySession[sessionId] || [];
                const initial = msgs.find(m => m.id === burbujas.inicialId);
                const initialEmpty = !burbujas.reclamadaInicial && !!initial && !initial.content.trim() && !(initial.thinking || '').trim();

                if (initialEmpty) {
                    burbujas.reclamadaInicial = true;
                    burbujas.activaId = burbujas.inicialId;
                    burbujas.porRol[data.role] = burbujas.inicialId;
                    set((state) => ({
                        messagesBySession: {
                            ...state.messagesBySession,
                            [sessionId]: (state.messagesBySession[sessionId] || []).map(m =>
                                m.id === burbujas.inicialId
                                    ? { ...m, role: data.role as Role, agentId: matchingAgent?.id ?? m.agentId, isConclusion: data.is_conclusion, phase }
                                    : m
                            ),
                        },
                    }));
                } else {
                    const newId = uuidv4();
                    burbujas.activaId = newId;
                    burbujas.porRol[data.role] = newId;
                    set((state) => ({
                        messagesBySession: {
                            ...state.messagesBySession,
                            [sessionId]: [
                                ...(state.messagesBySession[sessionId] || []),
                                {
                                    id: newId,
                                    role: data.role as Role,
                                    content: '',
                                    timestamp: new Date(),
                                    agentId: matchingAgent?.id,
                                    isConclusion: data.is_conclusion,
                                    phase,
                                },
                            ],
                        },
                    }));
                }
                // Actualizar estado del war-room: este rol pasa a "hablando".
                set((state) => ({
                    boardSession: state.boardSession
                        ? {
                            ...state.boardSession,
                            active: true,
                            phase: phase ?? state.boardSession.phase,
                            statusByRole: { ...state.boardSession.statusByRole, [data.role]: 'speaking' },
                            devil: state.boardSession.devil || data.role === 'DEVIL',
                        }
                        : state.boardSession,
                }));
            } catch (e) {
                reportStreamGlitch('onBoardAgent', e);
            }
        },
    };
}
