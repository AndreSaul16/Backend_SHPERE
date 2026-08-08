/**
 * Manejadores del stream que no son de junta: texto, razonamiento, artefactos,
 * utensilios y el cierre.
 *
 * Todos escriben en la burbuja que dice `destinoDe`, y ninguno decide a cuál:
 * eso lo gobierna el registro compartido `burbujas`, que mueven los eventos de
 * junta. Ver `streamContext.ts`.
 */
import { v4 as uuidv4 } from 'uuid';
import type { StreamCallbacks } from '../../services/api';
import type { Artifact } from '../../types/artifact';
import type { Message, Role } from '../../types';
import { destinoDe, reportStreamGlitch, type StreamContext } from './streamContext';

/** Tipos de artefacto que entiende el panel; lo demás cae a `code`. */
const TIPOS_DE_ARTEFACTO: Record<string, 'code' | 'markdown' | 'mermaid' | 'data_table'> = {
    'code': 'code', 'markdown': 'markdown', 'mermaid': 'mermaid', 'csv': 'data_table',
};

export function createStreamHandlers(ctx: StreamContext): StreamCallbacks {
    const { set, get, sessionId, allAgents, burbujas } = ctx;

    /** Reescribe UN mensaje del hilo de esta sesión, dejando el resto igual. */
    const editarMensaje = (id: string, cambio: (m: Message) => Message) =>
        set((state) => ({
            messagesBySession: {
                ...state.messagesBySession,
                [sessionId]: (state.messagesBySession[sessionId] || []).map(m =>
                    m.id === id ? cambio(m) : m
                ),
            },
        }));

    /** Pega texto al final del contenido de la burbuja activa. */
    const anadirALaActiva = (texto: string) =>
        editarMensaje(burbujas.activaId, (m) => ({ ...m, content: m.content + texto }));

    return {
        onToken: (token, role) => {
            // En board V2 el token trae rol → enrutar a la burbuja de ese
            // agente (debaten en paralelo). Si no hay rol, burbuja activa.
            editarMensaje(destinoDe(burbujas, role), (m) => ({ ...m, content: m.content + token }));
        },

        onRole: (role) => {
            // En grupo, resolver el agente real que responde por su rol
            const matchingAgent = allAgents.find(a => a.role === role && a.id !== 'group-chat');
            editarMensaje(burbujas.activaId, (m) => ({
                ...m,
                role: role as Role,
                agentId: matchingAgent?.id || m.agentId,
            }));
        },

        onThinking: (piece, role) => {
            // Razonamiento (reasoning_content) → se acumula en la burbuja
            // del rol que piensa (board V2) o en la activa.
            const targetId = destinoDe(burbujas, role);
            try {
                editarMensaje(targetId, (m) => ({ ...m, thinking: (m.thinking || '') + piece }));
            } catch (e) {
                reportStreamGlitch('onThinking', e);
            }
        },

        onArtifactOpen: (data) => {
            const artifactId = uuidv4();
            const artifact: Artifact = {
                id: artifactId,
                title: data.title,
                type: TIPOS_DE_ARTEFACTO[data.artifact_type] || 'code',
                language: data.language || undefined,
                content: '',
                agentId: ctx.selectedAgentId || 'system',
                createdAt: new Date(),
            };

            get().addArtifact(artifact);

            anadirALaActiva(`\n\n[ARTIFACT:${artifactId}:${data.title}]\n\n`);

            set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [sessionId]: artifactId } }));
        },

        onArtifactChunk: (content) => {
            const artifactId = get().streamingArtifactBySession[sessionId];
            if (!artifactId) return;

            set((state) => ({
                artifacts: state.artifacts.map(a =>
                    a.id === artifactId ? { ...a, content: a.content + content } : a
                )
            }));
        },

        onArtifactClose: () => {
            set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [sessionId]: null } }));
        },

        onToolStart: (data) => {
            anadirALaActiva(`\n[TOOL_START:${data.tool_name}]\n`);
        },

        onToolResult: (data) => {
            const truncated = data.result.substring(0, 300);
            anadirALaActiva(`\n[TOOL_RESULT:${data.tool_name}:${truncated}]\n`);
        },

        onToolError: (data) => {
            // El placeholder se parsea con regex: sanear ']' y saltos de línea
            const safeError = data.error.replace(/[\]\n\r]/g, ' ').substring(0, 200);
            anadirALaActiva(`\n[TOOL_ERROR:${data.tool_name}:${safeError}]\n`);
        },

        onDone: () => {
            set((state) => ({
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
                boardSession: state.boardSession
                    ? { ...state.boardSession, active: false }
                    : state.boardSession,
            }));
        },

        onError: () => {
            set((state) => ({
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId]: (state.messagesBySession[sessionId] || []).map(msg =>
                        msg.id === burbujas.activaId
                            // §11: el error dice qué pasó y qué se conservó. Va
                            // aquí, en el propio hilo, que es donde está mirando
                            // el usuario: por eso `streamChat` ya no avisa
                            // aparte (sería el mismo error dos veces).
                            ? { ...msg, content: msg.content + '\n\n⚠️ **Se cortó la respuesta.** Lo escrito hasta aquí se conserva. Vuelve a enviar el mensaje para retomarlo.' }
                            : msg
                    ),
                },
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
            }));
        },
    };
}
