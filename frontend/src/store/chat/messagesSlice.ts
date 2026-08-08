/**
 * El hilo y su transmisión: enviar, recibir por trozos y cortar.
 *
 * `sendMessage` se queda con lo que decide QUÉ se envía y cómo nace el turno;
 * lo que ocurre después con cada evento SSE vive en `streamHandlers` y
 * `boardStreamHandlers`, que comparten el registro de burbujas.
 */
import { v4 as uuidv4 } from 'uuid';
import { chatService } from '../../services/api';
import { NetworkError } from '../../lib/errors';
import type { Message, Role } from '../../types';
import { nuevoBoardSession } from './boardSession';
import { createBoardStreamHandlers } from './boardStreamHandlers';
import { GROUP_CHAT_ID } from './sessionIdentity';
import { nuevasBurbujas, type StreamContext } from './streamContext';
import { createStreamHandlers } from './streamHandlers';
import type { ChatGet, ChatSet, MessagesSlice } from './types';

export const createMessagesSlice = (set: ChatSet, get: ChatGet): MessagesSlice => ({
    messagesBySession: {},
    streamingSessionIds: [],
    abortController: null,

    getCurrentMessages: () => {
        const { currentSessionId, messagesBySession } = get();
        return currentSessionId ? (messagesBySession[currentSessionId] || []) : [];
    },

    sendMessage: async (content, opts) => {
        const regenerateFromId = opts?.regenerateFromId;
        const { currentSessionId, selectedAgentId } = get();
        const allAgents = get().getAgents();

        let sessionId = currentSessionId;
        if (!sessionId) {
            sessionId = await get().createNewSession(selectedAgentId || undefined);
        }

        // Regeneración: eliminar desde el mensaje clickeado para adelante,
        // SIN crear nuevo mensaje de usuario. El backend recibe el historial
        // truncado y continúa naturalmente desde donde quedó.
        if (regenerateFromId) {
            set((state) => {
                const msgs = [...(state.messagesBySession[sessionId!] || [])];
                const fromIdx = msgs.findIndex(m => m.id === regenerateFromId);
                // Si no se encuentra, no tocar nada (no debería pasar)
                const truncated = fromIdx >= 0 ? msgs.slice(0, fromIdx) : msgs;
                return {
                    messagesBySession: {
                        ...state.messagesBySession,
                        [sessionId!]: truncated,
                    },
                    streamingSessionIds: [...state.streamingSessionIds, sessionId!],
                    errorStates: { ...state.errorStates, send_message: null },
                };
            });
        } else {
            // Flujo normal: crear nuevo mensaje de usuario
            const userMsg: Message = {
                id: uuidv4(),
                role: 'user',
                content,
                timestamp: new Date(),
            };

            set((state) => ({
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId!]: [...(state.messagesBySession[sessionId!] || []), userMsg]
                },
                streamingSessionIds: [...state.streamingSessionIds, sessionId!],
                errorStates: { ...state.errorStates, send_message: null }
            }));
        }

        try {
            const selectedAgent = allAgents.find(a => a.id === selectedAgentId);
            const isGroup = selectedAgentId === GROUP_CHAT_ID;
            const targetRole: Role | undefined =
                (isGroup || !selectedAgent) ? undefined : selectedAgent?.role;

            // Placeholder inicial. En grupo arrancamos como "CEO" (el board siempre
            // abre con el CEO) para no mostrar una burbuja de sistema vacía mientras
            // el clasificador decide; board_agent / onRole la reetiquetan al instante.
            const botMsgId = uuidv4();
            const botMsg: Message = {
                id: botMsgId,
                role: (targetRole || (isGroup ? 'CEO' : 'system')) as Role,
                content: '',
                timestamp: new Date(),
                agentId: isGroup ? 'ceo-1' : (selectedAgentId || undefined),
            };

            set((state) => ({
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId!]: [...(state.messagesBySession[sessionId!] || []), botMsg]
                },
                // Reiniciar el estado del war-room en cada nuevo envío de grupo.
                boardSession: isGroup ? nuevoBoardSession() : null,
            }));

            // Usar una referencia local al sessionId para los callbacks
            const targetSessionId = sessionId!;

            // AbortController para permitir Stop Generation
            const abortController = new AbortController();
            set({ abortController });

            // El registro de burbujas es UNO y lo comparten los dos juegos de
            // manejadores: los eventos de junta lo mueven y el resto lo lee.
            const ctx: StreamContext = {
                set, get,
                sessionId: targetSessionId,
                allAgents,
                selectedAgentId,
                burbujas: nuevasBurbujas(botMsgId),
            };

            await chatService.streamChat(
                content,
                targetSessionId,
                {
                    ...createStreamHandlers(ctx),
                    ...createBoardStreamHandlers(ctx),
                },
                (targetRole as any) === "specialist" ? (selectedAgentId || undefined) : targetRole,
                abortController.signal,
                !!regenerateFromId,  // Pasar regenerate=true al backend cuando regeneramos
                isGroup ? 5 : 1  // Coste optimista: un board meeting descuenta 5 (A4)
            );
        } catch (error: any) {
            // No reportar error si fue una cancelación intencional (Stop Generation)
            if (error?.name === 'AbortError') {
                if (import.meta.env.DEV) console.log('🛑 Generación detenida por el usuario');
                return;
            }
            const sphereError = new NetworkError('Error en el flujo de transmisión', 'send_message', error);
            set((state) => ({
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
                errorStates: { ...state.errorStates, send_message: sphereError.message }
            }));
            set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [sessionId!]: null } }));
        }
    },

    stopGeneration: () => {
        const { abortController, currentSessionId } = get();
        if (abortController) {
            abortController.abort();
            if (import.meta.env.DEV) console.log('🛑 Stop Generation activado');
        }
        set((state) => ({
            abortController: null,
            streamingSessionIds: currentSessionId
                ? state.streamingSessionIds.filter(id => id !== currentSessionId)
                : [],
        }));
        // Limpiar referencia de artefacto en streaming si existe
        if (currentSessionId) {
            set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [currentSessionId]: null } }));
        }
    },
});
