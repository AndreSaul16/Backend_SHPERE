import { useRef, useState, useEffect, useCallback } from "react";
import { Send, Square, Paperclip, MoreVertical, Zap, ShieldCheck, Search, X, Download, Pin, Hand, Landmark } from "lucide-react";
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
import { useLiveAnnouncement } from "@/hooks/useLiveAnnouncement";
import { reasonOf, toast } from "@/lib/toastBus";
import { AvatarImage } from "@/components/ui/AvatarImage";
import { Button } from "@/components/ui/Button";

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

    // §12.6: el turno llega en streaming, o sea cambia SIN interacción, y hoy no
    // se anuncia. Se anuncia un RESUMEN a cadencia de 1s —quién habla y cuánto
    // lleva dicho—, nunca el token: un `aria-live` que cambia con cada token
    // reinicia la locución del lector decenas de veces por segundo y el
    // resultado es que no se oye nada.
    const lastMessageAgent = lastMessage?.agentId
        ? agents.find(a => a.id === lastMessage.agentId)
        : undefined;
    const streamingSummary = isTyping
        ? `${typingLabel}. ${lastMessage?.content?.trim().length ?? 0} caracteres hasta ahora.`
        : lastMessage && lastMessage.role !== 'user' && lastMessage.role !== 'system'
            ? `Turno terminado. ${lastMessageAgent?.name ?? 'El agente'} ha respondido.`
            : '';
    const streamingAnnouncement = useLiveAnnouncement(streamingSummary, isTyping);

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
        } catch {
            // Sin aviso: la subida ya tiene canal visible propio y en su sitio
            // —el clip cambia de estado, el `title` dice qué pasó y la región
            // viva anuncia «No se pudo subir el documento»—. Un toast encima
            // sería el mismo fallo dos veces.
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
            // El estado no se toca hasta que el backend confirma (A5), así que
            // el pin se queda como estaba y hay que decirlo: si no, el clic
            // parece no haber hecho nada.
            toast.error(
                isPinned ? 'No se pudo desanclar el mensaje' : 'No se pudo anclar el mensaje',
                reasonOf(e) ?? 'El mensaje sigue como estaba. Vuelve a intentarlo.',
            );
        }
    }, [currentSessionId, pinnedMessages]);

    const handleRate = useCallback(async (messageId: string, rating: 'up' | 'down') => {
        if (!currentSessionId) return;
        try {
            await chatService.rateMessage(currentSessionId, messageId, rating);
            setRatings(prev => ({ ...prev, [messageId]: rating }));
        } catch (e) {
            toast.error(
                'No se pudo guardar tu valoración',
                reasonOf(e) ?? 'No se ha registrado. Vuelve a votar en unos segundos.',
            );
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
        const placa = isGroupChat
            ? <Landmark className="h-5 w-5 text-accent" aria-hidden="true" />
            : <span className={cn("font-black text-xl", activeAgent?.color)}>{activeAgent?.avatar || 'S'}</span>;
        return (
            <AvatarImage
                src={sessionAvatar}
                alt={activeAgent?.name}
                className="h-full w-full object-cover"
                fallback={placa}
            />
        );
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
                        // `w-full` además de `max-w-md`: sin él la columna toma su
                        // ancho del contenido y a 390px se salía del padding, que
                        // `overflow-hidden` recortaba en silencio (§4.3).
                        className="flex w-full flex-col items-center text-center space-y-8 max-w-md"
                    >
                        {/* §10: glifo de línea, no emoji; §2.3: el latón es el filete,
                            no el campo — el único elemento macizo será el primario. */}
                        <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent">
                            <Landmark className="h-7 w-7" aria-hidden="true" />
                        </div>

                        {/* Texto principal */}
                        <div className="space-y-3">
                            <h1 className="text-2xl font-semibold tracking-tight text-content-strong">
                                Tu junta directiva, reunida
                            </h1>
                            <p className="max-w-sm text-sm leading-relaxed text-content-muted">
                                CEO, CTO, CMO y CFO deliberan tu decisión y la dejan por escrito.
                                Convoca una sesión y verás quién vota qué, y con cuánta confianza.
                            </p>
                        </div>

                        {/* Onboarding first-run: checklist de 3 pasos */}
                        <OnboardingChecklist onPrimaryAction={() => toggleAgentModal(true)} />

                        {/* §9.1: el primario es relleno macizo de latón con texto
                            `baize-950` (8.96:1). No lleva degradado ni sombra
                            precisamente porque es lo único macizo de la pantalla. */}
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={() => toggleAgentModal(true)}
                        >
                            Iniciar nuevo chat
                        </Button>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent relative overflow-hidden">
            {/* Header */}
            <header className="h-20 pl-14 lg:pl-8 pr-6 border-b border-stroke-hairline flex items-center justify-between bg-surface-1 z-20">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="relative">
                        {/* §9.10 la placa: radio corto, filete, sin degradado ni sombra. */}
                        <motion.div
                            layoutId="active-agent-avatar"
                            onClick={() => navigate('/chat/settings')}
                            className="h-11 w-11 rounded-sm flex items-center justify-center overflow-hidden border border-stroke-edge bg-surface-2 cursor-pointer hover:border-brass-600 transition-colors"
                        >
                            {getAvatarContent()}
                        </motion.div>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-success border-2 border-surface-1"
                        />
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-content-strong text-lg tracking-tight truncate">
                                {isGroupChat ? activeAgent?.name : baseName}
                            </h3>
                            <span className="px-2 py-0.5 bg-stroke-hairline text-content-muted rounded-xs text-micro font-semibold uppercase border border-stroke-hairline">
                                {role}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 min-w-0">
                            <ShieldCheck className="h-3 w-3 text-content-muted shrink-0" aria-hidden="true" />
                            <p className="text-micro text-content-muted uppercase truncate">
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
                    <button onClick={() => setIsSearchOpen(v => !v)} className={cn("p-2 rounded-sm hover:bg-stroke-hairline transition-all active-scale", isSearchOpen ? "text-accent" : "text-content-muted hover:text-content-strong")} title="Buscar">
                        <Search className="h-4 w-4" />
                    </button>
                    <button onClick={() => setShowPinnedOnly(v => !v)} className={cn("p-2 rounded-sm hover:bg-stroke-hairline transition-all active-scale", showPinnedOnly ? "text-warning" : "text-content-muted hover:text-content-strong")} title="Solo pinneados">
                        <Pin className="h-4 w-4" />
                    </button>
                    <button onClick={handleExport} className="p-2 rounded-sm hover:bg-stroke-hairline transition-all text-content-muted hover:text-content-strong active-scale" title="Exportar">
                        <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => navigate('/chat/settings')} className="p-2 rounded-sm hover:bg-stroke-hairline transition-all text-content-muted hover:text-content-strong active-scale">
                        <MoreVertical className="h-4 w-4" />
                    </button>
                </div>
            </header>

            {/* Board V2 war-room: directores en sesión, fases y votos.
                F2: la condición era `boardSession?.active`, o sea que la mesa
                sólo existía mientras el debate estaba EN VUELO y desaparecía en
                cuanto terminaba —y al reabrir la junta ya no volvía nunca—. La
                mesa es de la sesión, no del stream: se monta siempre que haya
                junta con debate (`loadSession` la reconstruye del historial). */}
            <AnimatePresence>
                {isGroupChat && boardSession && (
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
                        className="border-b border-stroke-hairline bg-surface-1 px-6 overflow-hidden"
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
                                className="flex-1 bg-transparent text-content-strong text-sm placeholder:text-content-quiet"
                                autoFocus
                            />
                            {searchQuery && (
                                <span className="text-xs text-content-muted font-mono">
                                    {filteredMessages.filter(m => m.role !== 'system').length} resultados
                                </span>
                            )}
                            <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }} className="p-1 hover:bg-stroke-hairline rounded-xs text-content-muted hover:text-content-strong">
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
                            {/* §9.14: glifo de línea de 32px, sin bucle ni resplandor. */}
                            <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent">
                                <Landmark className="h-7 w-7" aria-hidden="true" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-content-strong font-semibold text-xl tracking-tight">Listo para empezar</h2>
                                <p className="text-content-muted text-sm max-w-xs leading-relaxed">
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
                                        /* F5 · §2.8 — en una junta manda la
                                           identidad del director, no el color
                                           de la sesión. Pasando siempre
                                           `effectiveBubbleColor` los cinco
                                           directores salían del mismo latón en
                                           el transcript (el color de sesión
                                           gana en `MessageBubble`), así que el
                                           debate se leía sin saber de un
                                           vistazo quién dice qué. En un chat
                                           1-a-1 el color de sesión sí manda:
                                           ahí lo ha elegido el usuario. */
                                        agentColor={isGroupChat ? msgAgent?.hexColor : effectiveBubbleColor}
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
                                        className="flex items-center gap-3 text-content-muted text-micro uppercase ml-14"
                                    >
                                        <div className="flex gap-1">
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="h-1 w-1 rounded-full bg-accent" />
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="h-1 w-1 rounded-full bg-accent" />
                                            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="h-1 w-1 rounded-full bg-accent" />
                                        </div>
                                        <span aria-hidden="true">{typingLabel}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
            </div>

            {/* Regiones vivas (§12.6). Siempre en el DOM: un `aria-live` que se
                monta a la vez que su contenido no lo anuncian varios lectores,
                porque no había región que observar cuando llegó el cambio.

                Van juntas y fuera del scroller para que el orden de lectura no
                dependa de dónde esté el turno, y `sr-only` porque el equivalente
                visual ya existe (el indicador «X está escribiendo», el estado
                del clip). No duplican pantalla: traducen. */}
            <div className="sr-only">
                <p aria-live="polite" aria-atomic="true" data-testid="live-streaming">
                    {streamingAnnouncement}
                </p>
                <p aria-live="polite" aria-atomic="true" data-testid="live-upload">
                    {uploadState === 'uploading'
                        ? 'Subiendo el documento a la base de conocimiento…'
                        : uploadState === 'done'
                            ? 'Documento añadido a la base de conocimiento.'
                            : uploadState === 'error'
                                ? 'No se pudo subir el documento.'
                                : ''}
                </p>
            </div>

            {/* Input Section */}
            <div className="p-6 z-10">
                <div className="max-w-4xl mx-auto">
                    {/* Banner de intervención durante el debate */}
                    <AnimatePresence>
                        {canIntervene && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="flex items-center gap-2 px-4 mb-2 text-micro uppercase text-accent"
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
                            // §9.2: filete de control y filete de latón al foco. Los
                            // dos resplandores de 30px que había aquí son el glow que
                            // §0 rechaza por nombre.
                            "rounded-md border border-stroke-control bg-surface-1 p-2 flex items-end gap-2 group transition-colors duration-(--duration-tap)",
                            "focus-within:border-brass-400"
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
                                "p-3.5 transition-all disabled:text-content-quiet disabled:cursor-not-allowed active-scale",
                                uploadState === 'done'
                                    ? "text-success"
                                    : uploadState === 'error'
                                    ? "text-danger"
                                    : "text-content-muted hover:text-content-strong"
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
                            className="flex-1 bg-transparent border-none focus:ring-0 text-content-strong placeholder:text-content-muted resize-none py-3.5 max-h-48 text-[15px] leading-relaxed font-medium"
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
                                    "p-3.5 rounded-sm transition-colors duration-(--duration-tap)",
                                    inputValue.trim()
                                        ? "bg-accent-fill text-accent-on-fill hover:bg-accent-hover"
                                        : "bg-surface-inset text-content-quiet cursor-not-allowed"
                                )}
                            >
                                <Hand className="h-5 w-5" />
                            </button>
                        )}

                        {isTyping ? (
                            <button
                                onClick={stopGeneration}
                                className="p-3.5 rounded-sm transition-colors duration-(--duration-tap) border border-oxblood-500 text-danger hover:bg-oxblood-500/12"
                                title="Detener generación"
                            >
                                <Square className="h-5 w-5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim()}
                                className={cn(
                                    "p-3.5 rounded-sm transition-colors duration-(--duration-tap)",
                                    inputValue.trim()
                                        ? "bg-accent-fill text-accent-on-fill hover:bg-accent-hover"
                                        : "bg-surface-inset text-content-quiet cursor-not-allowed"
                                )}
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        )}
                    </motion.div>

                    <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-1 px-4 mt-3">
                        <div className="flex items-center gap-4">
                            {/* Chip de coste de la acción: board grupal ≈5⚡ (o 3 si el triage reduce), directo 1⚡ */}
                            <span
                                className="flex items-center gap-1 text-micro text-content-muted uppercase tnum"
                                title={isGroupChat ? "Un debate de la junta cuesta hasta 5 créditos (3 si el triage reduce los participantes)" : "Un mensaje cuesta 1 crédito"}
                            >
                                <Zap className="h-3 w-3 text-accent" aria-hidden="true" />
                                {isGroupChat ? `${boardSession?.cost ?? 5} por debate` : "1 por mensaje"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
