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
const TIPOS_DE_ARTEFACTO: Record<string, 'code' | 'markdown' | 'mermaid' | 'data_table' | 'svg'> = {
    'code': 'code', 'markdown': 'markdown', 'mermaid': 'mermaid', 'csv': 'data_table', 'svg': 'svg',
};

export function createStreamHandlers(ctx: StreamContext): StreamCallbacks {
    const { set, get, sessionId, allAgents, burbujas, buffer } = ctx;

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

    /**
     * Pega texto al final del contenido de la burbuja activa.
     *
     * 4.8: pasa por el MISMO buffer que los tokens y no por un `set` directo.
     * Si el marcador de un utensilio se escribiera al instante mientras hay
     * tokens esperando el fotograma, aterrizaría ANTES que texto que llegó
     * antes que él y el turno saldría con las frases cambiadas de sitio.
     */
    const anadirALaActiva = (texto: string) => buffer.texto(burbujas.activaId, texto);

    return {
        onToken: (token, role) => {
            // En board V2 el token trae rol → enrutar a la burbuja de ese
            // agente (debaten en paralelo). Si no hay rol, burbuja activa.
            //
            // 4.8 · D22: el destino se resuelve AQUÍ, en el instante en que el
            // token llega, y el texto se encola con ese destino ya fijado. Así
            // el buffer no puede reenrutar nada: si `onBoardAgent` cambia de
            // burbuja antes del siguiente fotograma, lo encolado sigue yendo a
            // la burbuja que le correspondía.
            buffer.texto(destinoDe(burbujas, role), token);
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
                buffer.razonamiento(targetId, piece);
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
                // El veredicto viaja CON el artefacto, no por un canal aparte:
                // el panel lo lee del mismo objeto que pinta, así que no hay
                // fotograma en que el documento se enseñe sin su aviso.
                typeStatus: data.type_status,
                declaredType: data.declared_type,
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

        onArtifactClose: (data) => {
            // Deja de ser un no-op sobre el artefacto: el cierre es el momento
            // en que el generador dice si el documento se cortó y si su
            // contenido encaja con el tipo declarado. Si eso no se copia aquí,
            // el aviso muere en el canal y el panel enseña el documento como si
            // estuviera entero y fuese lo que dice ser.
            const artifactId = get().streamingArtifactBySession[sessionId];

            set(state => ({
                streamingArtifactBySession: { ...state.streamingArtifactBySession, [sessionId]: null },
                artifacts: artifactId
                    ? state.artifacts.map(a => a.id === artifactId ? {
                        ...a,
                        truncated: data?.truncated || undefined,
                        truncatedReason: data?.reason,
                        contentStatus: data?.content_status,
                    } : a)
                    : state.artifacts,
            }));
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

        onToolConfirmation: (data) => {
            // Mismo saneado que el error, por el mismo motivo: un ']' en el
            // resumen cerraría el marcador antes de tiempo.
            const safeSummary = data.summary.replace(/[\]\n\r]/g, ' ').substring(0, 200);
            anadirALaActiva(`\n[TOOL_CONFIRM:${data.tool_name}:${safeSummary}]\n`);
        },

        onDone: () => {
            // Lo pendiente se escribe ANTES de cerrar: si el último token se
            // quedara en el buffer, el turno terminaría con la frase a medias.
            buffer.vaciar();
            set((state) => ({
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
                boardSession: state.boardSession
                    ? { ...state.boardSession, active: false }
                    : state.boardSession,
            }));
        },

        onError: () => {
            // Igual que en `onDone`, y aquí además se LEE el contenido para
            // pegarle la marca de corte: sin vaciar, la marca se escribiría
            // antes que los últimos tokens y quedaría en medio del texto.
            buffer.vaciar();
            set((state) => ({
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId]: (state.messagesBySession[sessionId] || []).map(msg =>
                        msg.id === burbujas.activaId
                            // Dos cosas distintas, no la misma dos veces:
                            //
                            //   · el texto marca DÓNDE se cortó, dentro de la
                            //     propia respuesta, para que no parezca que el
                            //     director terminó la frase así;
                            //   · `interrupted` es lo que hace que el hilo pinte
                            //     debajo el aviso con «Reintentar el turno», que
                            //     es donde va lo que se conserva y qué hacer.
                            //
                            // Antes el texto lo decía TODO y no había acción
                            // ninguna: informaba y dejaba al usuario parado.
                            ? {
                                ...msg,
                                content: msg.content + '\n\n*La respuesta se cortó aquí.*',
                                interrupted: true,
                            }
                            : msg
                    ),
                },
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
            }));
        },
    };
}
