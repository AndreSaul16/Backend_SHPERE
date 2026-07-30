import { useRef, useState, useEffect, useCallback } from "react";
import { Send, Square, Paperclip, MoreVertical, Zap, ShieldCheck, Search, X, Download, Pin, Hand } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore, getGroupMembers } from "@/store/useChatStore";
import { chatService } from "@/services/api";
import { MessageBubble } from "./MessageBubble";
import { BoardWarRoom } from "./BoardWarRoom";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { cn } from "@/lib/utils";
import { exportAsMarkdown, downloadAsFile } from "@/utils/exportChat";
import { CreditsIndicator } from "@/components/CreditsIndicator";
import { useBillingStore } from "@/store/useBillingStore";
import { capture, ANALYTICS_EVENTS } from "@/lib/analytics";
import { DebateTemplates } from "./DebateTemplates";

export function ChatPanel() {
    const navigate = useNavigate();
    const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
    const {
        sessions,
        currentSessionId,
        selectedAgentId,
        getAgents,
        sendMessage,
        stopGeneration,
        streamingSessionIds,
        loadSession,
        getCurrentMessages,
        toggleAgentModal,
        boardSession,
    } = useChatStore();

    const messages = getCurrentMessages();
    const agents = getAgents();
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Search state
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showPinnedOnly, setShowPinnedOnly] = useState(false);

    // Pins & Ratings state
    const [pinnedMessages, setPinnedMessages] = useState<string[]>([]);
    const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});

    // Attachment (upload to custom agent's knowledge base) state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    const CORE_AGENT_IDS = ['CEO', 'CTO', 'CFO', 'CMO', 'system', 'group-chat'];
    const isCustomAgent = !!selectedAgentId && !CORE_AGENT_IDS.includes(selectedAgentId);

    const isTyping = currentSessionId ? streamingSessionIds.includes(currentSessionId) : false;
    const activeAgent = agents.find(a => a.id === selectedAgentId);
    const currentSession = sessions.find(s => s.session_id === currentSessionId);

    const isGroupChat = selectedAgentId === 'group-chat';
    const groupMembers = getGroupMembers(agents);

    // Indicador "X está escribiendo…" — resuelve el agente que habla ahora mismo
    // a partir de la última burbuja (en board, va cambiando CEO → CTO → …).
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
    const speakingAgent = isTyping && lastMessage && lastMessage.role !== 'user' && lastMessage.role !== 'system'
        ? agents.find(a => a.id === lastMessage.agentId)
        : undefined;
    const typingLabel = speakingAgent
        ? `${speakingAgent.name.split(' ')[0]} está escribiendo`
        : 'Procesando respuesta…';

    // Load pins when session changes
    useEffect(() => {
        if (currentSessionId) {
            chatService.getPins(currentSessionId).then(setPinnedMessages).catch(() => {});
        }
    }, [currentSessionId]);

    // Refresh billing balance after streaming completes
    const prevIsTypingRef = useRef(isTyping);
    useEffect(() => {
        const prev = prevIsTypingRef.current;
        prevIsTypingRef.current = isTyping;
        // When streaming transitions from true → false, sync real balance
        if (prev && !isTyping) {
            useBillingStore.getState().refresh();
        }
    }, [isTyping]);

    // Color efectivo: priorizar bubble_color de sesión > color de sesión > hexColor del agente
    const effectiveBubbleColor = currentSession?.visual_config?.bubble_color
        || currentSession?.visual_config?.color
        || activeAgent?.hexColor;

    // Priorizar Avatar de la sesión
    const sessionAvatar = currentSession?.visual_config?.avatar;

    // Filtered messages (search + pinned filter)
    const filteredMessages = messages.filter(msg => {
        if (showPinnedOnly && !pinnedMessages.includes(msg.id)) return false;
        if (searchQuery && !msg.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Attachment handlers: subir un documento a la KB del agente custom activo.
    const handleAttachClick = () => {
        if (!isCustomAgent || isTyping) return;
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permitir re-subir el mismo archivo
        if (!file || !selectedAgentId) return;
        setUploadState('uploading');
        try {
            await chatService.uploadAgentDocument(selectedAgentId, file);
            setUploadState('done');
            setTimeout(() => setUploadState('idle'), 2500);
        } catch (err) {
            console.error('Upload error:', err);
            setUploadState('error');
            setTimeout(() => setUploadState('idle'), 3000);
        }
    };

    // Handlers
    const handlePin = useCallback(async (messageId: string) => {
        if (!currentSessionId) return;
        const isPinned = pinnedMessages.includes(messageId);
        // El estado solo se actualiza si el backend confirma (A5): así un fallo no
        // deja un pin "fantasma" que desaparece al recargar.
        try {
            if (isPinned) {
                await chatService.unpinMessage(currentSessionId, messageId);
                setPinnedMessages(prev => prev.filter(id => id !== messageId));
            } else {
                await chatService.pinMessage(currentSessionId, messageId);
                setPinnedMessages(prev => [...prev, messageId]);
            }
        } catch (e) {
            console.error('No se pudo actualizar el pin:', e);
        }
    }, [currentSessionId, pinnedMessages]);

    const handleRate = useCallback(async (messageId: string, rating: 'up' | 'down') => {
        if (!currentSessionId) return;
        try {
            await chatService.rateMessage(currentSessionId, messageId, rating);
            setRatings(prev => ({ ...prev, [messageId]: rating }));
        } catch (e) {
            console.error('No se pudo guardar la valoración:', e);
        }
    }, [currentSessionId]);

    const handleExport = useCallback(() => {
        const title = currentSession?.title || 'SPHERE Chat';
        const md = exportAsMarkdown(messages, title, agents);
        const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
        downloadAsFile(md, filename);
    }, [messages, currentSession, agents]);

    const getAgentDisplayInfo = (agent: typeof activeAgent) => {
        if (!agent) return { baseName: 'SPHERE Engine', role: 'CORE' };

        // Overrides desde la sesión
        const overrideName = currentSession?.visual_config?.name;
        const overrideRole = agent.role; // Actualmente no guardamos override_role en visual_config del backend, usamos el del agente

        if (overrideName) {
            return { baseName: overrideName, role: overrideRole };
        }

        const match = agent.name.match(/^(.+?)\s*\(([A-Z]+)\)$/);
        if (match) {
            return { baseName: match[1].trim(), role: match[2] };
        }
        return { baseName: agent.name, role: agent.role };
    };

    const { baseName, role } = getAgentDisplayInfo(activeAgent);

    const getAvatarContent = () => {
        if (sessionAvatar) {
            return <img src={sessionAvatar} alt={activeAgent?.name} className="h-full w-full object-cover" />;
        }
        if (isGroupChat) {
            return <span className="text-xl">🏛️</span>;
        }
        return <span className={cn("font-black text-xl", activeAgent?.color)}>{activeAgent?.avatar || 'S'}</span>;
    };

    const handleSendMessage = async () => {
        const text = inputValue.trim();
        if (!text) return;
        // Analytics (F6): primer mensaje de la sesión y arranque de debate del board.
        if (messages.length === 0) capture(ANALYTICS_EVENTS.FIRST_MESSAGE_SENT, { group: isGroupChat });
        if (isGroupChat) capture(ANALYTICS_EVENTS.BOARD_DEBATE_STARTED);
        // Limpiamos el input optimistamente. El decremento de créditos lo hace
        // streamChat una sola vez tras confirmar que el backend aceptó el envío
        // (A4: antes se decrementaba aquí Y en streamChat → -2 por mensaje).
        setInputValue("");
        await sendMessage(text);
        // A8: si el envío falló, devolvemos el texto al input para que el usuario
        // pueda reintentar sin reescribir (sin pisar lo que ya esté tecleando).
        const sendError = useChatStore.getState().errorStates.send_message;
        if (sendError) {
            setInputValue((cur) => cur || text);
        }
    };

    // Board V2: ¿podemos intervenir en el debate en curso? (input desbloqueado)
    const canIntervene = isTyping && isGroupChat && !!boardSession?.active;
    const [interveneState, setInterveneState] = useState<'idle' | 'sending' | 'sent'>('idle');

    const handleIntervene = async () => {
        const text = inputValue.trim();
        if (!text || !currentSessionId) return;
        setInputValue("");
        setInterveneState('sending');
        try {
            await chatService.intervene(currentSessionId, text);
            setInterveneState('sent');
            setTimeout(() => setInterveneState('idle'), 2500);
        } catch (e) {
            setInterveneState('idle');
            setInputValue((cur) => cur || text);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canIntervene) handleIntervene();
            else handleSendMessage();
        }
    };

    useEffect(() => {
        if (urlSessionId && urlSessionId !== currentSessionId) {
            loadSession(urlSessionId);
        }
    }, [urlSessionId]);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [isNearBottom, setIsNearBottom] = useState(true);

    const handleScroll = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const threshold = 100;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setIsNearBottom(distanceFromBottom < threshold);
    };

    useEffect(() => {
        if (isNearBottom) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isTyping, isNearBottom]);

    // ── Welcome Screen: sin sesión activa ──
    if (!currentSessionId && !urlSessionId) {
        return (
            <div className="flex flex-col h-full bg-transparent relative overflow-hidden">
                <div className="flex-1 flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="flex flex-col items-center text-center space-y-8 max-w-md"
                    >
                        {/* Logo / Icono central */}
                        <div className="relative">
                            <div className="absolute inset-0 bg-electric-cyan/10 blur-[60px] rounded-full animate-pulse" />
                            <div className="absolute inset-0 bg-luxury-purple/10 blur-[80px] rounded-full animate-pulse [animation-delay:1s]" />
                            <motion.div
                                animate={{ rotate: [0, 5, -5, 0] }}
                                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                                className="relative h-28 w-28 rounded-[36px] bg-gradient-to-br from-electric-cyan/10 to-luxury-purple/10 border border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-sm"
                            >
                                <span className="text-5xl">⚡</span>
                            </motion.div>
                        </div>

                        {/* Texto principal */}
                        <div className="space-y-3">
                            <h1 className="text-white font-black text-2xl tracking-tight">
                                SPHERE <span className="text-electric-cyan">Intelligence</span>
                            </h1>
                            <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                                Tu equipo directivo de IA está listo. CEO, CTO, CMO, CFO — todos los expertos
                                trabajando en sincronía para darte respuestas de nivel ejecutivo.
                            </p>
                        </div>

                        {/* Onboarding first-run: checklist de 3 pasos */}
                        <OnboardingChecklist onPrimaryAction={() => toggleAgentModal(true)} />

                        {/* CTA */}
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => toggleAgentModal(true)}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-electric-cyan to-luxury-purple text-white font-bold text-sm uppercase tracking-widest shadow-[0_0_40px_rgba(0,240,200,0.15)] hover:shadow-[0_0_60px_rgba(0,240,200,0.25)] transition-all duration-500"
                        >
                            Iniciar Nuevo Chat
                        </motion.button>

                        <p className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">
                            Powered by SPHERE Neuro-Link v2.0
                        </p>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent relative overflow-hidden">
            {/* Header */}
            <header className="h-20 pl-14 lg:pl-8 pr-6 border-b border-white/5 flex items-center justify-between bg-midnight/40 backdrop-blur-xl z-20">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="relative">
                        <motion.div
                            layoutId="active-agent-avatar"
                            onClick={() => navigate('/chat/settings')}
                            className={cn(
                                "h-11 w-11 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border border-white/10 cursor-pointer hover:border-white/30 transition-colors",
                                isGroupChat ? "bg-gradient-to-tr from-luxury-purple via-electric-cyan to-blue-500" : "bg-white/5"
                            )}
                        >
                            {getAvatarContent()}
                        </motion.div>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-midnight shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        />
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-lg tracking-tight truncate">
                                {isGroupChat ? activeAgent?.name : baseName}
                            </h3>
                            <span className="px-2 py-0.5 bg-white/5 text-gray-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/5">
                                {role}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                            <ShieldCheck className="h-3 w-3 text-emerald-500/50 shrink-0" />
                            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-tighter truncate">
                                {isGroupChat
                                    ? `${groupMembers.length} Expertos Activos`
                                    : "Canal Encriptado de Extremo a Extremo"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {/* Saldo de créditos: en pantallas estrechas vive en la Sidebar (menú hamburguesa) */}
                    <div className="hidden lg:flex mr-2">
                        <CreditsIndicator />
                    </div>
                    <button onClick={() => setIsSearchOpen(v => !v)} className={cn("p-2 rounded-xl hover:bg-white/5 transition-all active-scale", isSearchOpen ? "text-electric-cyan" : "text-gray-500 hover:text-white")} title="Buscar">
                        <Search className="h-4 w-4" />
                    </button>
                    <button onClick={() => setShowPinnedOnly(v => !v)} className={cn("p-2 rounded-xl hover:bg-white/5 transition-all active-scale", showPinnedOnly ? "text-yellow-500" : "text-gray-500 hover:text-white")} title="Solo pinneados">
                        <Pin className="h-4 w-4" />
                    </button>
                    <button onClick={handleExport} className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-500 hover:text-white active-scale" title="Exportar">
                        <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => navigate('/chat/settings')} className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-500 hover:text-white active-scale">
                        <MoreVertical className="h-4 w-4" />
                    </button>
                </div>
            </header>

            {/* Board V2 war-room: directores en sesión, fases y votos en vivo */}
            <AnimatePresence>
                {isGroupChat && boardSession?.active && (
                    <BoardWarRoom board={boardSession} agents={agents} />
                )}
            </AnimatePresence>

            {/* Search Bar */}
            <AnimatePresence>
                {isSearchOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-b border-white/5 bg-midnight/60 backdrop-blur-xl px-6 overflow-hidden"
                    >
                        <div className="flex items-center gap-3 py-3 max-w-4xl mx-auto">
                            <Search className="h-4 w-4 text-content-muted flex-shrink-0" aria-hidden="true" />
                            <input
                                id="chat-search"
                                aria-label="Buscar en esta conversación"
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar en esta conversación..."
                                className="flex-1 bg-transparent text-white text-sm placeholder:text-gray-600"
                                autoFocus
                            />
                            {searchQuery && (
                                <span className="text-[10px] text-gray-500 font-mono">
                                    {filteredMessages.filter(m => m.role !== 'system').length} resultados
                                </span>
                            )}
                            <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }} className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Messages Area */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-6 scrollbar-none"
            >
                <div className="max-w-4xl mx-auto space-y-8">
                    {messages.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-col items-center justify-center py-20 text-center space-y-6"
                        >
                            <div className="relative">
                                <div className="absolute inset-0 bg-luxury-purple/20 blur-3xl rounded-full animate-pulse" />
                                <div className="relative h-20 w-20 rounded-[32px] bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl">
                                    <Zap className="h-10 w-10 text-luxury-purple" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-white font-bold text-xl uppercase tracking-widest">Listo para empezar</h2>
                                <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                                    {isGroupChat
                                        ? "Plantea una decisión y tu junta debatirá para darte una recomendación."
                                        : "Escribe tu primer mensaje para empezar la conversación."}
                                </p>
                            </div>

                            {/* Plantillas de debate (F7): solo en sesión de grupo vacía. */}
                            {isGroupChat && <DebateTemplates onPick={setInputValue} />}
                        </motion.div>
                    ) : (
                        <>
                            {filteredMessages.map((msg, idx) => {
                                const msgAgent = msg.agentId ? agents.find(a => a.id === msg.agentId) : (msg.role !== 'user' && msg.role !== 'system' ? activeAgent : undefined);
                                return (
                                    <MessageBubble
                                        key={msg.id}
                                        message={msg}
                                        agent={msgAgent}
                                        agentColor={effectiveBubbleColor}
                                        sessionAvatar={sessionAvatar}
                                        isTyping={isTyping}
                                        isLast={idx === filteredMessages.length - 1}
                                        searchQuery={searchQuery || undefined}
                                        isPinned={pinnedMessages.includes(msg.id)}
                                        rating={ratings[msg.id] || null}
                                        onPin={() => handlePin(msg.id)}
                                        onRate={(r) => handleRate(msg.id, r)}
                                        onRegenerate={!msg.role.includes('user') && idx === filteredMessages.length - 1 ? () => sendMessage(messages.filter(m => m.role === 'user').pop()?.content || '', { regenerateFromId: msg.id }) : undefined}
                                    />
                                );
                            })}

                            <AnimatePresence>
                                {isTyping && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-center gap-3 text-gray-500 text-[10px] font-mono uppercase tracking-widest ml-14"
                                    >
                                        <div className="flex gap-1">
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="h-1 w-1 rounded-full bg-electric-cyan" />
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="h-1 w-1 rounded-full bg-electric-cyan" />
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="h-1 w-1 rounded-full bg-electric-cyan" />
                                        </div>
                                        <span>{typingLabel}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
            </div>

            {/* Input Section */}
            <div className="p-6 bg-gradient-to-t from-midnight/80 to-transparent z-10">
                <div className="max-w-4xl mx-auto">
                    {/* Banner de intervención durante el debate */}
                    <AnimatePresence>
                        {canIntervene && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2 px-4 mb-2 text-[10px] font-mono uppercase tracking-widest text-electric-cyan/80"
                            >
                                <Hand className="h-3 w-3" />
                                {interveneState === 'sent'
                                    ? "Intervención registrada — entrará antes de la siguiente fase"
                                    : "Debate en curso — puedes intervenir; tu mensaje entrará antes de la siguiente fase"}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <motion.div
                        initial={false}
                        animate={(isTyping && !canIntervene) ? { opacity: 0.5, y: 10 } : { opacity: 1, y: 0 }}
                        className={cn(
                            "glass-panel rounded-[24px] border border-white/10 p-2 flex items-end gap-2 group transition-all duration-500",
                            canIntervene && "focus-within:border-electric-cyan/40 focus-within:shadow-[0_0_30px_rgba(0,245,212,0.15)]",
                            !isTyping && "focus-within:border-luxury-purple/40 focus-within:shadow-[0_0_30px_rgba(157,133,255,0.15)] shadow-2xl"
                        )}
                    >
                        <input
                            ref={fileInputRef}
                            aria-label="Adjuntar documento a la conversación"
                            type="file"
                            className="hidden"
                            accept=".pdf,.txt,.md,.docx,.csv,.json"
                            onChange={handleFileSelected}
                        />
                        <button
                            onClick={handleAttachClick}
                            disabled={isTyping || !isCustomAgent || uploadState === 'uploading'}
                            title={
                                !isCustomAgent
                                    ? "Adjuntar documentos disponible para agentes personalizados"
                                    : uploadState === 'uploading'
                                    ? "Subiendo documento..."
                                    : uploadState === 'done'
                                    ? "Documento añadido a la base de conocimiento"
                                    : uploadState === 'error'
                                    ? "Error al subir — inténtalo de nuevo"
                                    : "Adjuntar documento a la base de conocimiento del agente"
                            }
                            className={cn(
                                "p-3.5 transition-all disabled:opacity-30 active-scale",
                                uploadState === 'done'
                                    ? "text-emerald-400"
                                    : uploadState === 'error'
                                    ? "text-red-400"
                                    : "text-gray-500 hover:text-white"
                            )}
                        >
                            <Paperclip className={cn("h-5 w-5", uploadState === 'uploading' && "animate-pulse")} />
                        </button>

                        <textarea
                            id="chat-composer"
                            aria-label={canIntervene ? "Intervenir en el debate" : "Tu consulta a la junta"}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={canIntervene ? "Intervenir en el debate…" : isTyping ? "Sistema ocupado..." : "Transmite tu consulta..."}
                            className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder:text-gray-600 resize-none py-3.5 max-h-48 text-[15px] leading-relaxed font-medium"
                            rows={1}
                            disabled={isTyping && !canIntervene}
                        />

                        {/* Botón intervenir (durante el debate, junto al Stop) */}
                        {canIntervene && (
                            <button
                                onClick={handleIntervene}
                                disabled={!inputValue.trim() || interveneState === 'sending'}
                                title="Intervenir en el debate"
                                className={cn(
                                    "p-3.5 rounded-xl transition-all duration-300",
                                    inputValue.trim()
                                        ? "bg-electric-cyan/80 text-midnight shadow-[0_0_20px_rgba(0,245,212,0.4)] hover:scale-105"
                                        : "bg-white/5 text-gray-600 cursor-not-allowed"
                                )}
                            >
                                <Hand className="h-5 w-5" />
                            </button>
                        )}

                        {isTyping ? (
                            <button
                                onClick={stopGeneration}
                                className="p-3.5 rounded-xl transition-all duration-300 bg-red-500/80 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 hover:scale-105 animate-pulse"
                                title="Detener generación"
                            >
                                <Square className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim()}
                                className={cn(
                                    "p-3.5 rounded-xl transition-all duration-300",
                                    inputValue.trim()
                                        ? "bg-luxury-purple text-white shadow-[0_0_20px_rgba(157,133,255,0.4)] hover:scale-105"
                                        : "bg-white/5 text-gray-600 cursor-not-allowed"
                                )}
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        )}
                    </motion.div>

                    <div className="flex justify-between items-center px-4 mt-3">
                        <div className="flex items-center gap-4">
                            {/* Chip de coste de la acción: board grupal ≈5⚡ (o 3 si el triage reduce), directo 1⚡ */}
                            <span
                                className="flex items-center gap-1 text-[9px] font-mono text-gray-500 uppercase tracking-widest"
                                title={isGroupChat ? "Un debate de la junta cuesta hasta 5 créditos (3 si el triage reduce los participantes)" : "Un mensaje cuesta 1 crédito"}
                            >
                                <Zap className="h-3 w-3 text-electric-cyan/70" />
                                {isGroupChat ? `${boardSession?.cost ?? 5} por debate` : "1 por mensaje"}
                            </span>
                        </div>
                        <p className="text-[9px] text-gray-700 font-mono uppercase tracking-tighter">
                            Powered by SPHERE Neuro-Link v2.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
