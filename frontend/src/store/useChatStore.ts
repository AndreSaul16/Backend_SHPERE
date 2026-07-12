import { create } from 'zustand';
import type { Agent, Message, Role, ChatSession, BoardVote, BoardPhase } from '../types';
import type { Artifact } from '../types/artifact';

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
import { v4 as uuidv4 } from 'uuid';
import { chatService } from '../services/api';
import { NetworkError, SessionError, type ErrorContext } from '../lib/errors';

interface ChatState {
    coreAgents: Agent[];
    customAgents: Agent[];
    sessions: ChatSession[];
    currentSessionId: string | null;
    selectedAgentId: string | null;
    messagesBySession: Record<string, Message[]>;
    sessionsByAgent: Record<string, string>; // agentId → sessionId (aislamiento de chats)
    streamingSessionIds: string[];
    abortController: AbortController | null;
    isAgentModalOpen: boolean;
    isArtifactPanelOpen: boolean;
    isSidebarOpen: boolean;
    artifacts: Artifact[];
    streamingArtifactBySession: Record<string, string | null>;
    activeArtifactId: string | null;
    errorStates: Record<ErrorContext, string | null>; // Errores por método
    boardSession: BoardSessionState | null; // Board V2: estado vivo del debate (war-room)

    // Acciones
    fetchCustomAgents: () => Promise<void>;
    addCustomAgent: (data: any) => Promise<void>;
    deleteCustomAgent: (id: string) => Promise<void>;
    toggleAgentModal: (open?: boolean) => void;
    getAgents: () => Agent[];
    fetchSessions: () => Promise<void>;
    createNewSession: (agentId?: string) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    selectAgent: (agentId: string) => void;
    toggleSidebar: (open?: boolean) => void;
    sendMessage: (content: string, opts?: { regenerateFromId?: string }) => Promise<void>;
    stopGeneration: () => void;
    toggleArtifactPanel: () => void;
    renameAgent: (id: string, newName: string) => void;
    updateAgentColor: (id: string, newHexColor: string) => void;
    addArtifact: (artifact: Artifact) => void;
    setActiveArtifact: (id: string | null) => void;
    updateSessionMetadata: (sessionId: string, updates: { title?: string; visual_config?: any }) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    resetState: () => void;

    // Selector
    getCurrentMessages: () => Message[];
    getArtifacts: () => Artifact[];
}

// Saludos personalizados por agente (sin gastar tokens)
const AGENT_GREETINGS: Record<string, string> = {
    'group-chat': 'Bienvenido a la **Junta Directiva** de SPHERE. El Router analizará tu consulta y delegará al agente más adecuado.',
    'ceo-1': '¡Hola! Soy **Oberon**, tu CEO estratégico. Estoy aquí para ofrecerte visión de alto nivel, decisiones ejecutivas y liderazgo empresarial. ¿En qué puedo ayudarte?',
    'cto-1': '¡Saludos! Soy **Nexus**, tu CTO. Mi expertise incluye arquitectura cloud, DevOps, seguridad técnica y decisiones de infraestructura. ¿Cuál es tu desafío técnico?',
    'cmo-1': '¡Bienvenido! Soy **Vortex**, tu CMO. Me especializo en estrategia de marketing, branding, growth hacking y posicionamiento de mercado. ¿Qué necesitas impulsar?',
    'cfo-1': '¡Hola! Soy **Ledger**, tu CFO. Puedo ayudarte con análisis financiero, gestión de riesgos, proyecciones y optimización de costes. ¿Qué números analizamos?',
};

// Lista de Agentes
const MOCK_AGENTS: Agent[] = [
    {
        id: 'group-chat',
        name: 'Junta Directiva',
        role: 'system',
        avatar: '🏛️',
        description: 'Orquestación completa - El Router decide quién responde.',
        color: 'text-text-secondary',
        hexColor: '#00F0C8', // Cyan Electrico (Default)
        isOnline: true,
        capabilities: ['Análisis Estratégico', 'Decisiones Ejecutivas', 'Coordinación Multi-agente'],
    },
    {
        id: 'ceo-1',
        name: 'Oberon (CEO)',
        role: 'CEO',
        avatar: 'O',
        description: 'Visión estratégica y liderazgo ejecutivo.',
        color: 'text-agent-ceo',
        hexColor: '#8A63D2', // Purple
        isOnline: true,
        capabilities: ['Estrategia Corporativa', 'Toma de Decisiones', 'Visión de Negocio'],
    },
    {
        id: 'cto-1',
        name: 'Nexus (CTO)',
        role: 'CTO',
        avatar: 'N',
        description: 'Experto en Arquitectura Cloud y DevOps.',
        color: 'text-agent-cto',
        hexColor: '#00C1B3', // Teal
        isOnline: true,
        capabilities: ['Cloud Architecture', 'DevOps', 'Seguridad Técnica'],
    },
    {
        id: 'cmo-1',
        name: 'Vortex (CMO)',
        role: 'CMO',
        avatar: 'V',
        description: 'Estratega de Mercado y Posicionamiento.',
        color: 'text-agent-cmo',
        hexColor: '#E34A95', // Magenta
        isOnline: true,
        capabilities: ['Marketing Digital', 'Branding', 'Growth Hacking'],
    },
    {
        id: 'cfo-1',
        name: 'Ledger (CFO)',
        role: 'CFO',
        avatar: 'L',
        description: 'Auditor Financiero y Gestión de Riesgos.',
        color: 'text-agent-cfo',
        hexColor: '#6B8AFD', // Indigo
        isOnline: true,
        capabilities: ['Análisis Financiero', 'Gestión de Riesgos', 'Proyecciones'],
    },
];

// Board V2: el Abogado del Diablo NO es un experto seleccionable (no entra en
// MOCK_AGENTS ni en getGroupMembers). Es un asiento opcional del debate; su
// identidad visual se resuelve aquí cuando aparece en el war-room / burbujas.
export const BOARD_DEVIL_AGENT: Agent = {
    id: 'devil-1',
    name: 'Némesis (Abogado del Diablo)',
    role: 'DEVIL',
    avatar: '⚔️',
    description: 'Estresa la decisión: busca el fallo que el consenso ignora.',
    color: 'text-rose-400',
    hexColor: '#FF4D6D',
    isOnline: true,
};

// Resuelve la identidad visual de un rol de board (incluido DEVIL, que no está
// en la lista de agentes seleccionables).
export const getBoardAgentByRole = (agents: Agent[], role: string): Agent | undefined => {
    if (role === 'DEVIL') return BOARD_DEVIL_AGENT;
    return agents.find(a => a.role === role && a.id !== 'group-chat');
};

// Helper: crear mensaje de saludo
const createGreeting = (agentId: string, agents: Agent[]): Message => {
    const agent = agents.find(a => a.id === agentId);
    return {
        id: uuidv4(),
        role: agentId === 'group-chat' ? 'system' : (agent?.role || 'system'),
        content: AGENT_GREETINGS[agentId] || `Conectado con ${agent?.name || 'agente'}.`,
        timestamp: new Date(),
        agentId: agentId !== 'group-chat' ? agentId : undefined,
    };
};

// Helpers
export const getGroupMembers = (agents: Agent[]) => agents.filter(a => a.id !== 'group-chat');

export const useChatStore = create<ChatState>((set, get) => ({
    coreAgents: MOCK_AGENTS,
    customAgents: [],
    sessions: [],
    currentSessionId: null,
    selectedAgentId: 'group-chat',
    messagesBySession: {},
    sessionsByAgent: {}, // Mapeo agente → sesión para aislamiento de chats
    streamingSessionIds: [],
    abortController: null,
    isAgentModalOpen: false,
    isArtifactPanelOpen: false,
    isSidebarOpen: true,
    artifacts: [],
    activeArtifactId: null,
    streamingArtifactBySession: {},
    boardSession: null,
    errorStates: {
        fetch_agents: null,
        create_session: null,
        send_message: null,
        load_history: null,
        artifact_parser: null,
        core_engine: null
    },

    // Selectores
    getCurrentMessages: () => {
        const { currentSessionId, messagesBySession } = get();
        return currentSessionId ? (messagesBySession[currentSessionId] || []) : [];
    },

    getArtifacts: () => get().artifacts,

    // Helper para obtener todos los agentes (Core + Custom)
    getAgents: () => [...get().coreAgents, ...get().customAgents],

    fetchSessions: async () => {
        try {
            const sessions = await chatService.getSessions();
            set({ sessions });
        } catch (error: any) {
            console.error('Error fetching sessions:', error);
            const sphereError = new NetworkError('Error al obtener sesiones', 'fetch_agents', error);
            set((state) => ({ errorStates: { ...state.errorStates, fetch_agents: sphereError.message } }));
        }
    },

    fetchCustomAgents: async () => {
        set((state) => ({ errorStates: { ...state.errorStates, fetch_agents: null } }));
        try {
            const customAgentsData = await chatService.getCustomAgents();
            // Mapear de Response a Agent tipo frontend evolucionado
            const mapped: Agent[] = customAgentsData.map((a: any) => ({
                id: a.agent_id,
                name: a.identity.name,
                role: a.identity.role as Role,
                description: a.brain_config.system_prompt.substring(0, 100) + '...',
                avatar: a.identity.name.charAt(0).toUpperCase(),
                color: 'bg-surface border-white/5',
                hexColor: a.identity.color || '#00f2ff',
                isOnline: true,
                identity: a.identity,
                brain_config: a.brain_config,
                owner_user_id: a.owner_user_id,
                is_public: a.is_public
            }));
            set({ customAgents: mapped });
        } catch (error: any) {
            const sphereError = new NetworkError('Error al obtener agentes personalizados', 'fetch_agents', error);
            set((state) => ({ errorStates: { ...state.errorStates, fetch_agents: sphereError.message } }));
        }
    },

    addCustomAgent: async (data) => {
        set((state) => ({ errorStates: { ...state.errorStates, fetch_agents: null } }));
        try {
            const newAgentData = await chatService.createCustomAgent(data);
            const mapped: Agent = {
                id: newAgentData.agent_id,
                name: newAgentData.identity.name,
                role: newAgentData.identity.role as Role,
                description: newAgentData.brain_config.system_prompt.substring(0, 100) + '...',
                avatar: newAgentData.identity.name.charAt(0).toUpperCase(),
                color: 'bg-surface border-white/5',
                hexColor: newAgentData.identity.color || '#00f2ff',
                isOnline: true,
                identity: newAgentData.identity,
                brain_config: newAgentData.brain_config,
                owner_user_id: newAgentData.owner_user_id,
                is_public: newAgentData.is_public
            };
            set(state => ({ customAgents: [mapped, ...state.customAgents] }));
        } catch (error: any) {
            const sphereError = new NetworkError('Error al crear agente personalizado', 'fetch_agents', error);
            set((state) => ({ errorStates: { ...state.errorStates, fetch_agents: sphereError.message } }));
            throw sphereError; // Re-throw to allow UI to handle specific error
        }
    },

    deleteCustomAgent: async (id) => {
        try {
            await chatService.deleteCustomAgent(id);
            set(state => ({ customAgents: state.customAgents.filter(a => a.id !== id) }));
        } catch (error) {
            console.error('Error deleting custom agent:', error);
        }
    },

    createNewSession: async (agentId) => {
        set((state) => ({ errorStates: { ...state.errorStates, create_session: null } }));
        try {
            const targetId = agentId || 'group-chat';
            const allAgents = [...get().coreAgents, ...get().customAgents];
            const agent = allAgents.find(a => a.id === targetId);
            const isGroup = targetId === 'group-chat';
            const title = agent ? agent.name : 'Nueva Sesión';

            // Determine agent_ref_type: core agents use role strings, custom use UUIDs
            const isCoreAgent = ['group-chat', 'ceo-1', 'cto-1', 'cmo-1', 'cfo-1'].includes(targetId);
            const agentRefType = isCoreAgent ? 'core' : 'custom';
            const baseAgentId = isCoreAgent ? (agent?.role || 'CEO') : targetId;

            // Prepare session creation payload
            const sessionPayload = {
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
            };

            // Note: services/api chatService.createSession might need update to accept object or changed args
            // For now assuming we pass args that match the new backend expectation if we updated api service
            // Or we update the service call here if the service was generic.
            // Let's assume we need to update api.ts as well, but for now let's pass loosely.
            // ACTUALLY, checking current api.ts usage in file view: 
            // createSession(title, role, visual_config, user_id)
            // We need to pass type and members. The current api.ts likely has fixed args.
            // I should update services/api.ts first ideally, but I can't see it now.
            // I will assume I need to update api.ts too.
            // Let's modify this call to pass an object if I refactor api.ts, or just extra args.

            const newSession = await chatService.createSession(
                sessionPayload
            );
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
            set((state) => ({
                errorStates: { ...state.errorStates, create_session: sphereError.message }
            }));
            throw sphereError;
        }
    },

    loadSession: async (sessionId) => {
        const { messagesBySession, coreAgents, customAgents } = get();
        const allAgents = [...coreAgents, ...customAgents];

        set((state) => ({
            errorStates: { ...state.errorStates, load_history: null }
        }));

        if (messagesBySession[sessionId] && messagesBySession[sessionId].length > 0) {
            // Detectar el agentId de la sesión en caché
            const cachedMessages = messagesBySession[sessionId];
            const agentIds = cachedMessages
                .filter(m => m.agentId && m.agentId !== 'system')
                .map(m => m.agentId);
            const detectedAgentId = agentIds.length > 0 ? agentIds[0] : 'group-chat';

            if (import.meta.env.DEV) console.log('📦 [loadSession] Cache:', { sessionId, detectedAgentId, agentIds });
            set({ currentSessionId: sessionId, selectedAgentId: detectedAgentId });
            return;
        }

        set((state) => ({
            streamingSessionIds: [...state.streamingSessionIds, sessionId]
        }));

        try {
            const history = await chatService.getSessionHistory(sessionId);
            const sessionArtifacts: Artifact[] = [];
            const mappedMessages: Message[] = history.messages.map((m: any, idx: number) => {
                let role: Role = 'system';
                let resolvedAgentId: string | undefined;
                if (m.type === 'human') role = 'user';
                else if (m.type === 'ai') {
                    const agentId = m.additional_kwargs?.agent_id;
                    const agentRole = m.additional_kwargs?.agent_role;

                    // Intentar resolver por agent_id primero, luego por agent_role
                    let foundAgent = agentId ? allAgents.find(a => a.id === agentId) : null;
                    if (!foundAgent && agentRole) {
                        foundAgent = allAgents.find(a => a.role === agentRole && a.id !== 'group-chat');
                    }

                    // Validar que el role es un valor válido de Role (nunca 'assistant')
                    const VALID_ROLES = ['user', 'system', 'CTO', 'CMO', 'CFO', 'CEO', 'specialist', 'DEVIL'];
                    const candidateRole = foundAgent?.role || agentRole;
                    role = (candidateRole && VALID_ROLES.includes(candidateRole) ? candidateRole : 'CEO') as Role;
                    resolvedAgentId = foundAgent?.id;
                    // Board V2: rol DEVIL no está en allAgents; resolver su identidad visual.
                    if (!resolvedAgentId && agentRole === 'DEVIL') resolvedAgentId = BOARD_DEVIL_AGENT.id;
                }

                // --- LÓGICA DE RECUPERACIÓN DE ARTEFACTOS ---
                // El backend guarda los artefactos persistidos como XML dentro del contenido
                let processedContent = m.content;
                const artifactRegex = /<sphere_artifact\s+([^>]+)>([\s\S]*?)<\/sphere_artifact>/g;

                let match;
                while ((match = artifactRegex.exec(m.content)) !== null) {
                    const [fullTag, attrsStr, content] = match;

                    const titleMatch = /title=\\?"([^\\"]+)\\?"/.exec(attrsStr);
                    const typeMatch = /artifact_type=\\?"([^\\"]+)\\?"/.exec(attrsStr);
                    const langMatch = /language=\\?"([^\\"]*)\\?"/.exec(attrsStr);

                    const title = titleMatch ? titleMatch[1] : "untitled";
                    const rawType = typeMatch ? typeMatch[1] : "code";
                    const language = langMatch ? langMatch[1] : "";

                    const typeMap: Record<string, 'code' | 'markdown' | 'mermaid' | 'data_table'> = {
                        'code': 'code', 'markdown': 'markdown', 'mermaid': 'mermaid', 'csv': 'data_table',
                    };

                    const artifactId = uuidv4();
                    const artifact: Artifact = {
                        id: artifactId,
                        title,
                        type: typeMap[rawType] || 'code',
                        language: language || undefined,
                        content: content.trim(),
                        agentId: m.additional_kwargs?.agent_id || 'system',
                        createdAt: new Date(m.additional_kwargs?.timestamp || Date.now()),
                    };

                    sessionArtifacts.push(artifact);
                    // Reemplazamos el XML por nuestro formato interno que MessageBubble entiende
                    processedContent = processedContent.replace(fullTag, `\n\n[ARTIFACT:${artifactId}:${title}]\n\n`);
                }

                // Board V2: recuperar voto/fase/conclusión persistidos en additional_kwargs.
                const rawVote = m.additional_kwargs?.board_vote;
                const vote = (rawVote && typeof rawVote === 'object' && rawVote.decision)
                    ? { decision: rawVote.decision, confidence: typeof rawVote.confidence === 'number' ? rawVote.confidence : 50 }
                    : undefined;

                return {
                    id: `history-${sessionId}-${idx}`,
                    role,
                    content: processedContent,
                    timestamp: new Date(m.additional_kwargs?.timestamp || Date.now()),
                    agentId: resolvedAgentId || m.additional_kwargs?.agent_id || undefined,
                    vote,
                    phase: m.additional_kwargs?.board_phase || undefined,
                    isConclusion: !!m.additional_kwargs?.is_conclusion,
                };
            });

            set((state) => {
                // Priorizar base_agent_id de la sesión si existe
                const session = state.sessions.find(s => s.session_id === sessionId);
                let detectedAgentId = session?.base_agent_id || 'group-chat';

                // Solo si no hay base_agent_id, intentamos inferirlo de los mensajes
                if (detectedAgentId === 'group-chat' || !detectedAgentId) {
                    const agentIds = mappedMessages
                        .filter(m => m.agentId && m.agentId !== 'system')
                        .map(m => m.agentId);
                    if (agentIds.length > 0) {
                        detectedAgentId = agentIds[0] as string;
                    }
                }

                if (import.meta.env.DEV) console.log('🌐 [loadSession] Servidor:', { sessionId, detectedAgentId, sessionBaseAgent: session?.base_agent_id });

                return {
                    currentSessionId: sessionId,
                    selectedAgentId: detectedAgentId,
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

    addArtifact: (artifact) => set((state) => ({
        artifacts: [...state.artifacts, artifact],
        activeArtifactId: artifact.id,
        isArtifactPanelOpen: true,
    })),

    setActiveArtifact: (id) => set({
        activeArtifactId: id,
        isArtifactPanelOpen: true
    }),

    selectAgent: (agentId) => {
        set({ selectedAgentId: agentId });
        if (import.meta.env.DEV) console.log(`🔌 Canal seleccionado: ${agentId}`);
    },

    toggleArtifactPanel: () => set((state) => ({ isArtifactPanelOpen: !state.isArtifactPanelOpen })),

    renameAgent: (id, newName) => {
        set((state) => ({
            coreAgents: state.coreAgents.map(agent =>
                agent.id === id ? { ...agent, name: newName } : agent
            ),
            customAgents: state.customAgents.map(agent =>
                agent.id === id ? { ...agent, name: newName } : agent
            ),
        }));
    },

    updateAgentColor: (id, newHexColor) => {
        set((state) => ({
            coreAgents: state.coreAgents.map(agent =>
                agent.id === id ? { ...agent, hexColor: newHexColor } : agent
            ),
            customAgents: state.customAgents.map(agent =>
                agent.id === id ? { ...agent, hexColor: newHexColor } : agent
            ),
        }));
    },

    toggleSidebar: (open) => set((state) => ({
        isSidebarOpen: open !== undefined ? open : !state.isSidebarOpen
    })),

    toggleAgentModal: (open) => set((state) => ({
        isAgentModalOpen: open !== undefined ? open : !state.isAgentModalOpen
    })),

    sendMessage: async (content, opts) => {
        const regenerateFromId = opts?.regenerateFromId;
        const { currentSessionId, selectedAgentId } = get();
        const allAgents = [...get().coreAgents, ...get().customAgents];

        let sessionId = currentSessionId;
        if (!sessionId) {
            sessionId = await get().createNewSession(selectedAgentId || undefined);
        }

        // Regeneración: eliminar desde el mensaje clickeado para adelante,
        // SIN crear nuevo mensaje de usuario. El backend recibe el historial
        // truncado y continúa naturalmente desde donde quedó.
        if (regenerateFromId) {
            set((state) => {
                const msgs = [...(state.messagesBySession[sessionId!] || [])];
                const fromIdx = msgs.findIndex(m => m.id === regenerateFromId);
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

        try {
            const selectedAgent = allAgents.find(a => a.id === selectedAgentId);
            const isGroup = selectedAgentId === 'group-chat';
            const targetRole: Role | undefined =
                (isGroup || !selectedAgent) ? undefined : selectedAgent?.role;

            // Placeholder inicial. En grupo arrancamos como "CEO" (el board siempre
            // abre con el CEO) para no mostrar una burbuja de sistema vacía mientras
            // el clasificador decide; board_agent / onRole la reetiquetan al instante.
            // activeBotMsgId es mutable: en board, cada agente abre su propia burbuja.
            const botMsgId = uuidv4();
            let activeBotMsgId = botMsgId;
            // Board V2: mapa rol→id de burbuja para enrutar tokens que llegan
            // intercalados (CTO/CFO/CMO debaten en paralelo). claimedInitial controla
            // si la burbuja inicial vacía ya fue reclamada por el primer agente (CEO).
            const bubbleByRole: Record<string, string> = {};
            let claimedInitial = false;
            const botMsg: Message = {
                id: botMsgId,
                role: (targetRole || (isGroup ? 'CEO' : 'system')) as Role,
                content: '',
                timestamp: new Date(),
                agentId: isGroup ? 'ceo-1' : (selectedAgentId || undefined),
            };

            set((state) => ({
                messagesBySession: {
                    ...state.messagesBySession,
                    [sessionId!]: [...(state.messagesBySession[sessionId!] || []), botMsg]
                },
                // Reiniciar el estado del war-room en cada nuevo envío de grupo.
                boardSession: isGroup
                    ? {
                        active: false, phase: null, participants: [], statusByRole: {},
                        votes: {}, tally: null, unanimous: false, earlyExit: false,
                        cost: 5, devil: false, lastIntervention: null,
                    }
                    : null,
            }));

            // Usar una referencia local al sessionId para los callbacks
            const targetSessionId = sessionId!;

            // AbortController para permitir Stop Generation
            const abortController = new AbortController();
            set({ abortController });

            await chatService.streamChat(
                content,
                targetSessionId,
                {
                    onToken: (token, role) => {
                        // En board V2 el token trae rol → enrutar a la burbuja de ese
                        // agente (debaten en paralelo). Si no hay rol, burbuja activa.
                        const targetId = (role && bubbleByRole[role]) ? bubbleByRole[role] : activeBotMsgId;
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === targetId
                                        ? { ...msg, content: msg.content + token }
                                        : msg
                                ),
                            },
                        }));
                    },
                    onRole: (role) => {
                        // En grupo, resolver el agente real que responde por su rol
                        const matchingAgent = allAgents.find(a => a.role === role && a.id !== 'group-chat');
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, role: role as Role, agentId: matchingAgent?.id || msg.agentId }
                                        : msg
                                ),
                            },
                        }));
                    },
                    onBoardStart: (data) => {
                        // Confirmación visual de que el Board Meeting se disparó.
                        // Insertamos una nota de sistema JUSTO ANTES de la burbuja
                        // activa (estilo "X entró al grupo" de WhatsApp).
                        try {
                            const note = `🏛️ **Junta Directiva en sesión** — debatiendo entre ${data.agents.join(', ')}.`;
                            set((state) => {
                                const msgs = state.messagesBySession[targetSessionId] || [];
                                const idx = msgs.findIndex(m => m.id === activeBotMsgId);
                                const sysMsg: Message = {
                                    id: uuidv4(),
                                    role: 'system',
                                    content: note,
                                    timestamp: new Date(),
                                };
                                const next = [...msgs];
                                next.splice(idx >= 0 ? idx : next.length, 0, sysMsg);
                                return {
                                    messagesBySession: { ...state.messagesBySession, [targetSessionId]: next },
                                    boardSession: state.boardSession
                                        ? { ...state.boardSession, active: true }
                                        : state.boardSession,
                                };
                            });
                        } catch (e) {
                            if (import.meta.env.DEV) console.error('onBoardStart error:', e);
                        }
                    },
                    onBoardPlan: (data) => {
                        set((state) => ({
                            boardSession: state.boardSession
                                ? {
                                    ...state.boardSession,
                                    active: true,
                                    participants: data.participants,
                                    cost: data.cost,
                                    statusByRole: data.participants.reduce(
                                        (acc, r) => ({ ...acc, [r]: 'idle' as BoardAgentStatus }),
                                        { ...state.boardSession.statusByRole }
                                    ),
                                }
                                : state.boardSession,
                        }));
                    },
                    onBoardPhase: (data) => {
                        set((state) => ({
                            boardSession: state.boardSession
                                ? { ...state.boardSession, phase: data.phase as BoardPhase }
                                : state.boardSession,
                        }));
                    },
                    onBoardVote: (data) => {
                        const vote: BoardVote = {
                            decision: (data.vote as BoardVote['decision']) || 'CONDICIONAL',
                            confidence: typeof data.confidence === 'number' ? data.confidence : 50,
                        };
                        set((state) => {
                            // Pintar el voto como chip en la última burbuja de ese rol.
                            const bubbleId = bubbleByRole[data.role];
                            const msgs = (state.messagesBySession[targetSessionId] || []).map(m =>
                                m.id === bubbleId ? { ...m, vote } : m
                            );
                            return {
                                messagesBySession: { ...state.messagesBySession, [targetSessionId]: msgs },
                                boardSession: state.boardSession
                                    ? {
                                        ...state.boardSession,
                                        votes: { ...state.boardSession.votes, [data.role]: vote },
                                        statusByRole: { ...state.boardSession.statusByRole, [data.role]: 'done' },
                                    }
                                    : state.boardSession,
                            };
                        });
                    },
                    onBoardConsensus: (data) => {
                        set((state) => ({
                            boardSession: state.boardSession
                                ? {
                                    ...state.boardSession,
                                    tally: data.tally,
                                    unanimous: data.unanimous,
                                    earlyExit: data.early_exit,
                                }
                                : state.boardSession,
                        }));
                    },
                    onBoardIntervention: (data) => {
                        set((state) => ({
                            boardSession: state.boardSession
                                ? { ...state.boardSession, lastIntervention: data.text }
                                : state.boardSession,
                        }));
                    },
                    onBoardAgent: (data) => {
                        // Board V2: cada agente (CEO apertura, CTO/CFO/CMO en paralelo,
                        // devil, síntesis) abre SU propia burbuja, indexada por rol en
                        // bubbleByRole. El primer agente (CEO apertura) reclama la
                        // burbuja inicial vacía; el resto crean burbuja nueva.
                        try {
                            const matchingAgent = getBoardAgentByRole(allAgents, data.role);
                            const phase = data.phase as BoardPhase | undefined;
                            const msgs = get().messagesBySession[targetSessionId] || [];
                            const initial = msgs.find(m => m.id === botMsgId);
                            const initialEmpty = !claimedInitial && !!initial && !initial.content.trim() && !(initial.thinking || '').trim();

                            if (initialEmpty) {
                                claimedInitial = true;
                                activeBotMsgId = botMsgId;
                                bubbleByRole[data.role] = botMsgId;
                                set((state) => ({
                                    messagesBySession: {
                                        ...state.messagesBySession,
                                        [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(m =>
                                            m.id === botMsgId
                                                ? { ...m, role: data.role as Role, agentId: matchingAgent?.id ?? m.agentId, isConclusion: data.is_conclusion, phase }
                                                : m
                                        ),
                                    },
                                }));
                            } else {
                                const newId = uuidv4();
                                activeBotMsgId = newId;
                                bubbleByRole[data.role] = newId;
                                set((state) => ({
                                    messagesBySession: {
                                        ...state.messagesBySession,
                                        [targetSessionId]: [
                                            ...(state.messagesBySession[targetSessionId] || []),
                                            {
                                                id: newId,
                                                role: data.role as Role,
                                                content: '',
                                                timestamp: new Date(),
                                                agentId: matchingAgent?.id,
                                                isConclusion: data.is_conclusion,
                                                phase,
                                            },
                                        ],
                                    },
                                }));
                            }
                            // Actualizar estado del war-room: este rol pasa a "hablando".
                            set((state) => ({
                                boardSession: state.boardSession
                                    ? {
                                        ...state.boardSession,
                                        active: true,
                                        phase: phase ?? state.boardSession.phase,
                                        statusByRole: { ...state.boardSession.statusByRole, [data.role]: 'speaking' },
                                        devil: state.boardSession.devil || data.role === 'DEVIL',
                                    }
                                    : state.boardSession,
                            }));
                        } catch (e) {
                            if (import.meta.env.DEV) console.error('onBoardAgent error:', e);
                        }
                    },
                    onThinking: (piece, role) => {
                        // Razonamiento (reasoning_content) → se acumula en la burbuja
                        // del rol que piensa (board V2) o en la activa.
                        const targetId = (role && bubbleByRole[role]) ? bubbleByRole[role] : activeBotMsgId;
                        try {
                            set((state) => ({
                                messagesBySession: {
                                    ...state.messagesBySession,
                                    [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(m =>
                                        m.id === targetId
                                            ? { ...m, thinking: (m.thinking || '') + piece }
                                            : m
                                    ),
                                },
                            }));
                        } catch (e) {
                            if (import.meta.env.DEV) console.error('onThinking error:', e);
                        }
                    },
                    onArtifactOpen: (data) => {
                        const typeMap: Record<string, 'code' | 'markdown' | 'mermaid' | 'data_table'> = {
                            'code': 'code', 'markdown': 'markdown', 'mermaid': 'mermaid', 'csv': 'data_table',
                        };

                        const artifactId = uuidv4();
                        const artifact: Artifact = {
                            id: artifactId,
                            title: data.title,
                            type: typeMap[data.artifact_type] || 'code',
                            language: data.language || undefined,
                            content: '',
                            agentId: selectedAgentId || 'system',
                            createdAt: new Date(),
                        };

                        get().addArtifact(artifact);

                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, content: msg.content + `\n\n[ARTIFACT:${artifactId}:${data.title}]\n\n` }
                                        : msg
                                ),
                            },
                        }));

                        set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [targetSessionId]: artifactId } }));
                    },
                    onArtifactChunk: (content) => {
                        const artifactId = get().streamingArtifactBySession[targetSessionId];
                        if (!artifactId) return;

                        set((state) => ({
                            artifacts: state.artifacts.map(a =>
                                a.id === artifactId ? { ...a, content: a.content + content } : a
                            )
                        }));
                    },
                    onArtifactClose: () => {
                        set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [targetSessionId]: null } }));
                    },
                    onToolStart: (data) => {
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, content: msg.content + `\n[TOOL_START:${data.tool_name}]\n` }
                                        : msg
                                ),
                            },
                        }));
                    },
                    onToolResult: (data) => {
                        const truncated = data.result.substring(0, 300);
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, content: msg.content + `\n[TOOL_RESULT:${data.tool_name}:${truncated}]\n` }
                                        : msg
                                ),
                            },
                        }));
                    },
                    onToolError: (data) => {
                        // El placeholder se parsea con regex: sanear ']' y saltos de línea
                        const safeError = data.error.replace(/[\]\n\r]/g, ' ').substring(0, 200);
                        set((state) => ({
                            messagesBySession: {
                                ...state.messagesBySession,
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, content: msg.content + `\n[TOOL_ERROR:${data.tool_name}:${safeError}]\n` }
                                        : msg
                                ),
                            },
                        }));
                    },
                    onDone: () => {
                        set((state) => ({
                            streamingSessionIds: state.streamingSessionIds.filter(id => id !== targetSessionId),
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
                                [targetSessionId]: (state.messagesBySession[targetSessionId] || []).map(msg =>
                                    msg.id === activeBotMsgId
                                        ? { ...msg, content: msg.content + '\n\n⚠️ **Error de conexión.**' }
                                        : msg
                                ),
                            },
                            streamingSessionIds: state.streamingSessionIds.filter(id => id !== targetSessionId),
                            abortController: null,
                        }));
                    }
                },
                (targetRole as any) === "specialist" ? (selectedAgentId || undefined) : targetRole,
                abortController.signal,
                !!regenerateFromId,  // Pasar regenerate=true al backend cuando regeneramos
                isGroup ? 5 : 1  // Coste optimista: un board meeting descuenta 5 (A4)
            );
        } catch (error: any) {
            // No reportar error si fue una cancelación intencional (Stop Generation)
            if (error?.name === 'AbortError') {
                if (import.meta.env.DEV) console.log('🛑 Generación detenida por el usuario');
                return;
            }
            const sphereError = new NetworkError('Error en el flujo de transmisión', 'send_message', error);
            set((state) => ({
                streamingSessionIds: state.streamingSessionIds.filter(id => id !== sessionId),
                abortController: null,
                errorStates: { ...state.errorStates, send_message: sphereError.message }
            }));
            set(state => ({ streamingArtifactBySession: { ...state.streamingArtifactBySession, [sessionId!]: null } }));
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
    resetState: () => set({
        // Limpia TODO lo específico del usuario para evitar fuga de datos entre
        // cuentas en un navegador compartido (A6). Los coreAgents son globales
        // (CEO/CTO/...), así que se conservan.
        messagesBySession: {},
        artifacts: [],
        currentSessionId: null,
        selectedAgentId: null,
        streamingSessionIds: [],
        sessions: [],
        customAgents: [],
        sessionsByAgent: {},
        activeArtifactId: null,
        streamingArtifactBySession: {},
        boardSession: null,
        errorStates: {
            fetch_agents: null,
            create_session: null,
            send_message: null,
            load_history: null,
            artifact_parser: null,
            core_engine: null
        }
    }),

    updateSessionMetadata: async (sessionId: string, updates: { title?: string; visual_config?: any; members?: string[] }) => {
        try {
            const updatedSession = await chatService.updateSession(sessionId, updates);

            set((state) => ({
                sessions: state.sessions.map(s =>
                    s.session_id === sessionId ? { ...s, ...updatedSession } : s
                )
            }));

            if (import.meta.env.DEV) console.log('✅ [updateSessionMetadata] Success:', updatedSession);
        } catch (error) {
            if (import.meta.env.DEV) console.error('❌ [updateSessionMetadata] Error:', error);
            throw error;
        }
    },

    deleteSession: async (sessionId: string) => {
        try {
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
        } catch (error) {
            if (import.meta.env.DEV) console.error('❌ [deleteSession] Error:', error);
            throw error;
        }
    },
}));
