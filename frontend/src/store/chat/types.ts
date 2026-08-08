/**
 * El contrato del store de chat, repartido por responsabilidad (D40).
 *
 * Aquí viven SÓLO tipos: cada slice declara qué estado posee y qué acciones
 * ofrece, y `ChatState` es la suma. El fichero no importa ningún slice, así que
 * la dirección de dependencias es siempre la misma —slices → tipos— y no hay
 * ciclos que desenredar.
 *
 * El store sigue siendo PLANO: los slices se componen en un único objeto, así
 * que `get()` ve el estado entero. Ésa es la vía por la que un slice lee a otro
 * (`sendMessage` lee `coreAgents`, `loadSession` lee `sessions`…). Duplicar
 * estado entre slices para «no acoplarlos» es exactamente el fallo que este
 * reparto evita.
 */
import type { StoreApi } from 'zustand';
import type { Agent, Message, ChatSession, BoardPhase, BoardVote, Role } from '../../types';
import type { Artifact } from '../../types/artifact';
import type { ErrorContext } from '../../lib/errors';

// Board V2: estado vivo del debate para la cabecera "war-room".
export type BoardAgentStatus = 'idle' | 'speaking' | 'done';
export interface BoardSessionState {
    active: boolean;
    phase: BoardPhase | null;
    participants: string[];       // roles que debaten (CTO/CFO/CMO)
    statusByRole: Record<string, BoardAgentStatus>;
    votes: Record<string, BoardVote>;
    tally: Record<string, number> | null;
    unanimous: boolean;
    earlyExit: boolean;
    cost: number;                 // créditos reales del debate (3 o 5)
    devil: boolean;
    lastIntervention: string | null;
}

/** Errores por método. Los pinta `ErrorOverlay`, montado en `App`. */
export type ErrorStates = Record<ErrorContext, string | null>;

/**
 * Lo que hace falta para dar de alta un agente a medida.
 *
 * Era `any` (D41). El único que construye esta carga es `AgentCreationWizard`,
 * así que éste es su contrato natural: si el asistente deja de mandar el
 * `system_prompt` o se inventa un campo, ahora se ve al compilar y no en una
 * petición que el backend rechaza.
 */
export interface NewCustomAgentInput {
    identity: {
        name: string;
        role: Role;
        color: string;
    };
    brain_config: {
        model: string;
        temperature: number;
        system_prompt: string;
    };
    owner_user_id?: string;
    is_public?: boolean;
}

/** Directores de fábrica y agentes a medida: quién puede hablar. */
export interface AgentsSlice {
    coreAgents: Agent[];
    customAgents: Agent[];

    fetchCustomAgents: () => Promise<void>;
    /** Devuelve el id del agente creado (D67): quien lo crea no puede
     *  suponer que es `customAgents[0]`. */
    addCustomAgent: (data: NewCustomAgentInput) => Promise<string>;
    deleteCustomAgent: (id: string) => Promise<void>;
    getAgents: () => Agent[];
    /** D28: devuelven `false` si el retoque no se pudo persistir. */
    renameAgent: (id: string, newName: string) => boolean;
    updateAgentColor: (id: string, newHexColor: string) => boolean;
}

/**
 * Qué conversación está abierta y con quién.
 *
 * `selectedAgentId` vive aquí y no en `AgentsSlice` porque no es «qué agente
 * existe» sino «qué canal está abierto»: lo escriben `createNewSession`,
 * `loadSession` y `deleteSession`, y sólo se lee para saber a quién enviar.
 */
export interface SessionsSlice {
    sessions: ChatSession[];
    /**
     * Si el historial ya ha vuelto del backend (con o sin juntas dentro).
     *
     * Existe para que la barra lateral pueda distinguir «todavía no sé» de «no
     * tienes ninguna junta». Sin este dato una cuenta nueva y una carga en
     * vuelo se ven igual —una sección ausente— y el usuario nuevo aterriza en
     * una barra lateral que parece rota (tarea 3.6).
     */
    historialCargado: boolean;
    currentSessionId: string | null;
    selectedAgentId: string | null;
    sessionsByAgent: Record<string, string>; // agentId → sessionId (aislamiento de chats)

    fetchSessions: () => Promise<void>;
    createNewSession: (agentId?: string) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    selectAgent: (agentId: string) => void;
    updateSessionMetadata: (sessionId: string, updates: { title?: string; visual_config?: any }) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    /**
     * Borrado optimista con ventana para deshacer (PLAN §6 Q5).
     *
     * Quita la junta de la vista al instante y espera 8 s antes de pedirle al
     * backend que la borre de verdad. Devuelve `false` si no había tal junta.
     */
    deleteSessionConDeshacer: (sessionId: string) => boolean;
    /** Cancela un borrado en su ventana y devuelve la junta a su sitio. */
    undoDeleteSession: (sessionId: string) => boolean;
}

/** El hilo y su transmisión: mensajes, tokens en vuelo y cancelación. */
export interface MessagesSlice {
    messagesBySession: Record<string, Message[]>;
    streamingSessionIds: string[];
    abortController: AbortController | null;

    sendMessage: (content: string, opts?: { regenerateFromId?: string }) => Promise<void>;
    stopGeneration: () => void;
    getCurrentMessages: () => Message[];
}

/** Artefactos: los del historial, los que llegan por stream y el panel. */
export interface ArtifactsSlice {
    artifacts: Artifact[];
    activeArtifactId: string | null;
    isArtifactPanelOpen: boolean;
    streamingArtifactBySession: Record<string, string | null>;

    addArtifact: (artifact: Artifact) => void;
    setActiveArtifact: (id: string | null) => void;
    toggleArtifactPanel: () => void;
    getArtifacts: () => Artifact[];
}

/**
 * Estado vivo del debate (war-room).
 *
 * No tiene acciones propias a propósito: sus dos únicos escritores son el
 * stream SSE (`boardStreamHandlers`) y `loadSession`, que lo reconstruye del
 * historial. Ese segundo acoplamiento es el P0 F2 y viaja explícito en
 * `identidadDeSesion`.
 */
export interface BoardSlice {
    boardSession: BoardSessionState | null;
}

/** Interruptores de chrome que no pertenecen a ningún dominio. */
export interface UiSlice {
    isSidebarOpen: boolean;
    isAgentModalOpen: boolean;

    toggleSidebar: (open?: boolean) => void;
    toggleAgentModal: (open?: boolean) => void;
}

/** El canal de errores por método, compartido por todos los slices. */
export interface ErrorsSlice {
    errorStates: ErrorStates;
    /** Cierra un aviso concreto. Lo usa `ErrorOverlay` al descartar o reintentar. */
    clearError: (context: ErrorContext) => void;
}

/** El borrado al cambiar de cuenta (A6). Cruza todos los slices. */
export interface ResetSlice {
    resetState: () => void;
}

export type ChatState =
    & AgentsSlice
    & SessionsSlice
    & MessagesSlice
    & ArtifactsSlice
    & BoardSlice
    & UiSlice
    & ErrorsSlice
    & ResetSlice;

export type ChatSet = StoreApi<ChatState>['setState'];
export type ChatGet = StoreApi<ChatState>['getState'];
