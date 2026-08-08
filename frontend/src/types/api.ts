/**
 * La forma de lo que el backend devuelve (D43 · 7.4).
 *
 * `services/api.ts` declaraba `Promise<any>` en veintitrés sitios. Un `any` en
 * el borde de la red no es «no sé qué llega»: es apagar el comprobador de
 * tipos para TODO lo que toque ese valor después, hasta el fondo. Los mapeos
 * del store leían `a.identity.name` sin que nadie comprobara que `identity`
 * existe, y cuando el backend cambió `agent_id` por `id` en una rama el
 * frontend compiló igual y falló en tiempo de ejecución.
 *
 * Estas interfaces describen lo que el backend manda HOY. Todo lo que no es
 * seguro va como opcional: mentir en el otro sentido —declarar obligatorio lo
 * que puede faltar— es peor que el `any`, porque parece verdad.
 */
import type { Role, SessionType, VisualConfig, ContextFile } from './index';

/** Cualquier cosa que quepa en un JSON. Sustituye a `any` en los cuerpos. */
export type ValorJson =
    | string | number | boolean | null
    | ValorJson[]
    | { [clave: string]: ValorJson };

/** Un objeto JSON cualquiera: el cuerpo de una petición sin forma fija. */
export type ObjetoJson = Record<string, ValorJson>;

// ─────────────────────────────────────────────────────── sesiones

export interface SesionAPI {
    session_id: string;
    user_id?: string;
    title?: string;
    base_agent_id?: string;
    agent_ref_type?: string;
    type?: SessionType;
    visual_config?: VisualConfig;
    context_files?: ContextFile[];
    enabled_tools?: string[];
    members?: string[];
    folder?: string;
    tags?: string[];
    pinned_messages?: string[];
    created_at?: string;
    share_token?: string | null;
}

/** El cuerpo de `POST /sessions/`. */
export interface NuevaSesionAPI {
    title?: string;
    base_agent_id?: string;
    agent_ref_type?: string;
    /** Atajo antiguo: si no hay `base_agent_id`, se usa éste. */
    role?: string;
    visual_config?: VisualConfig;
    user_id?: string;
    type?: string;
    members?: string[];
}

/** Lo que devuelve `GET /sessions/{id}/history`. */
export interface HistorialAPI {
    /**
     * Los turnos persistidos, con la forma de `TurnoPersistido`. Se declara
     * aquí como una lista de objetos sueltos y NO se importa el tipo del store
     * a propósito: `services/` no puede depender de `store/` sin invertir la
     * dirección de las dependencias. El mapeo del store es quien la estrecha.
     */
    messages?: { id?: string | null; type?: string; content: string; additional_kwargs?: Record<string, unknown> }[];
    final_response?: string;
    /** `agent_deleted` cuando la sesión apunta a un agente que ya no existe. */
    warning?: string;
}

// ─────────────────────────────────────────────────────── agentes

export interface IdentidadAPI {
    name: string;
    role: string;
    color?: string;
    description?: string;
    avatar_style?: string;
}

export interface CerebroAPI {
    model: string;
    temperature: number;
    system_prompt: string;
}

export interface AgenteAPI {
    agent_id: string;
    identity: IdentidadAPI;
    brain_config: CerebroAPI;
    owner_user_id?: string;
    is_public?: boolean;
    created_at?: string;
}

/** El cuerpo de `POST /agents/`. */
export interface NuevoAgenteAPI {
    identity: { name: string; role: Role | string; color: string; description?: string };
    brain_config: { model: string; temperature: number; system_prompt: string };
    owner_user_id?: string;
    is_public?: boolean;
}

/** El cuerpo de `PATCH /agents/{id}`: cualquier subconjunto de lo anterior. */
export type ParcheDeAgenteAPI = Partial<NuevoAgenteAPI>;

export interface PlantillaDeAgenteAPI {
    template_id: string;
    name: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
    system_prompt?: string;
    model?: string;
    temperature?: number;
}

// ─────────────────────────────────────────────────────── documentos (RAG)

export interface DocumentoAPI {
    file_id: string;
    filename: string;
    file_size_bytes: number;
    content_type: string;
    processing_status: 'pending' | 'processing' | 'completed' | 'failed';
    chunks_count: number;
    uploaded_at: string;
}

export interface ListaDeDocumentosAPI {
    documents?: DocumentoAPI[];
    total_bytes?: number;
}

// ─────────────────────────────────────────────────────── varios

export interface AjustesDeJuntaAPI {
    board_meeting_enabled: boolean;
    board_iterations: number;
    board_devils_advocate: boolean;
}

export interface TransaccionAPI {
    created_at?: string;
    delta?: number;
    reason?: string;
    kind?: string;
    uid?: string;
}
