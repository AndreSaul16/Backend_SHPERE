import { useEffect, useState } from "react";
import { Search, Plus, MoreVertical, Trash2, Share2, Settings, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/useChatStore";
import { useBillingStore } from "@/store/useBillingStore";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { useAuth } from "@/contexts/AuthContext";

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

    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [sharingId, setSharingId] = useState<string | null>(null);
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
            console.error("Failed to share session:", error);
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
            console.error("Failed to unshare session:", error);
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setActiveMenuId(null);
            setConfirmDeleteId(null);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleNavClick = () => {
        if (window.innerWidth < 1024) toggleSidebar(false);
    };

    const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await useChatStore.getState().deleteSession(sessionId);
            setActiveMenuId(null);
            setConfirmDeleteId(null);
        } catch (error) {
            console.error("Failed to delete session:", error);
        }
    };

    const toggleMenu = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenuId(activeMenuId === sessionId ? null : sessionId);
        setConfirmDeleteId(null);
    };

    const triggerConfirmDelete = (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirmDeleteId(sessionId);
    };

    // Cargar sesiones y saldo de créditos al montar
    useEffect(() => {
        fetchSessions();
        refreshBilling();
    }, []);


    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Header / Search */}
            <div className="p-3 sm:p-4 border-b border-surface-highlight backdrop-blur-md sticky top-0 bg-midnight/80 z-10">
                <h2 className="text-lg sm:text-xl font-bold text-text-primary mb-3 sm:mb-4 tracking-tight">SPHERE</h2>
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary group-focus-within:text-electric-cyan transition-colors" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full bg-surface border border-surface-highlight rounded-xl py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-electric-cyan/50 focus:ring-1 focus:ring-electric-cyan/50 transition-all shadow-inner"
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
                            <Plus className="h-6 w-6 text-midnight" />
                        </div>
                        <span className="text-sm font-bold text-electric-cyan uppercase tracking-widest">Nuevo Chat</span>
                    </button>
                </div>

                {/* Section: Historial (Sessions) */}
                {sessions.length > 0 && (
                    <div>
                        <h3 className="px-4 text-[10px] font-bold text-text-secondary/40 uppercase tracking-widest mb-2">
                            Historial
                        </h3>
                        <div className="space-y-0.5 sm:space-y-1">
                            {sessions.map((session) => (
                                <div key={session.session_id} className="relative group/item">
                                    <Link
                                        to={`/chat/${session.session_id}`}
                                        onClick={handleNavClick}
                                        className={cn(
                                            "w-full px-3 sm:px-4 py-2.5 flex items-center gap-3 hover:bg-surface-highlight/40 transition-all duration-200 group border-l-2",
                                            currentSessionId === session.session_id
                                                ? "bg-surface-highlight/60 border-electric-cyan shadow-[inset_4px_0_12px_rgba(0,240,200,0.05)]"
                                                : "border-transparent"
                                        )}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-surface border border-surface-highlight flex items-center justify-center flex-shrink-0 text-text-secondary group-hover:text-electric-cyan transition-colors overflow-hidden">
                                            {(() => {
                                                const avatarUrl = session.visual_config?.avatar;
                                                if (avatarUrl) return <img src={avatarUrl} alt="" className="h-full w-full object-cover" />;
                                                const baseAgent = allAgents.find(a => a.id === session.base_agent_id);
                                                if (baseAgent?.avatar) return <span className="text-sm">{baseAgent.avatar}</span>;
                                                return <span className="text-[10px]">💬</span>;
                                            })()}
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className={cn(
                                                "text-sm font-medium truncate flex items-center gap-2",
                                                currentSessionId === session.session_id ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                                            )}>
                                                {session.title}
                                                {streamingSessionIds.includes(session.session_id) && (
                                                    <span className="flex gap-0.5">
                                                        <span className="h-1 w-1 rounded-full bg-electric-cyan animate-bounce [animation-delay:-0.3s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-electric-cyan animate-bounce [animation-delay:-0.15s]"></span>
                                                        <span className="h-1 w-1 rounded-full bg-electric-cyan animate-bounce"></span>
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-text-secondary/50 truncate">
                                                {new Date(session.created_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        {/* Three dots menu button */}
                                        <button
                                            onClick={(e) => toggleMenu(e, session.session_id)}
                                            className={cn(
                                                "p-1 rounded-lg hover:bg-surface-highlight text-text-secondary/0 group-hover/item:text-text-secondary hover:text-text-primary transition-all",
                                                activeMenuId === session.session_id && "text-text-secondary bg-surface-highlight"
                                            )}
                                        >
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                    </Link>

                                    {/* Dropdown Menu */}
                                    <AnimatePresence>
                                        {activeMenuId === session.session_id && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                className="absolute right-2 top-12 z-50 w-36 bg-surface border border-surface-highlight rounded-xl shadow-2xl p-1 backdrop-blur-md"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {confirmDeleteId === session.session_id ? (
                                                    <div className="p-2 space-y-2">
                                                        <p className="text-[10px] text-rose-400 font-bold uppercase tracking-tighter text-center">¿Confirmar borrado?</p>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={(e) => handleDelete(e, session.session_id)}
                                                                className="flex-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-500 py-1 rounded-lg text-[10px] font-bold transition-colors"
                                                            >
                                                                Sí
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.preventDefault(); setConfirmDeleteId(null); }}
                                                                className="flex-1 bg-surface-highlight hover:bg-surface-highlight/80 text-text-secondary py-1 rounded-lg text-[10px] font-bold transition-colors"
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={(e) => handleShare(e, session.session_id)}
                                                            disabled={sharingId === session.session_id}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            <Share2 className="h-3.5 w-3.5" />
                                                            {copiedId === session.session_id
                                                                ? "¡Enlace copiado!"
                                                                : sharingId === session.session_id
                                                                    ? "Generando…"
                                                                    : session.share_token
                                                                        ? "Copiar enlace"
                                                                        : "Compartir"}
                                                        </button>
                                                        {session.share_token && (
                                                            <button
                                                                onClick={(e) => handleUnshare(e, session.session_id)}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                                                            >
                                                                <Share2 className="h-3.5 w-3.5" />
                                                                Dejar de compartir
                                                            </button>
                                                        )}
                                                        <div className="h-px bg-surface-highlight my-1 mx-1" />
                                                        <button
                                                            onClick={(e) => triggerConfirmDelete(e, session.session_id)}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            Eliminar
                                                        </button>
                                                    </>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ))}
                        </div>
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
                            <p className="text-sm font-medium text-text-primary group-hover:text-electric-cyan transition-colors truncate">
                                {user.displayName || user.email || "Usuario"}
                            </p>
                            <p className="text-[11px] sm:text-xs text-text-secondary truncate">
                                {user.email || ""}
                            </p>
                        </div>
                    </Link>
                ) : (
                    <div className="flex items-center gap-2.5 sm:gap-3 p-2 rounded-xl border border-transparent opacity-50">
                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white font-bold text-sm">
                            ?
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-secondary truncate">No autenticado</p>
                        </div>
                    </div>
                )}
                <Link
                    to="/billing"
                    onClick={() => toggleSidebar(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                >
                    <CreditCard className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Facturación</span>
                    {billingLoaded && (
                        <span className="flex items-center gap-1 font-mono text-xs shrink-0">
                            <span className={cn(
                                creditsTotal === 0 ? "text-rose-400" : creditsTotal < 10 ? "text-red-400" : "text-electric-cyan"
                            )}>
                                {pro_messages_balance}
                            </span>
                            {topup_messages_balance > 0 && (
                                <span className="text-emerald-400">+{topup_messages_balance}</span>
                            )}
                        </span>
                    )}
                </Link>
                <Link
                    to="/settings"
                    onClick={() => toggleSidebar(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                >
                    <Settings className="h-4 w-4" />
                    <span>Configuración</span>
                </Link>
                {isAdmin && (
                    <Link
                        to="/admin"
                        onClick={() => toggleSidebar(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface/40 border border-transparent hover:border-surface-highlight transition-all text-sm"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Admin</span>
                    </Link>
                )}
            </div>
        </div>
    );
}

