import { useState, useEffect } from 'react';
import { Search, Zap, Crown, Monitor, TrendingUp, Briefcase, Plus, Users, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Role } from '@/types';
import { AgentCreationWizard } from './AgentCreationWizard';
import { BoardActivationModal } from './BoardActivationModal';
import { chatService } from '@/services/api';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const getRoleIcon = (role: Role) => {
    switch (role) {
        case 'CEO': return Crown;
        case 'CTO': return Monitor;
        case 'CMO': return TrendingUp;
        case 'CFO': return Briefcase;
        case 'system': return Users;
        default: return Zap;
    }
};

export function AgentSelectorModal() {
    const navigate = useNavigate();
    const {
        isAgentModalOpen,
        toggleAgentModal,
        createNewSession,
        getAgents,
        fetchCustomAgents,
        deleteCustomAgent
    } = useChatStore();

    const [searchQuery, setSearchQuery] = useState("");
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    // Board activation modal: al elegir "Junta Directiva" sin debate activado.
    const [boardModalOpen, setBoardModalOpen] = useState(false);
    // D18 (1.9): borrar un agente propio era un clic sin vuelta atrás.
    const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        if (isAgentModalOpen) {
            fetchCustomAgents();
        }
    }, [isAgentModalOpen]);

    const allAgents = getAgents();

    // Separate group chat from individual agents
    const groupChat = allAgents.find(a => a.id === 'group-chat');
    const coreExperts = allAgents.filter(a => ['CEO', 'CTO', 'CMO', 'CFO'].includes(a.role) && a.id !== 'group-chat');
    const customExperts = allAgents.filter(a => a.role === 'specialist');

    // Apply search filter
    const filterBySearch = (agents: typeof allAgents) =>
        agents.filter(a =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );

    const filteredCoreExperts = filterBySearch(coreExperts);
    const filteredCustomExperts = filterBySearch(customExperts);
    const showGroupChat = !searchQuery || groupChat?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 'junta directiva'.includes(searchQuery.toLowerCase());

    const openSession = async (agentId: string) => {
        if (isLoadingSession) return;
        setIsLoadingSession(true);
        try {
            const sessionId = await createNewSession(agentId);
            toggleAgentModal(false);
            navigate(`/chat/${sessionId}`);
        } finally {
            setIsLoadingSession(false);
        }
    };

    const handleSelectAgent = async (agentId: string) => {
        // Servicio estrella: al crear una Junta Directiva, si el debate no está
        // activado, ofrecemos activarlo en 1 clic (con su coste) en vez de obligar
        // a ir a Configuración.
        if (agentId === 'group-chat') {
            try {
                const settings = await chatService.getBoardSettings();
                if (!settings.board_meeting_enabled) {
                    setBoardModalOpen(true);
                    return;
                }
            } catch { /* si falla, seguimos al chat igualmente */ }
        }
        await openSession(agentId);
    };

    const handleActivateBoard = async (devil: boolean) => {
        setIsLoadingSession(true);
        try {
            await chatService.updateBoardSettings({ board_meeting_enabled: true, board_devils_advocate: devil });
        } catch { /* continuamos aunque el PATCH falle */ }
        setBoardModalOpen(false);
        await openSession('group-chat');
    };

    const handleAgentCreated = (_agentId: string) => {
        setIsWizardOpen(false);
        fetchCustomAgents();
    };

    return (
        <>
        <Modal
            open={isAgentModalOpen}
            onClose={() => toggleAgentModal(false)}
            size="lg"
            title="Nuevo chat"
            description="Elige un modo de trabajo para iniciar una nueva conversación."
        >
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-8"
                            >
                                {/* Search Area */}
                                <div className="relative group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-content-muted group-focus-within:text-accent transition-colors" aria-hidden="true" />
                                    <input
                                        id="agent-search"
                                        aria-label="Buscar agente o grupo"
                                        type="search"
                                        placeholder="Buscar agente o grupo..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full glass-input rounded-sm py-3 pl-12 pr-5 text-base text-content placeholder:text-content-quiet"
                                    />
                                </div>

                                <div className="space-y-8">
                                    {/* ── SECTION 1: CHATS GRUPALES ── */}
                                    {showGroupChat && groupChat && (
                                        <section>
                                            <h3 className="text-micro font-bold text-content-muted uppercase mb-3 flex items-center gap-2">
                                                <Users className="h-3.5 w-3.5" aria-hidden="true" /> Chats grupales
                                            </h3>
                                            <p className="text-xs text-content-muted mb-4 leading-relaxed">
                                                Un orquestador analiza tu consulta y delega al experto más adecuado. Al entrar podrás activar el <strong className="text-accent">debate de la junta</strong> con un clic para que todos los directores debatan entre sí.
                                            </p>
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.985 }}
                                                onClick={() => handleSelectAgent(groupChat.id)}
                                                className="w-full flex items-center gap-4 p-5 rounded-md bg-surface-2 border border-stroke-edge hover:border-brass-600 transition-colors text-left relative overflow-hidden group"
                                            >
                                                <div className="h-14 w-14 rounded-sm bg-brass-600/20 border border-brass-400/40 flex items-center justify-center">
                                                    <span className="text-2xl" role="img" aria-label="Junta">🏛️</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-content-strong group-hover:text-accent transition-colors">Junta Directiva</p>
                                                    <p className="text-xs text-content-muted mt-1">Orquestación multi-agente — CEO, CTO, CMO y CFO colaboran en tus consultas.</p>
                                                </div>
                                            </motion.button>
                                        </section>
                                    )}

                                    {/* ── SECTION 2: MIS EXPERTOS ── */}
                                    <section>
                                        <h3 className="text-micro font-bold text-content-muted uppercase mb-3 flex items-center gap-2">
                                            <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Mis expertos
                                        </h3>
                                        <p className="text-xs text-content-muted mb-4 leading-relaxed">
                                            Chats individuales con un experto específico. Respuestas rápidas y enfocadas.
                                        </p>
                                        {filteredCoreExperts.length === 0 && filteredCustomExperts.length === 0 && searchQuery && (
                                            /* §9.14: la búsqueda sin resultados dice qué falta y qué hacer. */
                                            <p className="mb-4 text-xs text-content-muted">
                                                Ningún experto se llama así. Borra la búsqueda o crea uno nuevo.
                                            </p>
                                        )}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {/* Core experts: CEO, CTO, CMO, CFO */}
                                            {filteredCoreExperts.map((agent: any) => {
                                                const Icon = getRoleIcon(agent.role);
                                                return (
                                                    <motion.button
                                                        type="button"
                                                        whileTap={{ scale: 0.985 }}
                                                        key={agent.id}
                                                        onClick={() => handleSelectAgent(agent.id)}
                                                        className="flex items-center gap-4 p-5 rounded-md bg-surface-2 border border-stroke-edge hover:border-brass-600 transition-colors text-left relative overflow-hidden group"
                                                    >
                                                        <div className={cn(
                                                            "h-14 w-14 rounded-sm flex items-center justify-center border border-stroke-edge bg-surface-3",
                                                            agent.color
                                                        )}>
                                                            <Icon className="h-7 w-7" aria-hidden="true" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-content-strong group-hover:text-accent transition-colors">{agent.name}</p>
                                                            <p className="text-xs text-content-muted mt-1 line-clamp-1">{agent.description}</p>
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}

                                            {/* Custom experts */}
                                            {filteredCustomExperts.map((agent: any) => (
                                                <div key={agent.id} className="relative group" data-row>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectAgent(agent.id)}
                                                        className="w-full flex items-center gap-4 p-5 pe-14 rounded-md bg-surface-2 border border-stroke-edge hover:border-brass-600 transition-colors text-left"
                                                    >
                                                        <div className="h-14 w-14 rounded-sm bg-surface-3 border border-stroke-edge flex items-center justify-center font-bold text-accent">
                                                            {agent.avatar}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-content-strong group-hover:text-accent transition-colors truncate">{agent.name}</p>
                                                            <p className="text-xs text-content-muted mt-1 line-clamp-1 truncate">{agent.description}</p>
                                                        </div>
                                                    </button>
                                                    {/* El borrado de un agente propio es destructivo: pasa por <ConfirmDialog> (1.9). */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteAgent({ id: agent.id, name: agent.name })}
                                                        aria-label={`Eliminar el agente ${agent.name}`}
                                                        data-row-actions
                                                        className="absolute top-1/2 end-2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-sm text-dissent hover:bg-dissent/10 transition-colors"
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Create new agent button */}
                                            <motion.button
                                                type="button"
                                                whileTap={{ scale: 0.985 }}
                                                onClick={() => setIsWizardOpen(true)}
                                                className="flex flex-col items-center justify-center gap-3 p-5 rounded-md border-2 border-dashed border-stroke-edge hover:border-brass-600 transition-colors font-medium text-content-muted hover:text-accent"
                                            >
                                                <div className="p-3 bg-surface-3 rounded-sm">
                                                    <Plus className="h-6 w-6" aria-hidden="true" />
                                                </div>
                                                <span className="text-sm">Crear agente nuevo</span>
                                            </motion.button>
                                        </div>
                                    </section>
                                </div>
                            </motion.div>
        </Modal>

        <AgentCreationWizard
            isOpen={isWizardOpen}
            onClose={() => setIsWizardOpen(false)}
            onAgentCreated={handleAgentCreated}
        />
        <ConfirmDialog
            open={confirmDeleteAgent !== null}
            onClose={() => setConfirmDeleteAgent(null)}
            onConfirm={async () => {
                if (!confirmDeleteAgent) return;
                await deleteCustomAgent(confirmDeleteAgent.id);
                setConfirmDeleteAgent(null);
            }}
            question="¿Eliminar el agente"
            objectName={confirmDeleteAgent?.name ?? ''}
            consequence="Se borran su configuración y su base de conocimiento. No se puede deshacer."
        />
        <BoardActivationModal
            open={boardModalOpen}
            loading={isLoadingSession}
            onActivate={handleActivateBoard}
            onRouterOnly={() => { setBoardModalOpen(false); openSession('group-chat'); }}
            onClose={() => setBoardModalOpen(false)}
        />
        </>
    );
}
