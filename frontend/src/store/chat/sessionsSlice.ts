/**
 * Qué conversación está abierta y con quién: crear, listar, abrir y borrar.
 *
 * Aquí vive el P0 F2 (`loadSession`). Sus dos ramas —caché y servidor— resuelven
 * la identidad con la MISMA llamada, `identidadDeSesion`, que devuelve a la vez
 * el canal y el war-room. Antes divergían y ése fue exactamente el bug: la
 * junta se recargaba como chat 1-a-1 con el CEO y la mesa no se montaba nunca.
 */
import { chatService } from '../../services/api';
import { NetworkError, SessionError } from '../../lib/errors';
import { createGreeting } from './agentCatalog';
import { conError } from './errorsSlice';
import { mapSessionHistory } from './historyMapper';
import { GROUP_CHAT_ID, identidadDeSesion } from './sessionIdentity';
import type { ChatGet, ChatSet, SessionsSlice } from './types';

/** Los cinco de fábrica viajan por rol; el resto, por su id. */
const CORE_AGENT_IDS = ['group-chat', 'ceo-1', 'cto-1', 'cmo-1', 'cfo-1'];

export const createSessionsSlice = (set: ChatSet, get: ChatGet): SessionsSlice => ({
    sessions: [],
    currentSessionId: null,
    selectedAgentId: 'group-chat',
    sessionsByAgent: {}, // Mapeo agente → sesión para aislamiento de chats

    fetchSessions: async () => {
        try {
            const sessions = await chatService.getSessions();
            set({ sessions });
        } catch (error: any) {
            // Sin aviso a propósito: este fallo ya tiene canal visible. El
            // `errorStates.fetch_agents` que se escribe aquí abajo lo pinta
            // `ErrorOverlay`, que está montado en `App`. Un toast encima sería
            // el mismo error contado dos veces.
            const sphereError = new NetworkError('No se pudo cargar tu historial de juntas', 'fetch_agents', error);
            set(conError('fetch_agents', sphereError.message));
        }
    },

    createNewSession: async (agentId) => {
        set(conError('create_session', null));
        try {
            const targetId = agentId || GROUP_CHAT_ID;
            const allAgents = get().getAgents();
            const agent = allAgents.find(a => a.id === targetId);
            const isGroup = targetId === GROUP_CHAT_ID;
            const title = agent ? agent.name : 'Nueva Sesión';

            // Determine agent_ref_type: core agents use role strings, custom use UUIDs
            const isCoreAgent = CORE_AGENT_IDS.includes(targetId);
            const agentRefType = isCoreAgent ? 'core' : 'custom';
            const baseAgentId = isCoreAgent ? (agent?.role || 'CEO') : targetId;

            const newSession = await chatService.createSession({
                title,
                base_agent_id: baseAgentId,
                agent_ref_type: agentRefType,
                visual_config: agent ? {
                    name: agent.name,
                    color: agent.hexColor,
                    bubble_color: !isGroup ? agent.hexColor : undefined
                } : undefined,
                // user_id se obtiene del JWT en el backend
                type: isGroup ? 'group' : 'direct',
                members: isGroup ? allAgents.map(a => a.id) : [targetId]
            });
            const sessionId = newSession.session_id;

            set((state) => ({
                currentSessionId: sessionId,
                selectedAgentId: targetId,
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId]: [createGreeting(targetId, allAgents)]
                },
                sessions: [newSession, ...state.sessions],
                sessionsByAgent: {
                    ...state.sessionsByAgent,
                    [targetId]: sessionId
                },
                errorStates: { ...state.errorStates, create_session: null }
            }));

            return sessionId;
        } catch (error: any) {
            const sphereError = new SessionError('Error al crear la sesión', 'create_session', error);
            set(conError('create_session', sphereError.message));
            throw sphereError;
        }
    },

    loadSession: async (sessionId) => {
        const { messagesBySession } = get();
        const allAgents = get().getAgents();

        set(conError('load_history', null));

        if (messagesBySession[sessionId] && messagesBySession[sessionId].length > 0) {
            // Volver a una sesión ya cacheada. F2: esta rama ignoraba
            // `base_agent_id` por completo y se quedaba con el agente del primer
            // turno, así que perdía la identidad de junta igual que la otra.
            const cachedMessages = messagesBySession[sessionId];
            const session = get().sessions.find(s => s.session_id === sessionId);
            // El war-room pertenece a la sesión que se está mirando: si no es
            // una junta se retira, y si lo es se reconstruye del historial. Va
            // en la misma llamada que el canal justo para que las dos ramas no
            // puedan volver a divergir.
            const { agentId: detectedAgentId, boardSession } = identidadDeSesion(session, cachedMessages);

            if (import.meta.env.DEV) console.log('📦 [loadSession] Cache:', { sessionId, detectedAgentId });
            set({
                currentSessionId: sessionId,
                selectedAgentId: detectedAgentId,
                boardSession,
            });
            return;
        }

        set((state) => ({
            streamingSessionIds: [...state.streamingSessionIds, sessionId]
        }));

        try {
            const history = await chatService.getSessionHistory(sessionId);
            const { messages: mappedMessages, artifacts: sessionArtifacts } =
                mapSessionHistory(history.messages, sessionId, allAgents);

            set((state) => {
                // La identidad la manda la sesión; los mensajes sólo se miran
                // cuando la sesión no dice nada (F2, ver `resolveSessionAgentId`).
                const session = state.sessions.find(s => s.session_id === sessionId);
                const { agentId: detectedAgentId, boardSession } = identidadDeSesion(session, mappedMessages);

                if (import.meta.env.DEV) console.log('🌐 [loadSession] Servidor:', { sessionId, detectedAgentId, sessionBaseAgent: session?.base_agent_id });

                return {
                    currentSessionId: sessionId,
                    selectedAgentId: detectedAgentId,
                    // El war-room de un debate terminado se reconstruye del
                    // historial: hasta ahora sólo lo escribía el stream, así que
                    // al reabrir una junta la mesa no volvía a montarse jamás.
                    boardSession,
                    artifacts: [...state.artifacts, ...sessionArtifacts],
                    messagesBySession: {
                        ...state.messagesBySession,
                        [sessionId]: mappedMessages
                    },
                    streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId)
                };
            });
        } catch (error: any) {
            const sphereError = new NetworkError(
                'Fallo al recuperar el historial de la sesión',
                'load_history',
                error
            );
            set((state) => ({
                currentSessionId: sessionId,
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                errorStates: { ...state.errorStates, load_history: sphereError.message }
            }));
        }
    },

    selectAgent: (agentId) => {
        set({ selectedAgentId: agentId });
        if (import.meta.env.DEV) console.log(`🔌 Canal seleccionado: ${agentId}`);
    },

    // Sin `catch`: el rechazo sube tal cual y avisa `ChatSettingsPage`, que es
    // la única que sabe si lo que no se ha guardado era el nombre, el color o
    // el avatar. Avisar también desde aquí sería el mismo error dos veces.
    updateSessionMetadata: async (sessionId: string, updates: { title?: string; visual_config?: any; members?: string[] }) => {
        const updatedSession = await chatService.updateSession(sessionId, updates);

        set((state) => ({
            sessions: state.sessions.map(s =>
                s.session_id === sessionId ? { ...s, ...updatedSession } : s
            )
        }));

        if (import.meta.env.DEV) console.log('✅ [updateSessionMetadata] Success:', updatedSession);
    },

    // Sin `catch`: el rechazo sube tal cual y avisa `Sidebar.handleDelete`, que
    // es quien tiene el título de la junta. Emitir también desde aquí
    // duplicaría el aviso — es el fallo que rompió el primer intento de esta
    // tarea.
    deleteSession: async (sessionId: string) => {
        await chatService.deleteSession(sessionId);
        const { currentSessionId, messagesBySession } = get();

        // Limpiar mensajes del mapa
        const newMessages = { ...messagesBySession };
        delete newMessages[sessionId];

        set({
            sessions: get().sessions.filter(s => s.session_id !== sessionId),
            messagesBySession: newMessages,
            // Si era la sesión activa, limpiar → Welcome Screen
            ...(currentSessionId === sessionId ? {
                currentSessionId: null,
                selectedAgentId: null,
            } : {}),
        });

        if (import.meta.env.DEV) console.log('🗑️ [deleteSession] Sesión eliminada:', sessionId);
    },
});
