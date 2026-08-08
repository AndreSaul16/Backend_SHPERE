import { useEffect, useMemo, useRef, useState } from "react";
import { Command, CreditCard, MessageSquare, MoreVertical, Plus, Search, Settings, Share2, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAgentes, useChatStore } from "@/store/useChatStore";
import { useBillingStore } from "@/store/useBillingStore";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useEsAdmin } from "@/hooks/useEsAdmin";
import { useEstadoEfimero } from "@/hooks/useEstadoEfimero";
import { useAuth } from "@/contexts/AuthContext";
import { TextField } from "@/components/ui/Field";
import { AvatarImage } from "@/components/ui/AvatarImage";
import { notify, reasonOf, toast } from "@/lib/toastBus";
import { agruparPorFecha } from "./historialPorFecha";
import { precargaAlApuntar } from "@/lib/rutasPerezosas";
import { abrirPaletaDeComandos } from "@/lib/atajosBus";
import { comboDe, teclasDe } from "@/hooks/useShortcuts";

/**
 * Extract initials from displayName (e.g., "María García" → "MG")
 * Falls back to email prefix or "?".
 */
function getInitials(displayName: string | null, email: string | null): string {
    if (displayName) {
        const parts = displayName.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return displayName[0].toUpperCase();
    }
    if (email) {
        return email[0].toUpperCase();
    }
    return "?";
}

export function Sidebar() {
    /* 4.6 · D20 — nueve campos con una sola suscripción al store entero. El
       rail pinta el historial y el saldo, nada que cambie durante un debate, y
       aun así se repintaba en cada token. Uno por campo: la lista de sesiones no
       cambia porque llegue un token, y las cuatro acciones no cambian nunca. */
    const sessions = useChatStore((s) => s.sessions);
    const currentSessionId = useChatStore((s) => s.currentSessionId);
    const streamingSessionIds = useChatStore((s) => s.streamingSessionIds);
    const toggleSidebar = useChatStore((s) => s.toggleSidebar);
    const fetchSessions = useChatStore((s) => s.fetchSessions);
    const toggleAgentModal = useChatStore((s) => s.toggleAgentModal);
    const historialCargado = useChatStore((s) => s.historialCargado);
    const allAgents = useAgentes();
    const userAvatar = useUserAvatar();
    const { user } = useAuth();
    const { pro_messages_balance, topup_messages_balance, loaded: billingLoaded, refresh: refreshBilling } = useBillingStore();
    const creditsTotal = pro_messages_balance + topup_messages_balance;

    // D10 (1.4): el buscador estaba pintado pero sin cablear — un input sin
    // `value` ni `onChange` que no filtraba nada.
    const [query, setQuery] = useState("");
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    // D49 — el «copiado» se apaga solo; antes era un setTimeout sin limpiar.
    const [copiedId, marcarCopiado] = useEstadoEfimero<string | null>(null, 1800);
    const [sharingId, setSharingId] = useState<string | null>(null);
    // Referencias del menú: el foco tiene que volver al disparador al cerrar.
    const menuRef = useRef<HTMLDivElement | null>(null);
    const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // Admin: sonda perezosa — sólo mostramos el enlace si el backend concede el
    // panel. La copia literal de este efecto que vivía aquí es la que se
    // convirtió en `useEsAdmin`; 7.5 dice absorber, no duplicar.
    const isAdmin = useEsAdmin();

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback para navegadores sin clipboard API
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch { /* noop */ }
            document.body.removeChild(ta);
        }
    };

    const handleShare = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setSharingId(sessionId);
        try {
            const { chatService } = await import("@/services/api");
            const { share_token } = await chatService.shareSession(sessionId);
            await copyToClipboard(`${window.location.origin}/share/${share_token}`);
            // Refrescar sesiones para que el menú muestre "Dejar de compartir".
            fetchSessions();
            marcarCopiado(sessionId);
        } catch (error) {
            toast.error(
                "No se pudo compartir la conversación",
                reasonOf(error) ?? "Vuelve a intentarlo en unos segundos.",
            );
        } finally {
            setSharingId((id) => (id === sessionId ? null : id));
        }
    };

    const handleUnshare = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            const { chatService } = await import("@/services/api");
            await chatService.unshareSession(sessionId);
            fetchSessions();
            setActiveMenuId(null);
        } catch (error) {
            toast.error(
                "No se pudo dejar de compartir",
                reasonOf(error) ?? "El enlace sigue activo.",
            );
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setActiveMenuId(null);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleNavClick = () => {
        if (window.innerWidth < 1024) toggleSidebar(false);
    };

    /**
     * Q5 — borrar con deshacer, en vez de confirmar con un diálogo.
     *
     * El diálogo de «¿seguro?» es la barrera que todo el mundo pulsa sin leer, y
     * detrás había un borrado irreversible de un debate de cinco créditos. Aquí
     * la junta desaparece al instante y durante ocho segundos se puede recuperar
     * entera: es una barrera que sí funciona porque actúa DESPUÉS del error.
     *
     * El aviso dura exactamente lo que la ventana (`warning` = 8 s, §9.5): si
     * está en pantalla, la junta todavía existe.
     */
    const handleDelete = (sessionId: string, title: string) => {
        setActiveMenuId(null);
        if (!useChatStore.getState().deleteSessionConDeshacer(sessionId)) return;
        notify({
            title: `Junta «${title}» eliminada`,
            detail: "Se borra en unos segundos. Puedes recuperarla con su debate y su acta.",
            variant: "warning",
            dedupeKey: `borrado:${sessionId}`,
            action: {
                label: "Deshacer",
                onClick: () => {
                    if (useChatStore.getState().undoDeleteSession(sessionId)) {
                        toast.success(`Junta «${title}» recuperada`);
                    }
                },
            },
        });
    };

    /** Cierra el menú y devuelve el foco a su disparador (§12.4). */
    const closeMenu = (sessionId: string | null) => {
        setActiveMenuId(null);
        if (sessionId) triggerRefs.current[sessionId]?.focus();
    };

    const toggleMenu = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenuId((current) => (current === sessionId ? null : sessionId));
    };

    /**
     * Teclado del menú (§12.4 + patrón `menu` de la APG): `Escape` cierra y
     * devuelve el foco, las flechas recorren los `menuitem`, Home/End a los
     * extremos. Antes el menú sólo se podía cerrar pinchando fuera.
     */
    const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, sessionId: string) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            closeMenu(sessionId);
            return;
        }
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
        );
        if (items.length === 0) return;
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const move = (to: number) => {
            e.preventDefault();
            items[(to + items.length) % items.length].focus();
        };
        if (e.key === "ArrowDown") move(index + 1);
        else if (e.key === "ArrowUp") move(index - 1);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(items.length - 1);
        else if (e.key === "Tab") closeMenu(sessionId);
    };

    // Al abrir el menú el foco entra en su primera opción: sin esto el menú es
    // decorativo para quien navega con teclado.
    useEffect(() => {
        if (!activeMenuId) return;
        menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, [activeMenuId]);

    /* D58 — aquí había un `fetchSessions()` más. `AuthenticatedApp` ya lo
       llama al entrar la sesión (`App.tsx`), así que el arranque pedía la
       lista dos veces: dos peticiones, dos escrituras al store y un salto
       visible en la lista si la segunda llegaba antes. Queda el saldo, que
       nadie más pide. */
    useEffect(() => {
        refreshBilling();
    }, [refreshBilling]);

    // D10: el filtrado es por título, sin distinguir mayúsculas ni acentos —
    // «análisis» tiene que encontrarse escribiendo «analisis».
    const normalize = (v: string) =>
        v.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const filteredSessions = useMemo(() => {
        const q = normalize(query.trim());
        if (!q) return sessions;
        return sessions.filter((s) => normalize(s.title ?? "").includes(q));
    }, [sessions, query]);

    /* 3.6 — el historial agrupado por fecha. La fecha sale de la fila y sube al
       encabezado del grupo: con veinte juntas, la lista repetía veinte veces la
       misma fecha debajo del título y no se veía qué era de hoy. */
    const grupos = useMemo(() => agruparPorFecha(filteredSessions), [filteredSessions]);


    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header / Search */}
            <div className="p-3 sm:p-4 border-b border-stroke-hairline sticky top-0 bg-surface-1 z-10">
                {/* D53 — la marca de §10 en su sitio: el anillo de sello con el
                    arco de la mesa. Se pinta como recorte de `logo.svg` y no
                    como imagen incrustada, para que tome el latón del tema: un
                    SVG externo referenciado desde una imagen no hereda
                    `currentColor` y la marca saldría negra sobre el paño. */}
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight text-content-strong sm:mb-4 sm:text-xl">
                    <span className="marca-sphere text-accent" aria-hidden="true" />
                    SPHERE
                </h2>
                <div className="relative group">
                    <Search
                        className="absolute left-3 top-[1.15rem] h-4 w-4 text-content-muted group-focus-within:text-accent transition-colors"
                        aria-hidden="true"
                    />
                    {/* El glifo ya dice qué es, así que la etiqueta va oculta a la
                        vista pero presente para el lector (§9.2). */}
                    <TextField
                        label="Buscar juntas"
                        hideLabel
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar..."
                        controlClassName="pl-9"
                    />
                </div>

                {/* 5.2 · Q4 — la puerta de la paleta para quien no tiene teclado.
                    Un ⌘K que sólo existe como combinación deja la función
                    inalcanzable en móvil, que es la mayoría del tráfico (§4.3).
                    El cajón es la superficie que sí se alcanza a 390px, así que
                    la puerta vive aquí; la combinación se enseña al lado, que es
                    además cómo se descubre que existe. */}
                <button
                    type="button"
                    onClick={() => { abrirPaletaDeComandos(); toggleSidebar(false); }}
                    className="mt-2 flex w-full items-center gap-2 rounded-sm border border-stroke-hairline px-3 py-2 text-xs text-content-muted transition-colors duration-(--duration-tap) hover:border-brass-600 hover:text-content-strong"
                >
                    <Command className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">Buscar y ejecutar</span>
                    <span className="hidden font-mono text-micro text-content-quiet sm:inline">
                        {teclasDe(comboDe('paleta')).join(' ')}
                    </span>
                </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto py-2 space-y-4 scrollbar-thin scrollbar-thumb-surface-highlight scrollbar-track-transparent">

                {/* Action: New Chat Button */}
                <div className="px-3 sm:px-4 pt-2">
                    <button
                        onClick={() => toggleAgentModal(true)}
                        className="w-full py-4 rounded-md bg-electric-cyan/10 border border-electric-cyan/30 hover:bg-electric-cyan/20 transition-all duration-300 group flex flex-col items-center justify-center gap-2 shadow-lg shadow-electric-cyan/5"
                    >
                        <div className="h-10 w-10 rounded-full bg-electric-cyan flex items-center justify-center shadow-lg shadow-electric-cyan/20 group-hover:scale-110 transition-transform">
                            <Plus className="h-6 w-6 text-accent-on-fill" aria-hidden="true" />
                        </div>
                        <span className="text-sm font-bold text-electric-cyan uppercase tracking-widest">Nuevo Chat</span>
                    </button>
                </div>

                {/* Section: Historial (Sessions) — 3.6.
                    Si ya hay juntas en el store no se enseña esqueleto aunque la
                    petición siga en vuelo: habrían llegado de la caché o de una
                    carga anterior, y tapar contenido que ya existe con un
                    barrido es peor que no tener esqueleto.
                    Tres estados, y ninguno es «la sección no está»: mientras el
                    backend contesta hay esqueleto; sin juntas, un vacío con su
                    acción; con juntas, la lista agrupada por fecha. Antes una
                    cuenta nueva no veía NADA aquí, ni siquiera un hueco, y el
                    producto parecía a medio cargar. */}
                {!historialCargado && sessions.length === 0 ? (
                    <div className="px-4 space-y-2" aria-hidden="true">
                        <div className="h-3 w-20 rounded-xs skeleton" />
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-2">
                                <div className="h-8 w-8 shrink-0 rounded-full skeleton" />
                                <div className="h-3 flex-1 rounded-xs skeleton" />
                            </div>
                        ))}
                        <p className="sr-only" aria-live="polite">Cargando tu historial de juntas…</p>
                    </div>
                ) : sessions.length === 0 ? (
                    /* §9.14: glifo de línea, una frase que explica y una acción
                       primaria. Sin bucle: un vacío que parpadea pide perdón. */
                    <div className="px-4 py-6 text-center flex flex-col items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent">
                            <MessageSquare className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-content-strong">Aún no has convocado ninguna junta</p>
                            <p className="text-xs leading-relaxed text-content-muted">
                                Plantea una decisión y tus directores debatirán hasta dejarte un acta.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleAgentModal(true)}
                            className="rounded-sm border border-brass-600 px-3 py-1.5 text-xs font-semibold text-accent transition-colors duration-(--duration-tap) hover:bg-accent/12"
                        >
                            Convocar la primera
                        </button>
                    </div>
                ) : (
                    <div>
                        <h3 className="px-4 text-micro font-bold text-content-muted uppercase mb-2">
                            Historial
                        </h3>
                        {filteredSessions.length === 0 ? (
                            /* §9.14: una búsqueda sin resultados dice qué falta y
                               qué hacer. Antes la lista se quedaba en blanco. */
                            <p className="px-4 text-xs text-content-muted">
                                Ninguna junta se llama así. Prueba con otra palabra del título.
                            </p>
                        ) : (
                        <div className="space-y-4">
                            {grupos.map((grupo) => (
                            <section key={grupo.clave} aria-label={grupo.etiqueta} className="space-y-0.5 sm:space-y-1">
                            <h4 className="px-4 pb-1 text-micro uppercase text-content-quiet">{grupo.etiqueta}</h4>
                            {grupo.sesiones.map((session) => (
                                <div key={session.session_id} className="relative group/item" data-row>
                                    <Link
                                        to={`/chat/${session.session_id}`}
                                        {...precargaAlApuntar('chat')}
                                        onClick={handleNavClick}
                                        aria-current={currentSessionId === session.session_id ? "page" : undefined}
                                        className={cn(
                                            "w-full px-3 sm:px-4 py-2.5 pe-12 flex items-center gap-3 hover:bg-surface-highlight/40 transition-all duration-200 group border-l-2",
                                            currentSessionId === session.session_id
                                                ? "bg-surface-highlight/60 border-accent shadow-[inset_4px_0_12px_rgba(0,240,200,0.05)]"
                                                : "border-transparent"
                                        )}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-surface border border-surface-highlight flex items-center justify-center flex-shrink-0 text-content-muted group-hover:text-accent transition-colors overflow-hidden">
                                            {(() => {
                                                const baseAgent = allAgents.find(a => a.id === session.base_agent_id);
                                                const placa = baseAgent?.avatar
                                                    ? <span className="text-sm">{baseAgent.avatar}</span>
                                                    : <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />;
                                                return (
                                                    <AvatarImage
                                                        src={session.visual_config?.avatar}
                                                        className="h-full w-full object-cover"
                                                        fallback={placa}
                                                    />
                                                );
                                            })()}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className={cn(
                                                "flex items-center gap-2 min-w-0 text-sm font-medium",
                                                currentSessionId === session.session_id ? "text-content-strong" : "text-content-muted group-hover:text-content-strong"
                                            )}>
                                                {/* `truncate` sobre un contenedor
                                                    flex no recorta nada: el
                                                    título salía cortado a hueso
                                                    contra el botón de acciones,
                                                    sin puntos suspensivos. */}
                                                <span className="truncate">{session.title}</span>
                                                {streamingSessionIds.includes(session.session_id) && (
                                                    <span className="flex gap-0.5" role="img" aria-label="Debatiendo">
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce"></span>
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </Link>

                                    {/* D13 (1.5): el disparador del menú vive FUERA del
                                        <Link>. Antes era un <button> dentro de un <a>,
                                        que es HTML inválido (§12.8): el navegador puede
                                        reordenar el árbol y el lector de pantalla anuncia
                                        un enlace dentro del cual hay un botón que en
                                        realidad no está ahí. */}
                                    <button
                                        type="button"
                                        ref={(el) => { triggerRefs.current[session.session_id] = el; }}
                                        onClick={(e) => toggleMenu(e, session.session_id)}
                                        aria-haspopup="menu"
                                        aria-expanded={activeMenuId === session.session_id}
                                        aria-label={`Acciones de ${session.title}`}
                                        data-row-actions
                                        className={cn(
                                            "absolute end-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-sm text-content-muted hover:bg-surface-highlight hover:text-content-strong transition-colors",
                                            activeMenuId === session.session_id && "bg-surface-highlight text-content-strong"
                                        )}
                                    >
                                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                    </button>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {activeMenuId === session.session_id && (
                                            <motion.div
                                                ref={menuRef}
                                                role="menu"
                                                aria-label={`Acciones de ${session.title}`}
                                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                className="absolute right-2 top-12 z-50 w-44 bg-surface-3 border border-stroke-edge rounded-sm shadow-e3 p-1"
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => onMenuKeyDown(e, session.session_id)}
                                            >
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={(e) => handleShare(e, session.session_id)}
                                                    disabled={sharingId === session.session_id}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-content-muted hover:text-content-strong hover:bg-stroke-hairline rounded-sm transition-colors disabled:text-content-quiet"
                                                >
                                                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {copiedId === session.session_id
                                                        ? "Enlace copiado"
                                                        : sharingId === session.session_id
                                                            ? "Generando enlace"
                                                            : session.share_token
                                                                ? "Copiar enlace"
                                                                : "Compartir"}
                                                </button>
                                                {session.share_token && (
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        onClick={(e) => handleUnshare(e, session.session_id)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-warning hover:bg-warning/10 rounded-sm transition-colors"
                                                    >
                                                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                        Dejar de compartir
                                                    </button>
                                                )}
                                                <div className="h-px bg-stroke-hairline my-1 mx-1" />
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleDelete(session.session_id, session.title);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-dissent hover:bg-dissent/10 rounded-sm transition-colors"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                    Eliminar
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                            </section>
                            ))}
                        </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer / User Profile */}
            <div className="p-3 sm:p-4 border-t border-surface-highlight bg-midnight/30 space-y-2">
                {user ? (
                    <Link
                        to="/profile"
                        {...precargaAlApuntar('perfil')}
                        onClick={() => toggleSidebar(false)}
                        className="flex items-center gap-2.5 sm:gap-3 p-2 rounded-xl border border-transparent hover:border-surface-highlight hover:bg-surface/40 transition-all duration-300 group shadow-lg hover:shadow-electric-cyan/5"
                    >
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-sm border border-agent-user/40 bg-agent-user/12 flex items-center justify-center text-agent-user font-semibold text-sm overflow-hidden">
                            {/* La cadena de respaldo se conserva anidando: si la
                                imagen guardada no carga se prueba la de la
                                cuenta, y si esa tampoco, las iniciales. */}
                            <AvatarImage
                                src={userAvatar}
                                alt="Avatar"
                                className="h-full w-full object-cover"
                                fallback={
                                    <AvatarImage
                                        src={user.photoURL}
                                        alt="Avatar"
                                        className="h-full w-full object-cover"
                                        fallback={getInitials(user.displayName, user.email)}
                                    />
                                }
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-content-strong group-hover:text-electric-cyan transition-colors truncate">
                                {user.displayName || user.email || "Usuario"}
                            </p>
                            <p className="text-xs text-content-muted truncate">
                                {user.email || ""}
                            </p>
                        </div>
                    </Link>
                ) : (
                    <div className="flex items-center gap-2.5 sm:gap-3 p-2 rounded-xl border border-transparent opacity-50">
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-surface-3 border border-stroke-edge flex items-center justify-center text-content-muted font-bold text-sm">
                            ?
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-content-muted truncate">No autenticado</p>
                        </div>
                    </div>
                )}
                <Link
                    to="/billing"
                    {...precargaAlApuntar('facturacion')}
                    onClick={() => toggleSidebar(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                >
                    <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">Facturación</span>
                    {billingLoaded && (
                        <span className="flex items-center gap-1 font-mono text-xs shrink-0">
                            <span className={cn(
                                creditsTotal === 0 ? "text-dissent" : creditsTotal < 10 ? "text-warning" : "text-accent"
                            )}>
                                {pro_messages_balance}
                            </span>
                            {topup_messages_balance > 0 && (
                                <span className="text-success">+{topup_messages_balance}</span>
                            )}
                        </span>
                    )}
                </Link>
                <Link
                    to="/settings"
                    {...precargaAlApuntar('ajustes')}
                    onClick={() => toggleSidebar(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    <span>Configuración</span>
                </Link>
                {isAdmin && (
                    <Link
                        to="/admin"
                        {...precargaAlApuntar('admin')}
                        onClick={() => toggleSidebar(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                    >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        <span>Admin</span>
                    </Link>
                )}
            </div>
        </div>
    );
}

