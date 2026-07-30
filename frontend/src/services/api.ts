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
    // ARTIFACTS 2.0 STREAMING: 3-event protocol for live artifact rendering
    onArtifactOpen?: (data: { title: string; artifact_type: string; language: string }) => void;
    onArtifactChunk?: (content: string) => void;
    onArtifactClose?: () => void;
    // TOOL EXECUTION: 2-event protocol for tool visibility
    onToolStart?: (data: { tool_name: string; args: Record<string, any> }) => void;
    onToolResult?: (data: { tool_name: string; result: string }) => void;
    onToolError?: (data: { tool_name: string; error: string }) => void;
    onDone?: () => void;
    onError?: (error: any) => void;
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
                                language: data.language || ''
                            });
                        } else if (data.type === 'artifact_chunk' && typeof data.content === 'string') {
                            callbacks.onArtifactChunk?.(data.content);
                        } else if (data.type === 'artifact_close') {
                            callbacks.onArtifactClose?.();
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
                            });
                        } else if (data.type === 'error') {
                            throw new Error(data.message || 'Unknown server error');
                        }
                    } catch (parseError) {
                        // Log but don't crash - continue processing other chunks
                        console.warn("SSE: Error parsing chunk, skipping:", parseError, "Data:", dataStr.substring(0, 100));
                    }
                }
            }

            // Process any remaining buffer content after stream ends
            if (buffer.trim()) {
                console.warn("SSE: Unprocessed buffer content at end:", buffer.substring(0, 100));
            }

        } catch (error) {
            // Don't trigger error callback if request was intentionally aborted
            if (signal?.aborted) {
                console.log("SSE: Request aborted by user navigation");
                return;
            }
            console.error("🔥 Error en streamChat:", error);
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
    async createSession(params: {
        title?: string;
        base_agent_id?: string;
        agent_ref_type?: string;
        role?: string; // Backwards compatibility helper
        visual_config?: any;
        user_id?: string;
        type?: string;
        members?: string[];
    }): Promise<any> {
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

    async getSessions(): Promise<any[]> {
        const response = await fetch(`${API_URL}/sessions/`, {
            headers: await authHeaders(),
        });        if (!response.ok) {
            throw new Error(`Error fetching sessions: ${response.status}`);
        }
        return response.json();
    },

    async updateSession(sessionId: string, updates: { title?: string, visual_config?: any, enabled_tools?: string[], members?: string[] }): Promise<any> {
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

    async getSessionHistory(sessionId: string): Promise<any> {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/history`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching history: ${response.status}`);
        return response.json();
    },

    // --- AGENTS CUSTOM ---
    async getCustomAgents(): Promise<any[]> {
        const response = await fetch(`${API_URL}/agents/`, {
            headers: await authHeaders(),
        });
        if (!response.ok) throw new Error(`Error fetching agents: ${response.status}`);
        return response.json();
    },

    async createCustomAgent(data: { identity: any, brain_config: any, is_public?: boolean }): Promise<any> {
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
    async updateCustomAgent(agentId: string, data: any): Promise<any> {
        const response = await fetch(`${API_URL}/agents/${agentId}`, {
            method: 'PATCH',
            headers: await authHeaders(),
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`Error updating agent: ${response.status}`);
        return response.json();
    },

    // --- TEMPLATES ---
    async getAgentTemplates(category?: string): Promise<any[]> {
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
    uploadAgentDocument(agentId: string, file: File, onProgress?: (pct: number) => void): Promise<any> {
        return new Promise(async (resolve, reject) => {
            try {
                const token = await getAuthToken();
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
                        resolve(JSON.parse(xhr.responseText));
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
            } catch (err) {
                reject(err);
            }
        });
    },

    async getAgentDocuments(agentId: string): Promise<any> {
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
    async updateBoardSettings(patch: { board_meeting_enabled?: boolean; board_devils_advocate?: boolean }): Promise<any> {
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

async function req<T = any>(
    path: string,
    init?: RequestInit & { json?: any }
): Promise<T> {
    const headers = await authHeaders();
    const { json, ...rest } = init || {};
    const response = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: { ...headers, ...(rest.headers as any) },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    if (!response.ok) {
        const { handleResponseError } = await import('./errorHandler');
        const err = await handleResponseError(response);
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
    users: (q?: string) =>
        req<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    adjust: (uid: string, delta: number, reason: string) =>
        req<{ uid: string; delta: number; topup_messages_balance: number }>(
            `/admin/users/${uid}/adjust`,
            { method: "POST", json: { delta, reason } }
        ),
    transactions: (uid?: string, limit = 50) =>
        req<{ transactions: any[] }>(
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

