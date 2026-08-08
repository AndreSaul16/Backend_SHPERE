import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Send, Square, Paperclip, MoreVertical, Zap, ShieldCheck, Search, X, Download, Pin, Hand, Landmark } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getBoardAgentByRole, getGroupMembers, useAgentes, useChatStore, useEstaTransmitiendo, useMensajesDeSesion } from "@/store/useChatStore";
import { chatService } from "@/services/api";
import { MessageBubble } from "./MessageBubble";
import { BoardWarRoom } from "./BoardWarRoom";
import { AgendaRail, type SegmentoDelDia } from "./AgendaRail";
import { fasesDe } from "./agendaPhases";
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
import { useDraft } from "@/hooks/useDraft";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { StreamInterrupted } from "./StreamInterrupted";
import { RegionBoundary } from "@/components/shared/RegionBoundary";
import { useVentanaDeTurnos } from "@/hooks/useVentanaDeTurnos";
import { citaLlana } from "@/utils/citaLlana";
import { comboDe, useAtajo } from "@/hooks/useShortcuts";

export function ChatPanel() {
    const navigate = useNavigate();
    const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
    /**
     * 4.6 · D20 — selectores atómicos.
     *
     * Esto era una desestructuración del store ENTERO, así que el panel se
     * repintaba en cada `set`: por token, sí, pero también por trozo de
     * artefacto, por evento de junta y por cambio de error. Y encima
     * `getAgents()` y `getCurrentMessages()` son funciones que se llamaban en el
     * cuerpo del render: leían el valor correcto pero NO suscribían a nada —
     * funcionaban de rebote, porque el store entero ya forzaba el render.
     * Cambiarlas por selectores tapa además ese agujero.
     */
    const currentSessionId = useChatStore((s) => s.currentSessionId);
    const selectedAgentId = useChatStore((s) => s.selectedAgentId);
    const sendMessage = useChatStore((s) => s.sendMessage);
    const stopGeneration = useChatStore((s) => s.stopGeneration);
    const loadSession = useChatStore((s) => s.loadSession);
    const toggleAgentModal = useChatStore((s) => s.toggleAgentModal);
    const boardSession = useChatStore((s) => s.boardSession);
    const agents = useAgentes();

    // La sesión abierta, no las cuarenta del historial: seleccionar `sessions`
    // entero repintaría el panel cada vez que llega un título nuevo del rail.
    const currentSession = useChatStore(
        (s) => s.sessions.find((x) => x.session_id === currentSessionId),
    );
    // El hilo de ESTA sesión, no el mapa entero. `useMensajesDeSesion` devuelve
    // una constante congelada cuando no hay hilo: un `?? []` dentro del selector
    // es una instantánea nueva por comprobación y Zustand 5 entra en bucle.
    const messages = useMensajesDeSesion(currentSessionId);
    // Un booleano, o sea nunca una referencia nueva: antes se seleccionaba el
    // array `streamingSessionIds` completo para responder a una sola pregunta.
    const isTyping = useEstaTransmitiendo(currentSessionId);

    /**
     * Q3 — lo que se escribe no se pierde.
     *
     * El compositor era un `useState` a secas: seis líneas de contexto para la
     * junta se evaporaban al navegar, al recargar y cuando el envío fallaba.
     * `useDraft` guarda por sesión y restaura; el resto del componente sigue
     * usando `inputValue`/`setInputValue` como antes.
     */
    const draft = useDraft(currentSessionId ?? urlSessionId ?? null);
    const inputValue = draft.value;
    const setInputValue = draft.setValue;
    const online = useOnlineStatus();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);

    /**
     * El compositor crece con el texto, hasta el techo de ocho líneas que fija
     * `.compositor` en `index.css`.
     *
     * Era `rows={1}` fijo: un borrador de seis líneas —justo el que Q3 viene a
     * salvar— se recuperaba entero pero se VEÍA una línea, y el usuario no
     * tenía forma de saber que lo demás seguía ahí. Recuperar el trabajo y
     * esconderlo no es recuperarlo.
     */
    useEffect(() => {
        // 3.8: donde el navegador sabe dimensionar el campo por su contenido, el
        // trabajo es suyo y esto no toca el DOM — medir `scrollHeight` en cada
        // pulsación fuerza un reflujo sincrónico por tecla, que en el móvil de
        // referencia (§7.7) se nota. La clase `.compositor` lo declara; aquí
        // sólo queda la red para quien no lo soporte.
        // La detección va por la propiedad en camelCase del objeto de estilo y
        // no por `CSS.supports` con el nombre en guiones: un nombre de propiedad
        // CSS escrito con guion dentro de `src` lo recoge el detector de clases
        // muertas como candidata a utilidad de Tailwind y lo marca — incluso
        // dentro de un comentario. Ya pasó en la fase 2 con otra propiedad.
        if ('fieldSizing' in document.documentElement.style) return;
        const el = composerRef.current;
        if (!el) return;
        // El techo se lee de `.compositor`, no se copia: dos números que hay que
        // acordarse de cambiar a la vez acaban discrepando, y el usuario sin
        // dimensionado nativo vería un campo de otro alto que el resto.
        const techo = Number.parseFloat(getComputedStyle(el).maxBlockSize) || Infinity;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, techo)}px`;
    }, [inputValue]);

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

    const activeAgent = agents.find(a => a.id === selectedAgentId);

    const isGroupChat = selectedAgentId === 'group-chat';
    const groupMembers = getGroupMembers(agents);

    /**
     * F2 — cuándo se monta la mesa de directores.
     *
     * La condición era `boardSession?.active`, o sea sólo mientras el debate
     * estaba EN VUELO: al terminar desaparecía y al reabrir la junta no volvía
     * nunca. La mesa es de la SESIÓN, no del stream — `loadSession` la
     * reconstruye del historial persistido.
     *
     * Lo que no se pinta es una mesa vacía: `sendMessage` deja un `boardSession`
     * recién estrenado (sin participantes ni votos) hasta que el backend
     * anuncia el debate, y ahí no hay junta que enseñar todavía.
     */
    const hayMesaQueEnsenar = !!boardSession && (
        boardSession.active
        || boardSession.participants.length > 0
        || Object.keys(boardSession.votes).length > 0
    );

    const prefiereMenosMovimiento = useReducedMotion();

    /**
     * El orden del día como dato: cuántos turnos ha llevado cada fase.
     *
     * El Canto (§8.4) pinta segmentos «proporcionales a los turnos de cada
     * fase», así que el reparto sale del hilo de verdad y no de un peso
     * inventado. Una fase anunciada que aún no ha hablado ocupa el mínimo, para
     * que el orden del día se lea entero desde el primer turno.
     */
    const segmentos = useMemo<SegmentoDelDia[]>(() => {
        if (!boardSession) return [];
        const cuenta = new Map<string, number>();
        for (const m of messages) {
            if (!m.phase) continue;
            cuenta.set(m.phase, (cuenta.get(m.phase) ?? 0) + 1);
        }
        return fasesDe(boardSession).map((f) => ({ ...f, turnos: cuenta.get(f.clave) ?? 0 }));
    }, [boardSession, messages]);

    /**
     * La última intervención de cada director, para citarla en el asiento en
     * foco del Palco (§8.1). Se recorta aquí y no en la mesa: el que tiene el
     * hilo es este componente.
     */
    const intervencionPorRol = useMemo<Record<string, string>>(() => {
        const porRol: Record<string, string> = {};
        for (const m of messages) {
            if (m.role === 'user' || m.role === 'system' || !m.content) continue;
            // `citaLlana` y no un `slice` a secas: lo que dice el director es
            // markdown, y aquí se pintaba CRUDO — en el asiento en foco se leía
            // literalmente `**Voto en contra.** Nadie ha puesto número…`. Los
            // asteriscos no son parte de lo que dijo.
            porRol[m.role] = citaLlana(m.content);
        }
        return porRol;
    }, [messages]);

    /**
     * El coste de pulsar «enviar» (§P4, Q10). Un debate de junta vale 3 o 5
     * créditos —lo decide el triage— y un mensaje directo, 1.
     */
    const costeDelEnvio = isGroupChat ? (boardSession?.cost ?? 5) : 1;
    const textoDelCoste = isGroupChat
        ? `${costeDelEnvio} por debate`
        : '1 por mensaje';
    const detalleDelCoste = isGroupChat
        ? 'Un debate de la junta cuesta hasta 5 créditos (3 si el triage reduce los participantes)'
        : 'Un mensaje cuesta 1 crédito';

    /**
     * 5.6 · Q10 — el saldo se declara ANTES, no después del 402.
     *
     * Hasta aquí el coste estaba en el botón pero el saldo no: quien tenía tres
     * créditos escribía sus seis líneas de contexto, pulsaba, y sólo entonces le
     * salía el paywall encima de una junta a medias. El upsell llegaba tarde y
     * además castigaba el trabajo ya hecho. Ahora el saldo viaja con el coste,
     * y si no llega se dice antes de escribir (cierra B4).
     *
     * Selectores atómicos, uno por cifra: `useBillingStore()` entero volvería a
     * repintar el panel en cada refresco de saldo, que ocurre cada minuto y al
     * final de cada turno.
     */
    const saldoDelPlan = useBillingStore((s) => s.pro_messages_balance);
    const saldoComprado = useBillingStore((s) => s.topup_messages_balance);
    const saldoCargado = useBillingStore((s) => s.loaded);
    const abrirPaywall = useBillingStore((s) => s.openPaywall);

    const saldo = saldoDelPlan + saldoComprado;
    // Mismo criterio que el indicador de créditos (D33): «no lo sabemos» es no
    // haber cargado Y no tener cifra. Una cifra vieja informa; un cero inventado
    // durante los segundos de arranque diría que no hay saldo cuando sí lo hay,
    // y eso es justo el aviso que no se puede dar en falso.
    const saldoConocido = saldoCargado || saldo > 0;
    const saldoProyectado = Math.max(0, saldo - costeDelEnvio);
    const saldoInsuficiente = saldoConocido && saldo < costeDelEnvio;
    // El envío entra, pero es el último que entra: avisarlo aquí evita que el
    // siguiente sea el que se encuentre la puerta cerrada.
    const ultimoQueEntra = saldoConocido && !saldoInsuficiente && saldoProyectado < costeDelEnvio;

    const accionDelEnvio = isGroupChat ? 'Convocar junta' : 'Enviar mensaje';
    /** El nombre accesible del botón: la frase entera de Q10. */
    const etiquetaDelEnvio = saldoInsuficiente
        ? `Sin saldo para ${isGroupChat ? 'convocar' : 'enviar'}: ${costeDelEnvio} créditos y te quedan ${saldo}. Recargar`
        : saldoConocido
            ? `${accionDelEnvio} · ${costeDelEnvio} créditos · te quedan ${saldo}`
            : `${accionDelEnvio} · ${costeDelEnvio} créditos`;

    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Filtered messages (search + pinned filter)
    const filteredMessages = useMemo(() => messages.filter(msg => {
        if (showPinnedOnly && !pinnedMessages.includes(msg.id)) return false;
        if (searchQuery && !msg.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    }), [messages, showPinnedOnly, pinnedMessages, searchQuery]);

    /**
     * 4.9 — la ventana del transcript.
     *
     * Por encima de 80 turnos se monta sólo la cola del hilo y lo viejo se
     * revela al subir. Se desactiva entera mientras hay búsqueda o filtro de
     * anclados: un resultado que está en un turno sin montar sería un resultado
     * que no existe, y el contador de «N resultados» mentiría.
     */
    const {
        visibles: turnosVisibles,
        ocultos: turnosOcultos,
        recortando: hayTurnosOcultos,
        // Se saca aquí y no se usa como `ventana.centinela` en el JSX: la regla
        // `react-hooks/refs` marca como «acceso a ref durante el render»
        // cualquier `ref={objeto.propiedad}`. Y NO vale un arrow en el sitio
        // (`ref={(n) => ventana.centinela(n)}`): cambiaría de identidad en cada
        // render, React lo llamaría con `null` y con el nodo cada vez, y como
        // detrás hay un `setState` eso es un bucle de render.
        centinela: refDelCentinela,
        revelarMas,
        revelarTodo,
    } = useVentanaDeTurnos(filteredMessages, {
        activa: !searchQuery && !showPinnedOnly,
    });

    /** Tocar un segmento del Canto salta a esa fase (§8.4). */
    const saltarAFase = useCallback((clave: string) => {
        const buscar = () =>
            messagesContainerRef.current?.querySelector<HTMLElement>(`[data-fase="${clave}"]`);
        const destino = buscar();
        if (destino) {
            destino.scrollIntoView({
                behavior: prefiereMenosMovimiento ? 'auto' : 'smooth',
                block: 'start',
            });
            return;
        }
        // 4.9: la fase puede estar en un tramo que la ventana no tiene montado.
        // El Canto es el índice del debate; que un salto no haga nada porque el
        // turno «no está» sería peor que no tener índice. Se revela el hilo
        // entero y se salta en el fotograma siguiente, ya con el nodo en el DOM.
        revelarTodo();
        requestAnimationFrame(() => {
            buscar()?.scrollIntoView({
                behavior: prefiereMenosMovimiento ? 'auto' : 'smooth',
                block: 'start',
            });
        });
    }, [prefiereMenosMovimiento, revelarTodo]);

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

    /**
     * Reintenta un turno: trunca desde esa burbuja y reenvía la última consulta
     * del usuario. Es el mismo camino que «Regenerar», que ya existía — un
     * turno cortado y un turno que no gusta se arreglan igual.
     */
    const reintentarTurno = (messageId: string) => {
        const ultimaConsulta = messages.filter(m => m.role === 'user').pop()?.content;
        if (!ultimaConsulta) return;
        void sendMessage(ultimaConsulta, { regenerateFromId: messageId });
    };

    const handleExport = useCallback(() => {
        const title = currentSession?.title || 'SPHERE Chat';
        const md = exportAsMarkdown(messages, title, agents);
        const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
        downloadAsFile(md, filename);
    }, [messages, currentSession, agents]);

    const getAgentDisplayInfo = (agent: typeof activeAgent) => {
        if (!agent) return { baseName: 'SPHERE', role: 'Director' };

        // §11 — «SYSTEM» y «CORE» eran etiquetas de máquina en la cabecera de la
        // pantalla principal del producto. La junta no es un sistema: es una
        // junta. Va antes que los overrides de la sesión, porque el rol no lo
        // cambia renombrar la conversación.
        if (agent.role === 'system') {
            return { baseName: currentSession?.visual_config?.name || agent.name, role: 'Junta' };
        }

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
        // Q10 · B4 — el paywall se abre AQUÍ, con el borrador intacto y sin
        // haber gastado nada, en vez de llegar como un 402 a mitad de junta.
        if (saldoInsuficiente) {
            abrirPaywall('upgrade_cta');
            return;
        }
        // Analytics (F6): primer mensaje de la sesión y arranque de debate del board.
        if (messages.length === 0) capture(ANALYTICS_EVENTS.FIRST_MESSAGE_SENT, { group: isGroupChat });
        if (isGroupChat) capture(ANALYTICS_EVENTS.BOARD_DEBATE_STARTED);
        // Limpiamos el input optimistamente. El decremento de créditos lo hace
        // streamChat una sola vez tras confirmar que el backend aceptó el envío
        // (A4: antes se decrementaba aquí Y en streamChat → -2 por mensaje).
        draft.commit();
        await sendMessage(text);
        // A8: si el envío falló, devolvemos el texto al input para que el usuario
        // pueda reintentar sin reescribir (sin pisar lo que ya esté tecleando),
        // y lo volvemos a guardar: si además cierra la pestaña, sigue ahí.
        const sendError = useChatStore.getState().errorStates.send_message;
        if (sendError) {
            draft.restore(text);
        }
    };

    // Board V2: ¿podemos intervenir en el debate en curso? (input desbloqueado)
    const canIntervene = isTyping && isGroupChat && !!boardSession?.active;
    const [interveneState, setInterveneState] = useState<'idle' | 'sending' | 'sent'>('idle');

    const handleIntervene = async () => {
        const text = inputValue.trim();
        if (!text || !currentSessionId) return;
        draft.commit();
        setInterveneState('sending');
        try {
            await chatService.intervene(currentSessionId, text);
            setInterveneState('sent');
            setTimeout(() => setInterveneState('idle'), 2500);
        } catch (e) {
            setInterveneState('idle');
            // La intervención no ha entrado: el texto vuelve y se dice por qué,
            // porque el banner de arriba sigue diciendo «puedes intervenir» y
            // sin aviso el usuario cree que su turno está registrado.
            draft.restore(text);
            toast.error(
                'Tu intervención no ha entrado en el debate',
                reasonOf(e) ?? 'El texto sigue en el campo. Vuelve a enviarlo antes de que cambie la fase.',
            );
        }
    };

    /**
     * 5.3 · Q9 — los atajos de la junta.
     *
     * Los cuatro viven aquí, junto a lo que mueven, y no en un registro global
     * que tendría que alcanzarlo por referencias: un atajo que no encuentra su
     * acción es un atajo que no funciona, y esto es lo que lo hace evidente al
     * compilar.
     *
     * Los de una sola tecla (J/K) los protege `useAtajo`: dentro de un campo de
     * texto no disparan, así que escribir «junta» en el compositor no salta de
     * turno. Los otros dos llevan modificador y sí funcionan mientras se
     * escribe, que es cuando hacen falta.
     */
    useAtajo(
        comboDe('detener'),
        useCallback(() => { if (isTyping) stopGeneration(); }, [isTyping, stopGeneration]),
        { activo: isTyping },
    );

    useAtajo(
        comboDe('buscar'),
        useCallback((e: KeyboardEvent) => {
            e.preventDefault();
            setIsSearchOpen(true);
        }, []),
        { permitirEnCampos: true },
    );

    /** Mueve el foco al turno anterior o siguiente y lo trae a la vista. */
    const saltarDeTurno = useCallback((direccion: 1 | -1) => {
        const contenedor = messagesContainerRef.current;
        if (!contenedor) return;
        const turnos = Array.from(contenedor.querySelectorAll<HTMLElement>('[data-turno]'));
        if (turnos.length === 0) return;
        const activo = document.activeElement as HTMLElement | null;
        const actual = turnos.findIndex((t) => t === activo || t.contains(activo));
        // Desde fuera del hilo: J entra por el último turno (lo más reciente,
        // que es lo que se está mirando) y K por el mismo sitio hacia atrás.
        const siguiente = actual === -1
            ? (direccion === 1 ? turnos.length - 1 : turnos.length - 1)
            : Math.min(turnos.length - 1, Math.max(0, actual + direccion));
        const destino = turnos[siguiente];
        destino.focus();
        destino.scrollIntoView({
            behavior: prefiereMenosMovimiento ? 'auto' : 'smooth',
            block: 'nearest',
        });
    }, [prefiereMenosMovimiento]);

    useAtajo(comboDe('turno-siguiente'), useCallback(() => saltarDeTurno(1), [saltarDeTurno]));
    useAtajo(comboDe('turno-anterior'), useCallback(() => saltarDeTurno(-1), [saltarDeTurno]));

    /**
     * Enviar con ⏎, y también con ⌘⏎ / Ctrl+⏎ (tarea 3.8).
     *
     * El atajo con modificador es el que traen aprendido quienes vienen de un
     * compositor donde ⏎ hace salto de línea: si aquí no hace nada, el turno se
     * queda escrito y sin enviar, y no hay forma de saber por qué.
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter') return;
        const conModificador = e.metaKey || e.ctrlKey;
        /* 5.3 · Q9 — ⌘⇧⏎ convoca junta con lo escrito. Si ya estamos en una,
           es enviar; si no, abre el selector de directores SIN vaciar el campo:
           el borrador es por sesión y sigue ahí cuando se elija la junta. */
        if (conModificador && e.shiftKey) {
            e.preventDefault();
            if (isGroupChat) handleSendMessage();
            else toggleAgentModal(true);
            return;
        }
        if (e.shiftKey && !conModificador) return;
        e.preventDefault();
        if (canIntervene) handleIntervene();
        else handleSendMessage();
    };

    useEffect(() => {
        if (urlSessionId && urlSessionId !== currentSessionId) {
            loadSession(urlSessionId);
        }
    }, [urlSessionId]);

    /**
     * 5.2 · Q4 — una plantilla elegida en la paleta llega aquí.
     *
     * La paleta abre una junta nueva y trae el guion en el estado de la
     * navegación; el compositor lo recoge y lo BORRA del historial, para que
     * volver atrás y adelante no lo vuelva a pegar encima de lo que el usuario
     * haya escrito entretanto.
     */
    const location = useLocation();
    const plantillaPendiente = (location.state as { plantilla?: string } | null)?.plantilla;
    useEffect(() => {
        if (!plantillaPendiente) return;
        setInputValue(plantillaPendiente);
        navigate(location.pathname, { replace: true, state: null });
    }, [plantillaPendiente, location.pathname, navigate, setInputValue]);

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
            {/* 3.7 · §4.3 — la cabecera a 390px.
                Medido en el navegador antes de tocarla: el título disponía de
                44px para 125 («Ju…») y el subtítulo de 94 para 144 («4
                EXPERTOS…»). La causa es aritmética: `pl-14` (56px para el
                tirador del cajón) + placa de 44 + hueco + CUATRO botones de
                40px + `pr-6` se comen 280 de los 390px de la pantalla, y lo que
                queda no da para un nombre de junta.
                Lo que se hace, por orden de daño: el hueco baja a `gap-2` y el
                relleno lateral a `pr-2`; los botones se aprietan a 36px en
                móvil (siguen por encima de los 44 de área táctil gracias a la
                regla de `(pointer: coarse)` de `index.css`); y la píldora del
                rol se va por debajo de `sm`, porque en una junta dice «Junta»
                justo al lado de «Junta Directiva» — es la única pieza de la
                cabecera que no aporta información nueva. */}
            <header className="h-20 pl-14 lg:pl-8 pr-2 sm:pr-6 border-b border-stroke-hairline flex items-center justify-between bg-surface-1 z-20">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
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

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className="min-w-0 font-semibold text-content-strong text-base sm:text-lg tracking-tight truncate">
                                {isGroupChat ? activeAgent?.name : baseName}
                            </h3>
                            {/* El rol sigue anunciándose siempre: lo lleva el
                                `aria-label` de la cabecera, así que esconder la
                                píldora en móvil no quita información a nadie. */}
                            <span className="hidden sm:inline shrink-0 px-2 py-0.5 bg-stroke-hairline text-content-muted rounded-xs text-micro font-semibold uppercase border border-stroke-hairline">
                                {role}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0">
                            <ShieldCheck className="h-3 w-3 text-content-muted shrink-0" aria-hidden="true" />
                            <p className="min-w-0 text-micro text-content-muted uppercase truncate">
                                {/* «Expertos Activos» no cabía a 390px y se
                                    cortaba en «4 EXPERTOS…», que además deja al
                                    número sin sustantivo. La forma corta cabe
                                    entera y dice lo mismo; la larga vuelve en
                                    cuanto hay sitio. */}
                                {isGroupChat
                                    ? <><span className="sm:hidden">{groupMembers.length} expertos</span><span className="hidden sm:inline">{groupMembers.length} Expertos Activos</span></>
                                    : "Conversación privada"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    {/* Saldo de créditos: en pantallas estrechas vive en la Sidebar (menú hamburguesa) */}
                    <div className="hidden lg:flex mr-2">
                        <CreditsIndicator />
                    </div>
                    <button onClick={() => setIsSearchOpen(v => !v)} className={cn("p-1.5 sm:p-2 rounded-sm hover:bg-stroke-hairline transition-all active-scale", isSearchOpen ? "text-accent" : "text-content-muted hover:text-content-strong")} title="Buscar en la conversación">
                        <Search className="h-4 w-4" />
                    </button>
                    <button onClick={() => setShowPinnedOnly(v => !v)} className={cn("p-1.5 sm:p-2 rounded-sm hover:bg-stroke-hairline transition-all active-scale", showPinnedOnly ? "text-warning" : "text-content-muted hover:text-content-strong")} title="Sólo los anclados">
                        <Pin className="h-4 w-4" />
                    </button>
                    <button onClick={handleExport} className="p-1.5 sm:p-2 rounded-sm hover:bg-stroke-hairline transition-all text-content-muted hover:text-content-strong active-scale" title="Exportar">
                        <Download className="h-4 w-4" />
                    </button>
                    <button onClick={() => navigate('/chat/settings')} className="p-1.5 sm:p-2 rounded-sm hover:bg-stroke-hairline transition-all text-content-muted hover:text-content-strong active-scale">
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
                {isGroupChat && boardSession && hayMesaQueEnsenar && (
                    <BoardWarRoom board={boardSession} agents={agents} intervencionPorRol={intervencionPorRol} />
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

            {/* Messages Area — y el Canto pegado a su borde (§8.4).
                El rail es HERMANO del contenedor con scroll, no hijo: así el
                filamento no se desplaza con el transcript y la línea de tiempo
                de scroll con nombre que publica el eje llega hasta el cursor a
                través del alcance que abre este envoltorio. */}
            <div className="con-eje-del-debate flex min-h-0 flex-1">
                {hayMesaQueEnsenar && segmentos.length > 0 && (
                    <AgendaRail
                        segmentos={segmentos}
                        faseViva={boardSession?.phase ?? null}
                        scroller={messagesContainerRef}
                        onSaltar={saltarAFase}
                    />
                )}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="eje-del-debate min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:p-6 scrollbar-none"
            >
                {/* Eje 3 · el transcript es la región más grande y la que más
                    contenido ajeno pinta (markdown, tablas, diagramas de un
                    turno). Si revienta, se cae ÉL: la cabecera, el war-room y
                    sobre todo el compositor —con su borrador— siguen en pie, y
                    cambiar de junta lo recompone solo. */}
                <RegionBoundary
                    region="esta conversación"
                    reassurance="Tu borrador sigue guardado abajo. Abre otra junta o vuelve a intentarlo."
                    resetKeys={[currentSessionId]}
                >
                <div className="mx-auto max-w-4xl space-y-8">
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
                            {/* 4.9 · el acceso a lo que la ventana no ha
                                montado. El `IntersectionObserver` cubre el
                                ratón y el dedo; ESTE botón cubre el teclado y
                                el lector de pantalla, que no generan scroll.
                                Sin él, virtualizar sería esconder contenido. */}
                            {hayTurnosOcultos && (
                                <div ref={refDelCentinela} className="flex justify-center py-2">
                                    <button
                                        type="button"
                                        onClick={revelarMas}
                                        className="rounded-sm border border-stroke-edge px-3 py-1.5 text-micro uppercase text-content-muted transition-colors duration-(--duration-tap) hover:border-brass-600 hover:text-content-strong"
                                    >
                                        Mostrar los {turnosOcultos} turnos anteriores
                                    </button>
                                </div>
                            )}
                            {turnosVisibles.map((msg, idx) => {
                                /* El Diablo NO está en `agents`: §2.8 sólo da
                                   identidad seleccionable a los cinco
                                   directores, y `BOARD_DEVIL_AGENT` vive
                                   aparte. Buscándolo sólo por `agentId` salía
                                   `undefined`, y con él la burbuja de Némesis
                                   se pintaba con el latón de reserva y firmaba
                                   «DEVIL» en vez de con su nombre — mientras su
                                   placa del Palco, que sí usa
                                   `getBoardAgentByRole`, salía en coral. El
                                   mismo asiento con dos identidades distintas
                                   en la misma pantalla. */
                                const msgAgent = (msg.agentId ? agents.find(a => a.id === msg.agentId) : undefined)
                                    ?? getBoardAgentByRole(agents, msg.role)
                                    ?? (msg.role !== 'user' && msg.role !== 'system' ? activeAgent : undefined);
                                return (
                                    /* `data-turno` + `tabIndex={-1}`: es lo que
                                       hace que J/K tengan a dónde ir. Fuera del
                                       recorrido de tabulación a propósito —
                                       tabular por cien turnos no es navegar—,
                                       pero enfocable para que el salto lleve
                                       también al lector de pantalla. */
                                    <div key={msg.id} data-fase={msg.phase} data-turno tabIndex={-1} className="space-y-3 scroll-mt-4 rounded-sm">
                                    <MessageBubble
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
                                        isLast={idx === turnosVisibles.length - 1}
                                        searchQuery={searchQuery || undefined}
                                        isPinned={pinnedMessages.includes(msg.id)}
                                        rating={ratings[msg.id] || null}
                                        onPin={() => handlePin(msg.id)}
                                        onRate={(r) => handleRate(msg.id, r)}
                                        onRegenerate={!msg.role.includes('user') && idx === turnosVisibles.length - 1 ? () => reintentarTurno(msg.id) : undefined}
                                    />
                                    {/* Eje 4 · el turno cortado se dice EN EL
                                        HILO, con su acción, no en un aviso que
                                        se va. */}
                                    {msg.interrupted && (
                                        <StreamInterrupted
                                            offline={!online}
                                            onRetry={() => reintentarTurno(msg.id)}
                                        />
                                    )}
                                    </div>
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
                </RegionBoundary>
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
                    {/* Q3 · §11: si el usuario no ha perdido nada, se dice. Un
                        texto que reaparece solo desconcierta; uno que se
                        presenta —y se puede tirar— tranquiliza. */}
                    {draft.restored && (
                        <div
                            role="status"
                            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 text-micro uppercase text-content-muted"
                        >
                            <span>Borrador recuperado</span>
                            <span aria-hidden="true">·</span>
                            <button
                                type="button"
                                onClick={draft.discard}
                                className="rounded-sm text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
                            >
                                Descartar
                            </button>
                        </div>
                    )}

                    {/* 5.6 · Q10/B4 — el aviso llega ANTES de escribir.
                        No espera a que haya texto ni al clic: quien abre la
                        junta con tres créditos lo sabe antes de redactar sus
                        seis líneas de contexto. §P5: el color no es la única
                        señal, el texto dice la cifra y la salida. */}
                    {saldoInsuficiente && (
                        <div
                            role="status"
                            data-testid="aviso-saldo-corto"
                            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-oxblood-500 bg-oxblood-500/12 px-3 py-2 text-xs text-danger"
                        >
                            <span>
                                Te quedan {saldo} {saldo === 1 ? 'crédito' : 'créditos'} y{' '}
                                {isGroupChat ? 'un debate' : 'un mensaje'} cuesta {costeDelEnvio}.
                            </span>
                            <button
                                type="button"
                                onClick={() => navigate('/billing')}
                                className="rounded-sm text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
                            >
                                Recargar créditos
                            </button>
                        </div>
                    )}
                    {ultimoQueEntra && (
                        <div
                            role="status"
                            data-testid="aviso-ultimo-envio"
                            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 text-micro uppercase text-warning"
                        >
                            <span>
                                Te quedan {saldo}: después de {isGroupChat ? 'este debate' : 'este mensaje'} te
                                quedarán {saldoProyectado}.
                            </span>
                        </div>
                    )}

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
                            ref={composerRef}
                            id="chat-composer"
                            aria-label={canIntervene ? "Intervenir en el debate" : "Tu consulta a la junta"}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={canIntervene ? "Intervenir en el debate…" : isTyping ? "Sistema ocupado..." : "Transmite tu consulta..."}
                            /* El techo lo pone `.compositor` (§3.8). Estaba
                               además `max-h-48`, que era 12rem y ganaba a la
                               regla: dos techos distintos para el mismo campo. */
                            className="compositor flex-1 bg-transparent border-none focus:ring-0 text-content-strong placeholder:text-content-muted resize-none py-3.5 text-[15px] leading-relaxed font-medium"
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
                            /* Q10 · §P4 «el coste se declara antes de gastarse».
                               Estaba en un chip aparte, debajo y a la izquierda;
                               el coste se lee donde se va a pulsar. Va también
                               en el nombre accesible, porque el número solo, al
                               lado de un avión de papel, no dice qué son. */
                            <button
                                onClick={handleSendMessage}
                                /* Con el saldo corto el botón NO se deshabilita:
                                   un botón muerto no explica nada y deja al
                                   usuario sin siguiente paso. Sigue pulsable y
                                   lleva a recargar, que es lo que hace falta. */
                                disabled={!inputValue.trim()}
                                aria-label={etiquetaDelEnvio}
                                title={saldoInsuficiente
                                    ? `Te quedan ${saldo} créditos y esto cuesta ${costeDelEnvio}`
                                    : detalleDelCoste}
                                data-testid="boton-enviar"
                                className={cn(
                                    "flex items-center gap-1.5 px-3.5 py-3.5 rounded-sm transition-colors duration-(--duration-tap)",
                                    !inputValue.trim()
                                        ? "bg-surface-inset text-content-quiet cursor-not-allowed"
                                        : saldoInsuficiente
                                            ? "border border-oxblood-500 text-danger hover:bg-oxblood-500/12"
                                            : "bg-accent-fill text-accent-on-fill hover:bg-accent-hover"
                                )}
                            >
                                <Send className="h-5 w-5" aria-hidden="true" />
                                {/* El coste, siempre. El saldo se le suma a
                                    partir de `sm`: a 390px el compositor sólo
                                    tiene sitio para una cifra, y ahí el saldo lo
                                    da la línea de debajo, que sí cabe entera. */}
                                <span className="font-mono text-micro font-bold tnum" aria-hidden="true">
                                    {costeDelEnvio}
                                    {saldoConocido && (
                                        <span className="hidden sm:inline"> · {saldo}</span>
                                    )}
                                </span>
                            </button>
                        )}
                    </motion.div>

                    <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-1 px-4 mt-3">
                        <div className="flex items-center gap-4">
                            <span
                                className="flex items-center gap-1 text-micro text-content-muted uppercase tnum"
                                title={detalleDelCoste}
                            >
                                <Zap className="h-3 w-3 text-accent" aria-hidden="true" />
                                {/* Q10: coste Y saldo, en la misma línea. A
                                    390px ésta es la que lleva el saldo, porque
                                    el botón sólo tiene sitio para el coste. */}
                                {textoDelCoste}
                                {saldoConocido && (
                                    <span className="text-content-quiet">· te quedan {saldo}</span>
                                )}
                            </span>
                            <span className="text-micro uppercase text-content-quiet hidden sm:inline">
                                ⏎ envía · ⇧⏎ salta de línea
                            </span>
                        </div>
                        {/* Eje 5 · se dice donde se va a pulsar, no sólo arriba:
                            el usuario que está a punto de enviar mira aquí. */}
                        {!online && (
                            <span className="text-micro uppercase text-warning" data-testid="aviso-envio-sin-red">
                                Sin conexión — el envío fallará; tu texto se guarda
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
