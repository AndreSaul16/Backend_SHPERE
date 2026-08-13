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
import { notify } from '../../lib/toastBus';
import type { ChatSession, Message } from '../../types';
import type { SesionAPI } from '../../types/api';
import { createGreeting } from './agentCatalog';
import { conError } from './errorsSlice';
import { mapSessionHistory } from './historyMapper';
import { GROUP_CHAT_ID, identidadDeSesion } from './sessionIdentity';
import type { ChatGet, ChatSet, SessionsSlice } from './types';

/**
 * De lo que manda el backend a lo que el frontend garantiza (D43 · 7.4).
 *
 * `getSessions()` decía `Promise<any[]>` y su resultado se metía en el store
 * tal cual. `ChatSession` promete `visual_config`, `context_files`,
 * `enabled_tools` y `members` SIEMPRE presentes, y el backend los omite en las
 * sesiones antiguas: media docena de `.map()` por el código leían de
 * `undefined` y sólo no reventaban por casualidad. Los huecos se rellenan aquí,
 * una vez, en el borde.
 */
export function aSesionDelFrontend(api: SesionAPI): ChatSession {
    return {
        session_id: api.session_id,
        user_id: api.user_id ?? '',
        title: api.title ?? 'Sin título',
        base_agent_id: api.base_agent_id ?? 'CEO',
        agent_ref_type: api.agent_ref_type ?? 'core',
        type: api.type ?? 'direct',
        visual_config: api.visual_config ?? {},
        context_files: api.context_files ?? [],
        enabled_tools: api.enabled_tools ?? [],
        members: api.members ?? [],
        folder: api.folder,
        tags: api.tags,
        pinned_messages: api.pinned_messages,
        created_at: api.created_at ?? new Date().toISOString(),
        share_token: api.share_token ?? null,
    };
}

/** Los cinco de fábrica viajan por rol; el resto, por su id. */
const CORE_AGENT_IDS = ['group-chat', 'ceo-1', 'cto-1', 'cmo-1', 'cfo-1'];

/**
 * Ventana para deshacer un borrado — PLAN §6 Q5.
 *
 * Ocho segundos, que es exactamente lo que dura un aviso de tipo `warning`
 * (§9.5): mientras el aviso con «Deshacer» está en pantalla, la junta todavía
 * existe. Cuando el aviso se va, el borrado ya ha salido. El plazo y el aviso
 * son la misma cosa vista por delante y por detrás.
 */
export const VENTANA_DESHACER_MS = 8000;

interface BorradoPendiente {
    timer: ReturnType<typeof setTimeout>;
    /**
     * El plazo ya venció y la petición de borrado está en el aire.
     *
     * Hace falta porque la entrada NO se puede tirar al lanzar la petición: si
     * el backend la rechaza, esto es lo único que sabe cómo devolver la junta.
     * Y mientras esté en vuelo, «Deshacer» tiene que negarse — restaurar en
     * local mientras el servidor borra de verdad dejaría una junta fantasma que
     * desaparece al recargar.
     */
    enVuelo: boolean;
    /** Todo lo que hay que devolver a su sitio si el usuario se arrepiente. */
    session: ChatSession;
    indice: number;
    messages: Message[] | undefined;
    eraLaAbierta: boolean;
    agenteAbierto: string | null;
}

/**
 * Los borrados en su ventana. Viven en el módulo y no en el estado porque
 * nadie los pinta: la junta ya ha desaparecido de la lista. Lo que se guarda
 * aquí es cómo devolverla.
 */
const borradosPendientes = new Map<string, BorradoPendiente>();

/** Sólo para tests: cancela los plazos vivos entre casos. */
export function olvidarBorradosPendientes(): void {
    for (const { timer } of borradosPendientes.values()) clearTimeout(timer);
    borradosPendientes.clear();
}

export const createSessionsSlice = (set: ChatSet, get: ChatGet): SessionsSlice => ({
    sessions: [],
    historialCargado: false,
    currentSessionId: null,
    selectedAgentId: 'group-chat',
    sessionsByAgent: {}, // Mapeo agente → sesión para aislamiento de chats

    fetchSessions: async () => {
        try {
            const sessions = (await chatService.getSessions()).map(aSesionDelFrontend);
            set({ sessions, historialCargado: true });
        } catch (error: unknown) {
            // Sin aviso a propósito: este fallo ya tiene canal visible. El
            // `errorStates.fetch_agents` que se escribe aquí abajo lo pinta
            // `ErrorOverlay`, que está montado en `App`. Un toast encima sería
            // el mismo error contado dos veces.
            const sphereError = new NetworkError('No se pudo cargar tu historial de juntas', 'fetch_agents', error);
            // Cargado también cuando falla: el esqueleto no se queda a vivir.
            // El fallo tiene su propio canal (`ErrorOverlay`), y por debajo la
            // barra enseña el vacío con su acción en vez de latir para siempre.
            set((state) => ({ ...conError('fetch_agents', sphereError.message)(state), historialCargado: true }));
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
            const sesion = aSesionDelFrontend(newSession);
            const sessionId = sesion.session_id;

            set((state) => ({
                currentSessionId: sessionId,
                selectedAgentId: targetId,
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId]: [createGreeting(targetId, allAgents)]
                },
                sessions: [sesion, ...state.sessions],
                sessionsByAgent: {
                    ...state.sessionsByAgent,
                    [targetId]: sessionId
                },
                errorStates: { ...state.errorStates, create_session: null }
            }));

            return sessionId;
        } catch (error: unknown) {
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
                mapSessionHistory(history.messages ?? [], sessionId, allAgents);

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
        } catch (error: unknown) {
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
    updateSessionMetadata: async (sessionId, updates) => {
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

    /**
     * Q5 — borrar una junta deja de ser irreversible.
     *
     * Borrar destruía un debate de cinco créditos y su acta al instante. La
     * defensa era un diálogo de confirmación, que es la clase de barrera que se
     * pulsa sin leer. Esto invierte el trato: la junta desaparece de la vista
     * ya, y durante ocho segundos se puede recuperar entera —turnos incluidos—
     * porque no se ha borrado nada todavía.
     */
    deleteSessionConDeshacer: (sessionId: string) => {
        const { sessions, messagesBySession, currentSessionId, selectedAgentId } = get();
        const indice = sessions.findIndex(s => s.session_id === sessionId);
        if (indice < 0) return false;

        // Un segundo borrado del mismo id no puede pisar el plazo del primero.
        if (borradosPendientes.has(sessionId)) return false;

        const session = sessions[indice];
        const eraLaAbierta = currentSessionId === sessionId;
        const mensajes = messagesBySession[sessionId];

        // Desaparece de la vista. Lo que se guarda arriba es cómo devolverla.
        const restantes = { ...messagesBySession };
        delete restantes[sessionId];
        set({
            sessions: sessions.filter(s => s.session_id !== sessionId),
            messagesBySession: restantes,
            ...(eraLaAbierta ? { currentSessionId: null, selectedAgentId: null } : {}),
        });

        const timer = setTimeout(() => {
            const pendiente = borradosPendientes.get(sessionId);
            if (!pendiente) return;
            pendiente.enVuelo = true;
            chatService.deleteSession(sessionId)
                .then(() => { borradosPendientes.delete(sessionId); })
                .catch(() => {
                    // Reversión visible y explicada: la junta vuelve a la lista
                    // y se dice por qué, porque el usuario ya la daba por
                    // borrada. Sin esto la habría perdido de vista sin que se
                    // hubiera borrado — lo peor de los dos mundos.
                    //
                    // Avisa el store, que es la excepción a la regla de
                    // `errorsSlice` («avisa el componente, que sabe qué
                    // intentaba el usuario»): ocho segundos después puede no
                    // quedar componente vivo, y el store es el único que sabe
                    // que este borrado estaba en vuelo.
                    pendiente.enVuelo = false;
                    deshacerBorrado(set, get, sessionId);
                    notify({
                        title: `«${session.title}» no se ha podido eliminar`,
                        detail: 'La junta ha vuelto a tu historial con su debate y su acta intactos.',
                        variant: 'error',
                        dedupeKey: `borrado:${sessionId}`,
                    });
                });
        }, VENTANA_DESHACER_MS);

        borradosPendientes.set(sessionId, {
            timer,
            enVuelo: false,
            session,
            indice,
            messages: mensajes,
            eraLaAbierta,
            agenteAbierto: selectedAgentId,
        });
        return true;
    },

    undoDeleteSession: (sessionId: string) => {
        // Si la petición ya salió, deshacer sería mentir: el servidor está
        // borrando. La ventana coincide con la vida del aviso justo para que
        // este caso sea inalcanzable desde la interfaz.
        if (borradosPendientes.get(sessionId)?.enVuelo) return false;
        return deshacerBorrado(set, get, sessionId);
    },
});

/**
 * Devuelve la junta a su sitio: a su posición en la lista, con sus turnos y,
 * si era la que estaba abierta, reabierta.
 */
function deshacerBorrado(set: ChatSet, get: ChatGet, sessionId: string): boolean {
    const pendiente = borradosPendientes.get(sessionId);
    if (!pendiente) return false;
    clearTimeout(pendiente.timer);
    borradosPendientes.delete(sessionId);

    const { sessions, messagesBySession } = get();
    // A su hueco original: reaparecer arriba del todo también es perder algo.
    const restauradas = [...sessions];
    restauradas.splice(Math.min(pendiente.indice, restauradas.length), 0, pendiente.session);

    set({
        sessions: restauradas,
        messagesBySession: pendiente.messages
            ? { ...messagesBySession, [sessionId]: pendiente.messages }
            : messagesBySession,
        ...(pendiente.eraLaAbierta
            ? { currentSessionId: sessionId, selectedAgentId: pendiente.agenteAbierto }
            : {}),
    });
    return true;
}
