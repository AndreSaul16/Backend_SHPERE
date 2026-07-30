import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, MoreVertical, Trash2, Share2, Settings, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/useChatStore";
import { useBillingStore } from "@/store/useBillingStore";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { TextField } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { reasonOf, toast } from "@/lib/toastBus";

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
    const {
        sessions,
        currentSessionId,
        streamingSessionIds,
        toggleSidebar,
        fetchSessions,
        toggleAgentModal,
        coreAgents,
        customAgents
    } = useChatStore();
    const allAgents = [...coreAgents, ...customAgents];
    const userAvatar = useUserAvatar();
    const { user } = useAuth();
    const { pro_messages_balance, topup_messages_balance, loaded: billingLoaded, refresh: refreshBilling } = useBillingStore();
    const creditsTotal = pro_messages_balance + topup_messages_balance;

    // D10 (1.4): el buscador estaba pintado pero sin cablear — un input sin
    // `value` ni `onChange` que no filtraba nada.
    const [query, setQuery] = useState("");
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    // D18 (1.9): el borrado se confirma en un <ConfirmDialog> que nombra la
    // sesión, no con un «¿Confirmar borrado?» + Sí/No dentro del menú.
    const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [sharingId, setSharingId] = useState<string | null>(null);
    // Referencias del menú: el foco tiene que volver al disparador al cerrar.
    const menuRef = useRef<HTMLDivElement | null>(null);
    const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    // Admin: fetch perezoso — solo mostramos el link si /admin/users NO devuelve 403.
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let active = true;
        import("@/services/api")
            .then(({ adminService }) => adminService.users())
            .then(() => { if (active) setIsAdmin(true); })
            .catch(() => { /* 403 o error: no es admin, no mostramos el link */ });
        return () => { active = false; };
    }, []);

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
            setCopiedId(sessionId);
            setTimeout(() => setCopiedId((id) => (id === sessionId ? null : id)), 1800);
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

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            await useChatStore.getState().deleteSession(confirmDelete.id);
            toast.success(`Junta «${confirmDelete.title}» eliminada`);
            setConfirmDelete(null);
        } catch (error) {
            toast.error(
                "No se pudo eliminar la junta",
                reasonOf(error) ?? "Sigue en tu historial.",
            );
        } finally {
            setDeleting(false);
        }
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

    // Cargar sesiones y saldo de créditos al montar
    useEffect(() => {
        fetchSessions();
        refreshBilling();
    }, []);

    // D10: el filtrado es por título, sin distinguir mayúsculas ni acentos —
    // «análisis» tiene que encontrarse escribiendo «analisis».
    const normalize = (v: string) =>
        v.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const filteredSessions = useMemo(() => {
        const q = normalize(query.trim());
        if (!q) return sessions;
        return sessions.filter((s) => normalize(s.title ?? "").includes(q));
    }, [sessions, query]);


    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header / Search */}
            <div className="p-3 sm:p-4 border-b border-surface-highlight backdrop-blur-md sticky top-0 bg-midnight/80 z-10">
                <h2 className="text-lg sm:text-xl font-bold text-content-strong mb-3 sm:mb-4 tracking-tight">SPHERE</h2>
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
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto py-2 space-y-4 scrollbar-thin scrollbar-thumb-surface-highlight scrollbar-track-transparent">

                {/* Action: New Chat Button */}
                <div className="px-3 sm:px-4 pt-2">
                    <button
                        onClick={() => toggleAgentModal(true)}
                        className="w-full py-4 rounded-2xl bg-electric-cyan/10 border border-electric-cyan/30 hover:bg-electric-cyan/20 transition-all duration-300 group flex flex-col items-center justify-center gap-2 shadow-lg shadow-electric-cyan/5"
                    >
                        <div className="h-10 w-10 rounded-full bg-electric-cyan flex items-center justify-center shadow-lg shadow-electric-cyan/20 group-hover:scale-110 transition-transform">
                            <Plus className="h-6 w-6 text-accent-on-fill" aria-hidden="true" />
                        </div>
                        <span className="text-sm font-bold text-electric-cyan uppercase tracking-widest">Nuevo Chat</span>
                    </button>
                </div>

                {/* Section: Historial (Sessions) */}
                {sessions.length > 0 && (
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
                        <div className="space-y-0.5 sm:space-y-1">
                            {filteredSessions.map((session) => (
                                <div key={session.session_id} className="relative group/item" data-row>
                                    <Link
                                        to={`/chat/${session.session_id}`}
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
                                                const avatarUrl = session.visual_config?.avatar;
                                                if (avatarUrl) return <img src={avatarUrl} alt="" className="h-full w-full object-cover" />;
                                                const baseAgent = allAgents.find(a => a.id === session.base_agent_id);
                                                if (baseAgent?.avatar) return <span className="text-sm">{baseAgent.avatar}</span>;
                                                return <span className="text-micro" role="img" aria-label="Conversación">💬</span>;
                                            })()}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className={cn(
                                                "text-sm font-medium truncate flex items-center gap-2",
                                                currentSessionId === session.session_id ? "text-content-strong" : "text-content-muted group-hover:text-content-strong"
                                            )}>
                                                {session.title}
                                                {streamingSessionIds.includes(session.session_id) && (
                                                    <span className="flex gap-0.5" role="img" aria-label="Debatiendo">
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-accent animate-bounce"></span>
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-micro text-content-muted truncate">
                                                {new Date(session.created_at).toLocaleDateString()}
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
                                                        setConfirmDelete({ id: session.session_id, title: session.title });
                                                        setActiveMenuId(null);
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
                        onClick={() => toggleSidebar(false)}
                        className="flex items-center gap-2.5 sm:gap-3 p-2 rounded-xl border border-transparent hover:border-surface-highlight hover:bg-surface/40 transition-all duration-300 group shadow-lg hover:shadow-electric-cyan/5"
                    >
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-105 transition-transform overflow-hidden">
                            {userAvatar ? (
                                <img src={userAvatar} alt="Avatar" className="h-full w-full object-cover" />
                            ) : user.photoURL ? (
                                <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                                getInitials(user.displayName, user.email)
                            )}
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
                    onClick={() => toggleSidebar(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    <span>Configuración</span>
                </Link>
                {isAdmin && (
                    <Link
                        to="/admin"
                        onClick={() => toggleSidebar(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                    >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        <span>Admin</span>
                    </Link>
                )}
            </div>

            {/* §11: la confirmación nombra el objeto y su consecuencia. */}
            <ConfirmDialog
                open={confirmDelete !== null}
                onClose={() => setConfirmDelete(null)}
                onConfirm={handleDelete}
                question="¿Eliminar"
                objectName={confirmDelete?.title ?? ""}
                consequence="Se borran el debate y su acta. No se puede deshacer."
                loading={deleting}
            />
        </div>
    );
}

