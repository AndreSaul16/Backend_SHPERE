import type {
    AgenteAPI, AjustesDeJuntaAPI, DocumentoAPI, HistorialAPI, ListaDeDocumentosAPI,
    NuevaSesionAPI, NuevoAgenteAPI, ParcheDeAgenteAPI, PlantillaDeAgenteAPI,
    SesionAPI, TransaccionAPI, ValorJson,
} from '@/types/api';
import type { VisualConfig } from '@/types';
import type { ContentStatus, TruncatedReason, TypeStatus } from '@/types/artifact';
// El vocabulario del remedio se define UNA vez, junto al parser que lo consume.
import type { RemedioDeFallo } from '@/utils/parseMessageParts';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

if (!import.meta.env.VITE_API_URL) {
    console.warn("VITE_API_URL is undefined, using fallback: http://localhost:8000/api/v1");
}

/**
 * Obtiene el token de Firebase Auth del usuario actual.
 * Se llama en cada request para asegurar que el token es fresco.
 */
async function getAuthToken(): Promise<string | null> {
    try {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return null;
        return await user.getIdToken();
    } catch {
        return null;
    }
}

/**
 * Headers con Bearer token inyectado automáticamente.
 */
export async function authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const token = await getAuthToken();
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

export interface StreamCallbacks {
    // role llega en board V2 (debate paralelo) para enrutar el token a la burbuja correcta.
    onToken: (content: string, role?: string | null) => void;
    onRole: (role: string) => void;
    // BOARD MEETING: inicio del debate multi-agente (sirve de confirmación visual)
    onBoardStart?: (data: { agents: string[]; iterations: number | string }) => void;
    // BOARD MEETING: cada agente que empieza a hablar (con fase en V2)
    onBoardAgent?: (data: { role: string; is_conclusion: boolean; phase?: string }) => void;
    // BOARD V2: el triage decidió los participantes y el coste real (3 o 5 créditos)
    onBoardPlan?: (data: { participants: string[]; cost: number }) => void;
    // BOARD V2: cambio de fase del debate (opening|analysis|rebuttal|devil|synthesis)
    onBoardPhase?: (data: { phase: string }) => void;
    // BOARD V2: voto estructurado de un director
    onBoardVote?: (data: { role: string; vote: string; confidence: number }) => void;
    // BOARD V2: resultado de consenso tras una ronda
    onBoardConsensus?: (data: { unanimous: boolean; tally: Record<string, number>; early_exit: boolean }) => void;
    // BOARD V2: el grafo inyectó una intervención del usuario
    onBoardIntervention?: (data: { text: string }) => void;
    // THINKING: línea de razonamiento (reasoning_content) del modelo, en streaming
    onThinking?: (content: string, role?: string | null) => void;
    // ARTIFACTS 2.0 STREAMING: 3-event protocol for live artifact rendering.
    //
    // Los campos de veredicto son ADITIVOS y opcionales: un backend anterior a
    // `artefactos-guardarrailes` no los manda, y el cliente tiene que seguir
    // funcionando igual. Es lo que permite revertir el backend sin tocar esto.
    onArtifactOpen?: (data: {
        title: string;
        artifact_type: string;
        language: string;
        /** El literal que escribió el modelo, sólo cuando no se reconoce. */
        declared_type?: string;
        /** `unknown` = el tipo declarado no está en la lista blanca. */
        type_status?: TypeStatus;
    }) => void;
    onArtifactChunk?: (content: string) => void;
    onArtifactClose?: (data?: {
        truncated?: boolean;
        reason?: TruncatedReason;
        limit_bytes?: number;
        content_status?: ContentStatus;
    }) => void;
    // TOOL EXECUTION: 2-event protocol for tool visibility
    onToolStart?: (data: { tool_name: string; args: Record<string, ValorJson> }) => void;
    onToolResult?: (data: { tool_name: string; result: string }) => void;
    /**
     * `remedy` lo decide el backend (`_classify_tool_output`), que es el único punto de
     * clasificación. El cliente NO deriva la reintentabilidad del texto del mensaje ni
     * mantiene su propia lista de códigos de error: el mensaje es copy en castellano.
     * Opcional en el tipo porque el escritor del marcador aplica `retry` por omisión.
     */
    onToolError?: (data: { tool_name: string; error: string; remedy?: RemedioDeFallo }) => void;
    // Tercer estado: la herramienta no falló, está esperando un sí del usuario.
    onToolConfirmation?: (data: { tool_name: string; summary: string }) => void;
    onDone?: () => void;
    onError?: (error: unknown) => void;
}

export const chatService = {
    /**
     * Inicia un flujo SSE para recibir tokens en tiempo real.
     * @param signal - AbortSignal opcional para cancelar la petición si el usuario navega a otro chat.
     */
    async streamChat(
        query: string,
        sessionId: string,
        callbacks: StreamCallbacks,
        targetRole?: string,
        signal?: AbortSignal,
        regenerate?: boolean,
        estimatedCost: number = 1
    ) {
        try {
            const token = await getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const response = await fetch(`${API_URL}/stream/`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, session_id: sessionId, target_role: targetRole, ...(regenerate && { regenerate: true }) }),
                signal, // Permite cancelar la petición desde fuera
            });

            if (!response.ok) {
                const { handleResponseError } = await import('./errorHandler');
                const err = await handleResponseError(response);
                throw new Error(err.message);
            }
            if (!response.body) throw new Error("No response body");

            // Stream OK → decremento optimista con el coste real del envío (1 chat,
            // 5 board). Reconciliamos al [DONE] llamando a refresh (cubre también el
            // refund parcial del triage cuando el board se reduce a 3 créditos).
            import('../store/useBillingStore').then(({ useBillingStore }) => {
                useBillingStore.getState().decrementOptimistic(estimatedCost);
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                // Check if aborted before reading
                if (signal?.aborted) {
                    reader.cancel();
                    return;
                }

                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Improved SSE parsing: handle multi-line and partial chunks
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep incomplete chunk in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;

                    const dataStr = trimmed.replace('data: ', '').trim();

                    if (dataStr === '[DONE]') {
                        // Reconciliamos balance con el backend (incluye posible cargo extra >4k tokens).
                        import('../store/useBillingStore').then(({ useBillingStore }) => {
                            useBillingStore.getState().refresh();
                        });
                        callbacks.onDone?.();
                        return;
                    }

                    // El fallo del servidor se ANOTA aquí y se lanza fuera del
                    // `try`: dentro, su propio `catch` —que existe para tolerar el
                    // JSON corrupto (SFS-003)— lo registraría como error de parseo
                    // y el turno seguiría vivo hasta ejecutar `onDone`.
                    let errorDelServidor: string | null = null;

                    // Robust JSON parsing with validation
                    try {
                        const data = JSON.parse(dataStr);

                        // Validate expected structure before processing
                        if (typeof data !== 'object' || data === null) {
                            console.warn("SSE: Received non-object data, skipping");
                            continue;
                        }

                        if (data.type === 'token' && typeof data.content === 'string') {
                            callbacks.onToken(data.content, data.role ?? null);
                        } else if (data.type === 'meta' && data.role) {
                            callbacks.onRole(data.role);
                        } else if (data.type === 'board_start') {
                            callbacks.onBoardStart?.({
                                agents: Array.isArray(data.agents) ? data.agents : ['CEO', 'CTO', 'CFO', 'CMO'],
                                iterations: data.iterations ?? 'auto',
                            });
                        } else if (data.type === 'board_agent' && typeof data.role === 'string') {
                            callbacks.onBoardAgent?.({ role: data.role, is_conclusion: !!data.is_conclusion, phase: data.phase });
                        } else if (data.type === 'board_plan') {
                            callbacks.onBoardPlan?.({
                                participants: Array.isArray(data.participants) ? data.participants : [],
                                cost: typeof data.cost === 'number' ? data.cost : 5,
                            });
                        } else if (data.type === 'board_phase' && typeof data.phase === 'string') {
                            callbacks.onBoardPhase?.({ phase: data.phase });
                        } else if (data.type === 'board_vote' && typeof data.role === 'string') {
                            callbacks.onBoardVote?.({ role: data.role, vote: data.vote, confidence: data.confidence });
                        } else if (data.type === 'board_consensus') {
                            callbacks.onBoardConsensus?.({
                                unanimous: !!data.unanimous,
                                tally: data.tally || {},
                                early_exit: !!data.early_exit,
                            });
                        } else if (data.type === 'board_intervention' && typeof data.text === 'string') {
                            callbacks.onBoardIntervention?.({ text: data.text });
                        } else if (data.type === 'thinking' && typeof data.content === 'string') {
                            callbacks.onThinking?.(data.content, data.role ?? null);
                        } else if (data.type === 'artifact_open') {
                            callbacks.onArtifactOpen?.({
                                title: data.title || 'untitled',
                                artifact_type: data.artifact_type || 'code',
                                language: data.language || '',
                                declared_type: typeof data.declared_type === 'string' ? data.declared_type : undefined,
                                // Sin campo, se asume `ok`: un backend anterior
                                // a los guardarraíles no emite veredicto, y eso
                                // no es motivo para pintar un aviso.
                                type_status: data.type_status === 'unknown' ? 'unknown' : 'ok' as TypeStatus,
                            });
                        } else if (data.type === 'artifact_chunk' && typeof data.content === 'string') {
                            callbacks.onArtifactChunk?.(data.content);
                        } else if (data.type === 'artifact_close') {
                            callbacks.onArtifactClose?.({
                                truncated: data.truncated === true,
                                reason: data.reason === 'size_limit' || data.reason === 'stream_ended'
                                    ? data.reason as TruncatedReason
                                    : undefined,
                                limit_bytes: typeof data.limit_bytes === 'number' ? data.limit_bytes : undefined,
                                content_status: data.content_status === 'ok'
                                    || data.content_status === 'mismatch'
                                    || data.content_status === 'unchecked'
                                    ? data.content_status as ContentStatus
                                    : undefined,
                            });
                        } else if (data.type === 'tool_start') {
                            callbacks.onToolStart?.({
                                tool_name: data.tool_name || 'unknown',
                                args: data.args || {},
                            });
                        } else if (data.type === 'tool_result') {
                            callbacks.onToolResult?.({
                                tool_name: data.tool_name || 'unknown',
                                result: data.result || '',
                            });
                        } else if (data.type === 'tool_error') {
                            callbacks.onToolError?.({
                                tool_name: data.tool_name || 'unknown',
                                error: data.error || 'La herramienta falló.',
                                remedy: data.remedy || 'retry',
                            });
                        } else if (data.type === 'tool_confirmation') {
                            callbacks.onToolConfirmation?.({
                                tool_name: data.tool_name || 'unknown',
                                summary: data.summary || 'Esta acción necesita tu confirmación.',
                            });
                        } else if (data.type === 'error') {
                            errorDelServidor = data.message || 'Unknown server error';
                        }
                    } catch (parseError) {
                        // Log but don't crash - continue processing other chunks
                        console.warn("SSE: Error parsing chunk, skipping:", parseError, "Data:", dataStr.substring(0, 100));
                    }

                    if (errorDelServidor !== null) {
                        throw new Error(errorDelServidor);
                    }
                }
            }

            // Llegar aquí significa, POR CONSTRUCCIÓN, cuerpo cerrado sin centinela:
            // `[DONE]` (arriba) y la cancelación del usuario hacen `return`. Así que
            // no hay que preguntarse si ya se avisó — no se avisó. Las callbacks
            // terminales quedan garantizadas «como máximo una vez» por estructura.
            throw new Error('La conexión se cortó antes de que el turno terminara.');

        } catch (error) {
            // Don't trigger error callback if request was intentionally aborted
            if (signal?.aborted) {
                console.log("SSE: Request aborted by user navigation");
                return;
            }
            // Sin aviso desde aquí: `api.ts` es transporte y no sabe en qué
            // hilo estaba el usuario. El fallo se propaga por
            // `callbacks.onError` y lo escribe `useChatStore` en la propia
            // burbuja del turno, que es donde se está mirando. Avisar también
            // aquí sería el mismo corte contado dos veces.
            //
            // A4: reconciliar el balance con el backend también en error. Si el
            // envío falló, el backend reembolsó (o nunca cobró), así que el
            // decremento optimista debe corregirse YA, no esperar al polling.
            import('../store/useBillingStore').then(({ useBillingStore }) => {
                useBillingStore.getState().refresh();
            });
            callbacks.onError?.(error);
        }
    },

    /**
     * Gestión de Sesiones
     */
    async createSession(params: NuevaSesionAPI): Promise<SesionAPI> {
        const finalBaseAgentId = params.base_agent_id || params.role || 'CEO';

        const response = await fetch(`${API_URL}/sessions/`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
                title: params.title,
                base_agent_id: finalBaseAgentId,
                agent_ref_type: params.agent_ref_type,
                visual_config: params.visual_config,
                type: params.type,
                members: params.members
            })
        });
        if (!response.ok) {
            throw new Error(`Error creating session: ${response.status} ${response.statusText}`);
        }
        return response.json();
    },

    async getSessions(): Promise<SesionAPI[]> {
        const response = await fetch(`${API_URL}/sessions/`, {
            headers: await authHeaders(),
        });        if (!response.ok) {
            throw new Error(`Error fetching sessions: ${response.status}`);
        }
        return response.json();
    },

    async updateSession(sessionId: string, updates: { title?: string, visual_config?: VisualConfig, enabled_tools?: string[], members?: string[] }): Promise<SesionAPI> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: JSON.stringify(updates)
        });
        if (!response.ok) {
            throw new Error(`Error updating session: ${response.status}`);
        }
        return response.json();
    },

    async getSessionHistory(sessionId: string): Promise<HistorialAPI> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/history`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching history: ${response.status}`);
        return response.json();
    },

    // --- AGENTS CUSTOM ---
    async getCustomAgents(): Promise<AgenteAPI[]> {
        const response = await fetch(`${API_URL}/agents/`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching agents: ${response.status}`);
        return response.json();
    },

    async createCustomAgent(data: NuevoAgenteAPI): Promise<AgenteAPI> {
        const response = await fetch(`${API_URL}/agents/`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`Error creating agent: ${response.status}`);
        return response.json();
    },

    async deleteSession(sessionId: string): Promise<void> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Error deleting session: ${response.status}`);
        }
    },

    async deleteCustomAgent(agentId: string): Promise<void> {
        const response = await fetch(`${API_URL}/agents/${agentId}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error deleting agent: ${response.status}`);
    },

    // --- AGENT UPDATE ---
    async updateCustomAgent(agentId: string, data: ParcheDeAgenteAPI): Promise<AgenteAPI> {
        const response = await fetch(`${API_URL}/agents/${agentId}`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`Error updating agent: ${response.status}`);
        return response.json();
    },

    // --- TEMPLATES ---
    async getAgentTemplates(category?: string): Promise<PlantillaDeAgenteAPI[]> {
        const url = category
            ? `${API_URL}/agents/templates?category=${category}`
            : `${API_URL}/agents/templates`;
        const response = await fetch(url, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching templates: ${response.status}`);
        return response.json();
    },

    // --- DOCUMENTS (RAG) ---
    /**
     * Sube un documento con barra de progreso, o sea con `XMLHttpRequest`:
     * `fetch` no informa del progreso de subida.
     *
     * D43 — el ejecutor de la promesa era `async`, que es una trampa conocida
     * (y su propia regla de ESLint): si algo lanza DENTRO de un ejecutor `async`
     * después del primer `await`, el rechazo se pierde y la promesa se queda
     * pendiente para siempre — quien la espera no vuelve nunca. Aquí un
     * `try/catch` lo tapaba, pero bastaba con tocar el cuerpo para reabrirlo.
     * El `await` sale fuera y el ejecutor deja de ser `async`.
     */
    async uploadAgentDocument(agentId: string, file: File, onProgress?: (pct: number) => void): Promise<DocumentoAPI> {
        const token = await getAuthToken();
        return new Promise<DocumentoAPI>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText) as DocumentoAPI);
                    } catch {
                        reject(new Error('El servidor respondió algo que no es JSON'));
                    }
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
            xhr.open('POST', `${API_URL}/agents/${agentId}/documents`);
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.send(formData);
        });
    },

    async getAgentDocuments(agentId: string): Promise<ListaDeDocumentosAPI> {
        const response = await fetch(`${API_URL}/agents/${agentId}/documents`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching documents: ${response.status}`);
        return response.json();
    },

    async deleteAgentDocument(agentId: string, fileId: string): Promise<void> {
        const response = await fetch(`${API_URL}/agents/${agentId}/documents/${fileId}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error deleting document: ${response.status}`);
    },

    // --- PINS ---
    // A5: todos comprueban response.ok. Antes fallaban en silencio: la UI cambiaba
    // optimista pero el backend nunca guardaba → el pin/rating "desaparecía" al
    // recargar. Ahora lanzan para que el componente revierta y avise.
    async pinMessage(sessionId: string, messageId: string): Promise<void> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/pins`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ message_id: messageId })
        });
        if (!response.ok) throw new Error(`Error pinning message: ${response.status}`);
    },

    async unpinMessage(sessionId: string, messageId: string): Promise<void> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/pins/${messageId}`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error unpinning message: ${response.status}`);
    },

    async getPins(sessionId: string): Promise<string[]> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/pins`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching pins: ${response.status}`);
        const data = await response.json();
        return data.pinned_messages || [];
    },

    // --- RATINGS ---
    async rateMessage(sessionId: string, messageId: string, rating: 'up' | 'down', feedback?: string): Promise<void> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/ratings`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ message_id: messageId, rating, feedback })
        });
        if (!response.ok) throw new Error(`Error rating message: ${response.status}`);
    },

    /** Board settings: lee la config de debate del usuario. */
    async getBoardSettings(): Promise<{ board_meeting_enabled: boolean; board_iterations: number; board_devils_advocate: boolean }> {
        const response = await fetch(`${API_URL}/me/board-settings`, { headers: await authHeaders() });
        if (!response.ok) throw new Error(`Error board-settings: ${response.status}`);
        return response.json();
    },

    /** Board settings: actualiza la config de debate (activar, devil's advocate). */
    async updateBoardSettings(patch: { board_meeting_enabled?: boolean; board_devils_advocate?: boolean }): Promise<AjustesDeJuntaAPI> {
        const response = await fetch(`${API_URL}/me/board-settings`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error(`Error board-settings: ${response.status}`);
        return response.json();
    },

    /**
     * BOARD V2: encola una intervención del usuario en un debate en curso.
     * El grafo la inyecta antes de la siguiente fase. Sin coste de créditos.
     */
    async intervene(sessionId: string, text: string): Promise<{ ok: boolean; message: string }> {
        const response = await fetch(`${API_URL}/stream/intervene`, {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ session_id: sessionId, text })
        });
        if (!response.ok) {
            const { handleResponseError } = await import('./errorHandler');
            const err = await handleResponseError(response);
            throw new Error(err.message);
        }
        return response.json();
    },

    // --- COMPARTIR SESIÓN (público read-only) ---
    /** Genera/reutiliza el token público de la sesión. */
    async shareSession(sessionId: string): Promise<{ share_token: string }> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/share`, {
            method: 'POST',
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error sharing session: ${response.status}`);
        return response.json();
    },

    /** Revoca el enlace público de la sesión. */
    async unshareSession(sessionId: string): Promise<void> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/share`, {
            method: 'DELETE',
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error unsharing session: ${response.status}`);
    },

    /** Vista pública de una conversación compartida (sin auth). */
    async getSharedSession(token: string): Promise<import('@/types').SharedSession> {
        const response = await fetch(`${API_URL}/sessions/share/${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error(`Error fetching shared session: ${response.status}`);
        return response.json();
    }
};


// ============================================================
// USER PROFILE, INTEGRATIONS, CONTACTS, OVERRIDES
// ============================================================

export interface UserProfile {
    firebase_uid: string;
    email: string;
    display_name: string;
    avatar_url?: string | null;
    onboarding_completed?: boolean;
    ui_preferences?: {
        theme?: "dark" | "light" | "system";
        accent_color?: string;
        locale?: string;
        timezone?: string;
        artifact_default_open?: boolean;
        tool_confirmation_level?: "always" | "destructive_only" | "never";
    };
    professional_profile?: {
        role?: string | null;
        industry?: string | null;
        company_name?: string | null;
        company_stage?: string | null;
        team_size?: number | null;
    };
    communication_style?: {
        tone?: "formal" | "casual";
        verbosity?: "concise" | "detailed";
        language_register?: string | null;
    };
    financial_preferences?: {
        base_currency?: string;
        fiscal_year_start_month?: number;
    };
    personal_kb_enabled?: boolean;
    feature_flags?: string[];
    connected_providers?: string[];
}

export interface Integration {
    provider: string;
    connected_at?: string;
    scopes?: string[];
    expires_at?: string | null;
}

export interface IntegrationsList {
    connected: Integration[];
    available: string[];
    status: Record<string, boolean>;
}

export interface OAuthAppInfo {
    provider: string;
    client_id: string;
    scopes?: string[];
    created_at?: string;
    updated_at?: string;
    connected: boolean;
}

export interface OAuthAppsList {
    apps: OAuthAppInfo[];
    available: string[];
    callback_urls: Record<string, string>;
    /** Providers con OAuth app compartida de SPHERE (conectar sin BYO). */
    shared?: Record<string, boolean>;
}

export interface Contact {
    id?: string;
    type: "email" | "phone" | "slack_channel" | "github_user" | "linkedin_handle";
    value: string;
    display_name?: string | null;
    authorized_for: string[];
    added_at?: string;
}

export interface AgentOverride {
    agent_role: string;
    system_prompt_addition?: string | null;
    temperature_override?: number | null;
    model_override?: string | null;
    updated_at?: string;
}

/**
 * `skipGlobalHandler`: no pasar el fallo por `handleError`.
 *
 * Reservado a las peticiones cuyo error es un RESULTADO ESPERADO y no un
 * incidente — una **sonda**: se pregunta al backend si el usuario puede hacer
 * algo y el «no» llega como 403. `handleError` traduce todo 403 a
 * `perm.plan_not_allowed` y abre el paywall, así que una sonda enrutada por ahí
 * le enseña «Has agotado tus créditos» a quien no ha gastado nada (F1).
 *
 * El error se sigue construyendo y lanzando igual: lo que se salta es el EFECTO
 * GLOBAL, no el aviso al llamante.
 */
type ReqInit = RequestInit & { json?: unknown; skipGlobalHandler?: boolean };

async function req<T = unknown>(
    path: string,
    init?: ReqInit
): Promise<T> {
    const headers = await authHeaders();
    const { json, skipGlobalHandler, ...rest } = init || {};
    const response = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (!response.ok) {
        const { parseError, handleError } = await import('./errorHandler');
        const err = await parseError(response);
        if (!skipGlobalHandler) handleError(err);
        throw new Error(`${err.status} ${err.code}: ${err.message}`);
    }
    if (response.status === 204) return undefined as unknown as T;
    return response.json();
}

export interface StorageUsage {
    plan_id: string;
    used_bytes: number;
    quota_bytes: number;
    file_count: number;
    percent_used: number;
}

export const profileService = {
    getProfile: () => req<UserProfile>("/me"),
    updateProfile: (updates: Partial<UserProfile>) =>
        req<UserProfile>("/me", { method: "PATCH", json: updates }),
    completeOnboarding: () =>
        req<UserProfile>("/me/onboarding/complete", { method: "POST" }),
    getStorage: () => req<StorageUsage>("/me/storage"),
};

export interface ServiceDefinition {
    service: string;
    label: string;
    description: string;
    credential_type: string;
    connected: boolean;
    metadata: Record<string, string>;
    created_at: string | null;
    tools?: string[];
}

export interface ServiceCredentialsResponse {
    services: ServiceDefinition[];
    available: string[];
}

/**
 * D38: `ServiceCredentialsSettings` llamaba con `fetch` a una ruta absoluta de
 * la API escrita a mano, o sea que ignoraba `VITE_API_URL` y sólo funcionaba si
 * el frontend se servía desde el mismo origen que la API. Además se fabricaba su propio
 * `getAuthToken`, con lo que el manejo de 401/402 de `errorHandler` no corría.
 */
export const serviceCredentialsService = {
    list: () => req<ServiceCredentialsResponse>("/me/service-credentials"),
    save: (service: string, api_key: string, metadata: Record<string, string>) =>
        req<{ status: string }>("/me/service-credentials", {
            method: "POST",
            json: { service, api_key, metadata },
        }),
    remove: (service: string) =>
        req<void>(`/me/service-credentials/${service}`, { method: "DELETE" }),
    test: (service: string) =>
        req<{ success: boolean; message: string }>(
            `/me/service-credentials/${service}/test`,
            { method: "POST" }
        ),
};

export const integrationsService = {
    list: () => req<IntegrationsList>("/integrations/"),
    // Pide al backend la URL de autorización (con Bearer token) y redirige.
    connect: async (provider: string) => {
        const { authorize_url } = await req<{ authorize_url: string }>(
            `/integrations/${provider}/connect`
        );
        window.location.href = authorize_url;
    },
    disconnect: (provider: string) =>
        req<void>(`/integrations/${provider}`, { method: "DELETE" }),

    // BYO OAuth apps: el usuario registra su propia app (client_id + secret).
    listApps: () => req<OAuthAppsList>("/integrations/apps"),
    registerApp: (provider: string, client_id: string, client_secret: string) =>
        req<{ status: string; provider: string; callback_url: string; scopes: string[] }>(
            `/integrations/${provider}/app`,
            { method: "PUT", json: { client_id, client_secret } }
        ),
    deleteApp: (provider: string) =>
        req<void>(`/integrations/${provider}/app`, { method: "DELETE" }),
};

export const contactsService = {
    list: () => req<Contact[]>("/me/contacts"),
    add: (contact: Omit<Contact, "id" | "added_at">) =>
        req<Contact>("/me/contacts", { method: "POST", json: contact }),
    remove: (contactId: string) =>
        req<void>(`/me/contacts/${contactId}`, { method: "DELETE" }),
};

export const exportsService = {
    /** Exporta el acta como página de Notion. */
    notion: (title: string, content: string) =>
        req<{ url: string; id: string }>("/me/exports/notion", {
            method: "POST",
            json: { title, content },
        }),
    /** Crea issues de GitHub a partir de los próximos pasos del acta. */
    githubIssues: (
        owner: string,
        repo: string,
        issues: { title: string; body: string }[]
    ) =>
        req<{
            created: { title: string; url: string }[];
            errors: { title: string; error: string }[];
        }>("/me/exports/github-issues", {
            method: "POST",
            json: { owner, repo, issues },
        }),
};

export interface ScheduledBoard {
    id: string;
    query: string;
    cadence: "daily" | "weekly";
    hour_utc: number;
    weekday?: number | null;
    channel: "whatsapp" | "slack" | "none";
    channel_target?: string | null;
    enabled: boolean;
    next_run_at?: string | null;
    last_run_at?: string | null;
    last_status?: string | null;
}

export type ScheduledBoardInput = Omit<
    ScheduledBoard,
    "id" | "next_run_at" | "last_run_at" | "last_status"
>;

export const scheduledBoardsService = {
    list: () => req<ScheduledBoard[]>("/me/scheduled-boards"),
    create: (data: ScheduledBoardInput) =>
        req<ScheduledBoard>("/me/scheduled-boards", { method: "POST", json: data }),
    update: (id: string, data: Partial<ScheduledBoardInput>) =>
        req<ScheduledBoard>(`/me/scheduled-boards/${id}`, { method: "PATCH", json: data }),
    remove: (id: string) =>
        req<void>(`/me/scheduled-boards/${id}`, { method: "DELETE" }),
};

// --- ADMIN (F4 + F5) ---
export interface AdminUser {
    uid: string;
    email?: string | null;
    plan: string;
    pro_messages_balance: number;
    topup_messages_balance: number;
}

export interface AdminDayMetric {
    date: string;
    credits_consumed: number;
    cost_usd_estimated: number;
    cost_usd_actual: number;
    debates: number;
    chats: number;
    refunds: number;
}

export interface AdminMetrics {
    days: number;
    by_day: AdminDayMetric[];
    totals: {
        credits_consumed: number;
        cost_usd_estimated: number;
        cost_usd_actual: number;
        debates: number;
        chats: number;
        refunds: number;
        purchases_count: number;
        credits_granted: number;
    };
}

export const adminService = {
    /**
     * F1 — ¿tiene esta cuenta panel de administración?
     *
     * Es una SONDA, no una consulta: para el 99% de las cuentas la respuesta es
     * «no» y llega como 403. Ese 403 es el resultado esperado, así que no puede
     * atravesar el manejador global de errores (`skipGlobalHandler`): antes lo
     * hacía —la sidebar llamaba a `users()` a pelo— y `handleError` abría el
     * modal «Has agotado tus créditos» a todo usuario no administrador, en cada
     * carga de la aplicación.
     *
     * Devuelve un booleano y nunca lanza: quien pregunta sólo quiere saber si
     * pinta el enlace.
     */
    isAdmin: async (): Promise<boolean> => {
        try {
            await req<AdminUser[]>("/admin/users", { skipGlobalHandler: true });
            return true;
        } catch {
            return false;
        }
    },
    users: (q?: string) =>
        req<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    adjust: (uid: string, delta: number, reason: string) =>
        req<{ uid: string; delta: number; topup_messages_balance: number }>(
            `/admin/users/${uid}/adjust`,
            { method: "POST", json: { delta, reason } }
        ),
    transactions: (uid?: string, limit = 50) =>
        req<{ transactions: TransaccionAPI[] }>(
            `/admin/transactions?limit=${limit}${uid ? `&uid=${encodeURIComponent(uid)}` : ""}`
        ),
    metrics: (days = 30) => req<AdminMetrics>(`/admin/metrics?days=${days}`),
};

export const agentOverridesService = {
    list: () => req<AgentOverride[]>("/me/agent-overrides"),
    upsert: (agentRole: string, override: Partial<AgentOverride>) =>
        req<AgentOverride>(`/me/agent-overrides/${agentRole}`, {
            method: "PUT",
            json: override,
        }),
    remove: (agentRole: string) =>
        req<void>(`/me/agent-overrides/${agentRole}`, { method: "DELETE" }),
};

