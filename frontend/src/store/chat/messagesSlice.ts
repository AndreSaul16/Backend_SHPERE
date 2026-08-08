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
import { crearBufferDeTurno, nuevasBurbujas, type BufferDeTurno, type StreamContext } from './streamContext';
import { createStreamHandlers } from './streamHandlers';
import type { ChatGet, ChatSet, MessagesSlice } from './types';

/**
 * Marca como interrumpido el último turno del asistente de una sesión.
 *
 * No se toca el contenido: lo que se haya escrito hasta el corte se conserva
 * tal cual, que es la mitad del mensaje que el usuario necesita («no has
 * perdido nada»). La otra mitad —qué hacer— la pinta el hilo a partir de este
 * indicador.
 */
function marcarUltimoInterrumpido(
    porSesion: Record<string, Message[]>,
    sessionId: string,
): Record<string, Message[]> {
    const hilo = porSesion[sessionId];
    if (!hilo || hilo.length === 0) return porSesion;
    const ultimo = hilo[hilo.length - 1];
    if (ultimo.role === 'user') return porSesion;
    return {
        ...porSesion,
        [sessionId]: [...hilo.slice(0, -1), { ...ultimo, interrupted: true }],
    };
}

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
        /**
         * Q12 (5.11) — lo que se regenera NO se tira.
         *
         * `regenerateFromId` trunca el hilo desde esa burbuja, así que hasta
         * ahora la respuesta anterior desaparecía sin dejar rastro: quien había
         * gastado créditos en dos versiones se quedaba con una y sin forma de
         * comparar. Se guarda su contenido —y las versiones que ella misma ya
         * arrastraba— para colgárselo a la burbuja nueva.
         *
         * Un turno vacío no cuenta como versión: regenerar un turno que se
         * cortó antes de escribir nada no tiene «v1» que ofrecer.
         */
        let versionesHeredadas: string[] = [];

        if (regenerateFromId) {
            set((state) => {
                const msgs = [...(state.messagesBySession[sessionId!] || [])];
                const fromIdx = msgs.findIndex(m => m.id === regenerateFromId);
                const anterior = fromIdx >= 0 ? msgs[fromIdx] : undefined;
                if (anterior?.content?.trim()) {
                    versionesHeredadas = [...(anterior.versionesPrevias ?? []), anterior.content];
                }
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

        // Vive fuera del `try` porque el `catch` necesita saber si el abortador
        // que hay en el store sigue siendo el de ESTE envío.
        let abortRef: AbortController | null = null;
        // 4.8: y el buffer también, porque las dos salidas por `catch` escriben
        // en el hilo y tienen que hacerlo DESPUÉS de lo que quedara encolado.
        let bufferDelEnvio: BufferDeTurno | null = null;

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
                // Q12: la versión anterior viaja con la nueva burbuja.
                ...(versionesHeredadas.length ? { versionesPrevias: versionesHeredadas } : {}),
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
            abortRef = abortController;
            set({ abortController });

            // El registro de burbujas es UNO y lo comparten los dos juegos de
            // manejadores: los eventos de junta lo mueven y el resto lo lee.
            // 4.8 · D22: el buffer es de ESTE envío, no global. Así el `set`
            // que vacía toca sólo el hilo de esta sesión, y dos juntas abiertas
            // a la vez no comparten cola.
            const buffer = crearBufferDeTurno(set, targetSessionId);
            bufferDelEnvio = buffer;

            const ctx: StreamContext = {
                set, get,
                sessionId: targetSessionId,
                allAgents,
                selectedAgentId,
                burbujas: nuevasBurbujas(botMsgId),
                buffer,
            };

            await chatService.streamChat(
                content,
                targetSessionId,
                {
                    ...createStreamHandlers(ctx),
                    ...createBoardStreamHandlers(ctx),
                },
                // Un agente a medida viaja por su id, no por su rol: el rol
                // de todos ellos es «specialist» y el backend no sabría a cuál.
                targetRole === "specialist" ? (selectedAgentId || undefined) : targetRole,
                abortController.signal,
                !!regenerateFromId,  // Pasar regenerate=true al backend cuando regeneramos
                isGroup ? 5 : 1  // Coste optimista: un board meeting descuenta 5 (A4)
            );

            // El stream ha terminado. Lo que quede encolado se escribe ya: no
            // hay fotograma siguiente que esperar, y un turno no puede quedarse
            // con la última frase a medias porque el buffer no llegó a vaciar.
            buffer.vaciar();
        } catch (error: unknown) {
            // Lo escrito hasta el corte se conserva, y eso incluye lo que
            // estuviera esperando fotograma. Va ANTES de tocar el hilo.
            bufferDelEnvio?.vaciar();
            // Una cancelación NO es un fallo: no escribe error ni marca el turno
            // como interrumpido. Pero sí tiene que apagar el «está escribiendo».
            //
            // Aquí había un `return` seco. Consecuencia real: cualquier aborte
            // que no viniera de `stopGeneration` —desmontar la vista, cambiar de
            // sesión, un `signal` abortado por el navegador— dejaba el id dentro
            // de `streamingSessionIds` PARA SIEMPRE. Con eso el compositor queda
            // deshabilitado con «Sistema ocupado…», el indicador de escritura no
            // para nunca y la única salida es recargar. Es un callejón sin
            // salida provocado por un `return`.
            if (error instanceof Error && error.name === 'AbortError') {
                if (import.meta.env.DEV) console.log('🛑 Generación detenida por el usuario');
                set((state) => ({
                    streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                    // El abortador se suelta sólo si sigue siendo el de ESTE
                    // envío: si el usuario ya ha lanzado otro turno, anularlo
                    // aquí le quitaría el botón de detener al turno nuevo.
                    ...(state.abortController === abortRef ? { abortController: null } : {}),
                    streamingArtifactBySession: {
                        ...state.streamingArtifactBySession,
                        [sessionId!]: null,
                    },
                }));
                return;
            }
            const sphereError = new NetworkError('Error en el flujo de transmisión', 'send_message', error);
            set((state) => ({
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
                errorStates: { ...state.errorStates, send_message: sphereError.message },
                streamingArtifactBySession: {
                    ...state.streamingArtifactBySession,
                    [sessionId!]: null,
                },
                // El turno se marca en el propio hilo: el aviso flotante se va y
                // el usuario se queda mirando una burbuja vacía sin saber si
                // sigue pensando. `interrupted` es lo que pinta el botón de
                // reintentar debajo de la burbuja (§11: qué pasó y qué hacer).
                messagesBySession: marcarUltimoInterrumpido(state.messagesBySession, sessionId!),
            }));
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
