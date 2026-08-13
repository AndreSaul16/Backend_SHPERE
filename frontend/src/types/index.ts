export type Role = 'user' | 'system' | 'CTO' | 'CMO' | 'CFO' | 'CEO' | 'specialist' | 'DEVIL';

// Board V2: voto estructurado de un director.
export interface BoardVote {
    // ABSTENCION: el director no aportó voto decisivo. No es un voto tibio, es
    // la ausencia de voto — y el backend la escribe explícitamente (BVT-002).
    decision: 'SI' | 'NO' | 'CONDICIONAL' | 'ABSTENCION';
    confidence: number | null; // 0-100; null en una abstención
}

export type BoardPhase = 'opening' | 'analysis' | 'rebuttal' | 'devil' | 'synthesis';

export type SessionType = 'group' | 'direct';

export interface VisualConfig {
    name?: string;
    avatar?: string;
    color?: string;       // Legacy or primary
    theme?: string;       // For groups
    bubble_color?: string; // For direct
    secondary_color?: string;
}

export interface ContextFile {
    file_id: string;
    name: string;
    vector_index_id?: string;
    uploaded_at: string;
}

export interface AgentIdentity {
    name: string;
    role: Role;
    color: string;
    avatar_style?: string;
}

export interface BrainConfig {
    model: string;
    temperature: number;
    system_prompt: string;
}

export interface Agent {
    id: string;
    name: string;
    role: Role;
    avatar: string; // URL o iniciales
    description: string;
    color: string; // Tailwind class (ej: text-agent-cto)
    hexColor: string; // Hex color for HUD animations (ej: #00F0C8)
    isOnline: boolean;
    capabilities?: string[]; // Lista de habilidades del agente
    // Evolved fields
    identity?: AgentIdentity;
    brain_config?: BrainConfig;
    owner_user_id?: string;
    is_public?: boolean;
}

export interface Message {
    id: string;
    role: Role;
    content: string; // Markdown
    timestamp: Date;
    agentId?: string; // Si es null, es del sistema o usuario
    thinking?: string; // Chain-of-thought (reasoning_content) emitido en streaming
    isConclusion?: boolean; // Board meeting: síntesis ejecutiva final del CEO
    vote?: BoardVote; // Board V2: voto del director (se muestra como chip)
    phase?: BoardPhase; // Board V2: fase del debate en la que se emitió
    /**
     * El turno se cortó a medias (stream muerto o red caída), no lo paró el
     * usuario. Lo pone el store y lo lee el hilo para ofrecer «Reintentar» ahí
     * mismo, que es donde el usuario está mirando. No se persiste: al recargar,
     * lo que queda es el texto del aviso dentro del propio contenido.
     */
    interrupted?: boolean;
    /**
     * Versiones anteriores de ESTE turno, en orden (v1 primero) — Q12 (5.11).
     *
     * «Regenerar» truncaba el hilo desde la burbuja y la respuesta anterior
     * desaparecía: si habías gastado créditos en dos versiones, la primera se
     * perdía en silencio. Ahora viaja aquí y la burbuja ofrece «v1 / v2».
     *
     * No se persiste en el backend: el historial guarda el hilo final, así que
     * al recargar queda la versión buena y el conmutador desaparece. Es la
     * decisión honesta hasta que el servidor tenga dónde guardarlas.
     */
    versionesPrevias?: string[];
}

export interface ChatSession {
    session_id: string;
    user_id: string;
    title: string;
    base_agent_id: string;
    agent_ref_type: string;
    type: SessionType;
    visual_config: VisualConfig;
    context_files: ContextFile[];
    enabled_tools: string[];
    members: string[];
    folder?: string;
    tags?: string[];
    pinned_messages?: string[];
    created_at: string;
    /** Token de compartir público read-only (solo si la sesión está compartida). */
    share_token?: string | null;
}

// --- Share público read-only ---
export interface SharedMessage {
    role: "user" | "assistant";
    content: string;
    agent_role?: string;
    board_vote?: { decision?: string; confidence?: number } | null;
}

export interface SharedSession {
    title: string;
    messages: SharedMessage[];
}

// --- Agent Templates ---
export interface AgentTemplate {
    template_id: string;
    name: string;
    category: string;
    description: string;
    icon: string;
    system_prompt: string;
    suggested_files: string[];
    default_temperature: number;
    default_model: string;
    tags: string[];
}

// --- Agent Documents ---
export interface AgentDocument {
    file_id: string;
    filename: string;
    file_size_bytes: number;
    content_type: string;
    processing_status: 'pending' | 'processing' | 'completed' | 'failed';
    chunks_count: number;
    uploaded_at: string;
}

// --- Message Rating ---
export interface MessageRating {
    message_id: string;
    rating: 'up' | 'down';
    feedback?: string;
}
