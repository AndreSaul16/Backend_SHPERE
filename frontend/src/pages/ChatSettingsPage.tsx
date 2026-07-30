import { useRef, useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save, Camera, Zap, Pencil, X, Users, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore, getGroupMembers } from "@/store/useChatStore";
import { cn } from "@/lib/utils";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

export function ChatSettingsPage() {
    const navigate = useNavigate();
    const { getAgents, selectedAgentId, currentSessionId, sessions, updateSessionMetadata } = useChatStore();
    const agents = getAgents();
    const currentSession = sessions.find(s => s.session_id === currentSessionId);
    const activeAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
    const fileInputRef = useRef<HTMLInputElement>(null);
    const debouncedSave = useRef<ReturnType<typeof setTimeout> | null>(null);

    const groupMembers = getGroupMembers(agents);

    // Determine if it's a group chat early (needed by hooks below)
    const isGroupChat = currentSession?.type === 'group' || activeAgent?.id === 'group-chat';

    // Member edit modal state
    const [editingMember, setEditingMember] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState("");

    // Board Meeting state
    const [boardEnabled, setBoardEnabled] = useState(false);
    const [boardLoading, setBoardLoading] = useState(false);
    const [boardError, setBoardError] = useState<string | null>(null);

    // Nombre base derivado de la sesión/agente. Se calcula ANTES de cualquier
    // return condicional porque `localName` y su efecto de sincronización son
    // hooks: si vivieran debajo del early return, React vería un número de
    // hooks distinto entre el render "sesión cargando" y el render con sesión
    // ("Rendered more hooks than during the previous render") y la pantalla
    // reventaba al entrar en /chat/settings antes de que llegara la sesión.
    // Tolera currentSession/activeAgent undefined y se sincroniza al llegar.
    const sessionName = currentSession?.visual_config?.name || currentSession?.title;
    const baseName =
        sessionName ||
        activeAgent?.identity?.name ||
        activeAgent?.name.match(/^(.+?)\s*\(([A-Z]+)\)$/)?.[1]?.trim() ||
        activeAgent?.name ||
        "";

    // Input controlado con debounce para el nombre
    const [localName, setLocalName] = useState(baseName);

    // Sincronizar cuando cambia la sesión (o cuando llega por primera vez)
    useEffect(() => {
        setLocalName(baseName);
    }, [currentSessionId, baseName]);

    const getAuthToken = useCallback(async () => {
        const { getAuth } = await import("firebase/auth");
        const user = getAuth().currentUser;
        if (!user) throw new Error("No autenticado");
        return user.getIdToken();
    }, []);

    // Load board meeting status for group chats
    useEffect(() => {
        if (!isGroupChat) return;
        (async () => {
            try {
                const token = await getAuthToken();
                const resp = await fetch(`${API_URL}/me/board-settings`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (resp.ok) {
                    const data = await resp.json();
                    setBoardEnabled(data.board_meeting_enabled);
                } else {
                    setBoardError("No se pudo cargar el estado del Board Meeting.");
                }
            } catch {
                setBoardError("No se pudo cargar el estado del Board Meeting.");
            }
        })();
    }, [isGroupChat, getAuthToken]);

    const toggleBoardMeeting = async () => {
        setBoardLoading(true);
        setBoardError(null);
        try {
            const token = await getAuthToken();
            const resp = await fetch(`${API_URL}/me/board-settings`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ board_meeting_enabled: !boardEnabled }),
            });
            if (resp.ok) {
                const data = await resp.json();
                setBoardEnabled(data.board_meeting_enabled);
            } else {
                setBoardError("No se pudo guardar el cambio. Inténtalo de nuevo.");
            }
        } catch (e) {
            console.error("Error toggling board meeting:", e);
            setBoardError("Error de conexión al guardar el cambio. Inténtalo de nuevo.");
        } finally {
            setBoardLoading(false);
        }
    };

    const openMemberEdit = (member: typeof groupMembers[0]) => {
        const match = member.name.match(/^(.+?)\s*\(([A-Z]+)\)$/);
        setEditName(match ? match[1].trim() : member.name);
        setEditColor(member.hexColor);
        setEditingMember(member.id);
    };

    const saveMemberEdit = () => {
        if (!editingMember) return;
        useChatStore.getState().renameAgent(editingMember, editName);
        useChatStore.getState().updateAgentColor(editingMember, editColor);
        setEditingMember(null);
    };

    if (!activeAgent || !currentSessionId || !currentSession) {
        return (
            <div className="flex items-center justify-center h-full text-text-secondary">
                <div className="text-center space-y-3">
                    <p className="text-lg font-medium">Sin chat activo</p>
                    <p className="text-sm text-text-secondary/60">Selecciona o crea un chat primero para acceder a su configuración.</p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-2 px-4 py-2 bg-electric-cyan/10 text-electric-cyan rounded-xl hover:bg-electric-cyan/20 transition-all text-sm font-medium"
                    >
                        Volver al inicio
                    </button>
                </div>
            </div>
        );
    }

    const avatarUrl = currentSession?.visual_config?.avatar || null;

    const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && activeAgent && currentSessionId) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                // Persistir SOLO en visual_config de la sesión (atómico, aislado)
                updateSessionMetadata(currentSessionId, {
                    visual_config: {
                        ...currentSession?.visual_config,
                        avatar: base64
                    }
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    // Use data from session if available, otherwise fallback to agent
    // For direct chats, prioritize bubble_color, then effective color. For groups, use theme color.
    const sessionColor = currentSession?.visual_config?.bubble_color || currentSession?.visual_config?.color || activeAgent.hexColor;

    const roleLabel = activeAgent.identity?.role || (activeAgent.name.match(/^(.+?)\s*\(([A-Z]+)\)$/)?.[2] || activeAgent.role);

    // isGroupChat, baseName, localName y su efecto de sincronización se calculan
    // arriba (antes del early return) para no violar las Rules of Hooks.

    const handleNameInput = (val: string) => {
        setLocalName(val);
        if (debouncedSave.current) clearTimeout(debouncedSave.current);
        debouncedSave.current = setTimeout(() => {
            handleNameChange(val || baseName);
        }, 500);
    };

    const handleNameChange = async (newName: string) => {
        if (!currentSessionId) return;

        try {
            await updateSessionMetadata(currentSessionId, {
                title: newName,
                visual_config: {
                    ...currentSession?.visual_config,
                    name: newName
                }
            });
        } catch (error) {
            console.error("Failed to update session name:", error);
        }
    };

    const handleColorChange = async (newHex: string, themeName?: string) => {
        if (!currentSessionId) return;

        const updates: any = {
            visual_config: {
                ...currentSession?.visual_config,
                color: newHex // Always set primary color for consistency
            }
        };

        if (isGroupChat) {
            updates.visual_config.theme = themeName || 'Manual';
        } else {
            updates.visual_config.bubble_color = newHex;
        }

        try {
            await updateSessionMetadata(currentSessionId, updates);
        } catch (error) {
            console.error("Failed to update session color:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-midnight/40 relative overflow-hidden">
            {/* Background Living Effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                    className="aurora-blob w-[60%] h-[60%] top-[-15%] left-[-10%] animate-aurora"
                    style={{ backgroundColor: 'rgba(30, 58, 95, 0.5)' }}
                />
                <div
                    className="aurora-blob w-[45%] h-[45%] bottom-[-10%] right-[-5%] animate-aurora"
                    style={{ backgroundColor: 'rgba(13, 74, 74, 0.4)', animationDelay: '-6s' }}
                />
            </div>

            {/* Header */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-midnight/90 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary hover:text-text-primary"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <h1 className="text-base sm:text-xl font-bold text-text-primary">Configuración</h1>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-3 py-2 bg-electric-cyan/10 text-electric-cyan rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all font-medium text-sm"
                >
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">Guardar</span>
                </button>
            </div>

            {/* Content - Added pb-32 for mobile scrollability */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-8 pb-32 sm:pb-12 scrollbar-thin scrollbar-thumb-surface-highlight">
                <div className="max-w-xl mx-auto space-y-6 sm:space-y-8">

                    {/* Agent Avatar & Identity Section */}
                    <section className="flex flex-col items-center gap-4 sm:gap-6 p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface/60 border border-surface-highlight backdrop-blur-sm text-center">
                        <h2 className="text-text-secondary text-xs sm:text-sm uppercase tracking-widest font-mono">
                            {isGroupChat ? 'Identidad del Grupo' : 'Identidad del Agente'}
                        </h2>

                        <div className="relative group">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                className="hidden"
                            />
                            <div
                                onClick={triggerFileInput}
                                className="h-24 w-24 sm:h-32 sm:w-32 rounded-2xl sm:rounded-3xl bg-surface border border-surface-highlight flex items-center justify-center text-3xl sm:text-4xl font-bold shadow-2xl transition-transform group-hover:scale-105 cursor-pointer overflow-hidden"
                            >
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Agent Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <span style={{ color: sessionColor }}>{activeAgent.avatar}</span>
                                )}
                            </div>
                            <button
                                onClick={triggerFileInput}
                                className="absolute -bottom-2 -right-2 p-2 sm:p-2.5 bg-surface border border-surface-highlight rounded-xl text-electric-cyan shadow-lg hover:scale-110 transition-transform"
                            >
                                <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
                            </button>
                        </div>

                        <div className="w-full max-w-sm space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-mono block text-left ml-1 opacity-60">
                                    {isGroupChat ? 'Nombre del Grupo' : 'Nombre del Agente'}
                                </label>
                                <div className="relative group/input">
                                    <input
                                        type="text"
                                        value={localName}
                                        onChange={(e) => handleNameInput(e.target.value)}
                                        className="w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-3 text-lg font-bold text-text-primary focus:outline-none focus:border-electric-cyan/50 focus:ring-1 focus:ring-electric-cyan/20 transition-all text-center"
                                        placeholder={isGroupChat ? "Junta Directiva" : "Ej: Oberon"}
                                    />
                                    <Pencil className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/30 group-focus-within/input:text-electric-cyan transition-colors" />
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-2">
                                    {activeAgent.role !== 'system' && (
                                        <span className="px-2 py-0.5 bg-electric-cyan/10 text-electric-cyan rounded text-[10px] font-mono border border-electric-cyan/20">
                                            {roleLabel}
                                        </span>
                                    )}
                                    <h3 className="text-sm font-medium text-text-secondary">
                                        {isGroupChat ? 'Orquestación' : 'Nivel de Cargo'}
                                    </h3>
                                </div>
                                <p className="text-text-secondary/60 text-xs italic">{activeAgent.description}</p>
                            </div>
                        </div>

                        <p className="text-[10px] text-text-secondary/40 max-w-[280px]">
                            {isGroupChat
                                ? "La identidad del grupo se comparte con todos los miembros."
                                : "La personalización es única para esta conversación."}
                        </p>
                    </section>

                    {/* Color Settings Section */}
                    <section className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface/60 border border-surface-highlight backdrop-blur-sm space-y-4 sm:space-y-6">
                        <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-electric-cyan" />
                            <h2 className="text-text-secondary text-xs sm:text-sm uppercase tracking-widest font-mono">
                                {isGroupChat ? 'Paleta de Grupo' : 'Frecuencia del Experto (Color)'}
                            </h2>
                        </div>

                        {isGroupChat ? (
                            /* Presets for Group Chat */
                            <div className="grid grid-cols-5 gap-3 sm:gap-4">
                                {[
                                    { name: 'Cyan', hex: '#00F0C8' },
                                    { name: 'Teal', hex: '#00C1B3' },
                                    { name: 'Indigo', hex: '#6B8AFD' },
                                    { name: 'Purple', hex: '#8A63D2' },
                                    { name: 'Magenta', hex: '#E34A95' },
                                ].map((c) => (
                                    <button
                                        key={c.hex}
                                        onClick={() => handleColorChange(c.hex, c.name)}
                                        className={cn(
                                            "group relative flex flex-col items-center gap-2 transition-all",
                                            sessionColor === c.hex ? "scale-110" : "opacity-60 hover:opacity-100"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "h-8 w-8 sm:h-10 sm:w-10 rounded-xl border-2 transition-all duration-300",
                                                activeAgent.hexColor === c.hex ? "shadow-lg" : "border-transparent"
                                            )}
                                            style={{
                                                backgroundColor: `${c.hex}20`,
                                                borderColor: sessionColor === c.hex ? c.hex : 'transparent',
                                                boxShadow: sessionColor === c.hex ? `0 0 15px ${c.hex}40` : 'none'
                                            }}
                                        >
                                            <div className="h-full w-full flex items-center justify-center">
                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />
                                            </div>
                                        </div>
                                        <span className="text-[8px] sm:text-[10px] font-mono uppercase tracking-tighter opacity-50">{c.name}</span>

                                        {sessionColor === c.hex && (
                                            <motion.div
                                                layoutId="activeColor"
                                                className="absolute -inset-1 border border-current rounded-xl opacity-20"
                                                style={{ color: c.hex }}
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            /* Color Picker for Individual Agents */
                            <div className="flex flex-col items-center gap-6 py-4">
                                <div className="relative group/picker">
                                    <div
                                        className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 shadow-2xl transition-transform duration-500 group-hover/picker:scale-105 flex items-center justify-center relative overflow-hidden"
                                        style={{
                                            borderColor: sessionColor,
                                            boxShadow: `0 0 30px ${sessionColor}40`,
                                            backgroundColor: `${sessionColor}10`
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                                        <input
                                            type="color"
                                            value={sessionColor}
                                            onChange={(e) => handleColorChange(e.target.value)}
                                            className="absolute inset-[10%] w-[80%] h-[80%] opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="text-[32px] pointer-events-none z-0" style={{ color: activeAgent.hexColor }}>
                                            🎨
                                        </div>
                                    </div>
                                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-midnight border border-surface-highlight rounded-xl shadow-2xl pointer-events-none flex items-center gap-2 min-w-[100px] justify-center">
                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: sessionColor }} />
                                        <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-text-primary">
                                            {sessionColor}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[10px] sm:text-xs text-text-secondary/60 italic text-center max-w-[240px] leading-relaxed">
                                    Haz clic en el icono para abrir la rueda de colores y sintonizar la firma espectral del experto.
                                </p>
                            </div>
                        )}

                        <p className="text-[10px] sm:text-xs text-text-secondary/40 leading-relaxed text-center">
                            {isGroupChat
                                ? "La paleta define los colores de burbujas de todos los miembros."
                                : "Personaliza el color de los mensajes de este agente."}
                        </p>
                    </section>

                    {/* Board Meeting Toggle - Only for Group Chats */}
                    {isGroupChat && (
                        <section className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface/60 border border-surface-highlight backdrop-blur-sm space-y-4">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-purple-400" />
                                <h2 className="text-text-secondary text-xs sm:text-sm uppercase tracking-widest font-mono">Board Meeting</h2>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-text-primary">Debate entre agentes</p>
                                    <p className="text-[10px] text-text-secondary mt-0.5">Los agentes discuten entre sí antes de responderte (consume más tokens)</p>
                                </div>
                                <button
                                    onClick={toggleBoardMeeting}
                                    disabled={boardLoading}
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                        boardEnabled ? "bg-electric-cyan" : "bg-surface-highlight",
                                        boardLoading && "opacity-50"
                                    )}
                                >
                                    {boardLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-text-secondary" />
                                    ) : (
                                        <span className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                            boardEnabled ? "translate-x-6" : "translate-x-1"
                                        )} />
                                    )}
                                </button>
                            </div>
                            {boardError && (
                                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                                    {boardError}
                                </p>
                            )}
                        </section>
                    )}

                    {/* Group Members Section - Only for Group Chats */}
                    {isGroupChat && (
                        <section className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface/60 border border-surface-highlight backdrop-blur-sm space-y-4 sm:space-y-6">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">👥</span>
                                <h2 className="text-text-secondary text-xs sm:text-sm uppercase tracking-widest font-mono">Miembros del Grupo</h2>
                            </div>

                            <div className="space-y-2">
                                {groupMembers.map((member) => {
                                    const memberMatch = member.name.match(/^(.+?)\s*\(([A-Z]+)\)$/);
                                    const memberName = memberMatch ? memberMatch[1].trim() : member.name;
                                    const memberRole = memberMatch ? memberMatch[2] : member.role;

                                    return (
                                        <motion.button
                                            key={member.id}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => openMemberEdit(member)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-midnight/40 border border-surface-highlight hover:border-electric-cyan/30 transition-all"
                                        >
                                            <div
                                                className="h-10 w-10 rounded-full flex items-center justify-center border overflow-hidden"
                                                style={{ borderColor: `${member.hexColor}40` }}
                                            >
                                                <span className={cn("text-sm font-bold", member.color)}>{member.avatar}</span>
                                            </div>
                                            <div className="flex-1 text-left">
                                                <p className="text-sm font-medium text-text-primary">{memberName}</p>
                                                <p className="text-[10px] text-text-secondary/60 font-mono">{member.description}</p>
                                            </div>
                                            <span
                                                className="px-2 py-1 rounded text-[10px] font-bold font-mono border"
                                                style={{
                                                    color: member.hexColor,
                                                    borderColor: `${member.hexColor}40`,
                                                    backgroundColor: `${member.hexColor}10`
                                                }}
                                            >
                                                {memberRole}
                                            </span>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            <p className="text-[10px] sm:text-xs text-text-secondary/40 leading-relaxed text-center">
                                Haz clic en un miembro para personalizar su nombre y color.
                            </p>
                        </section>
                    )}

                    {/* Member Edit Modal */}
                    <AnimatePresence>
                        {editingMember && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-surface border border-surface-highlight rounded-2xl p-6 max-w-sm mx-4 space-y-5 w-full"
                                >
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-text-primary">Editar miembro</h3>
                                        <button onClick={() => setEditingMember(null)} className="p-1.5 hover:bg-surface-highlight rounded-lg text-text-secondary hover:text-text-primary transition-colors">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">Nombre</label>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-electric-cyan/50 transition-all"
                                                placeholder="Ej: Hernesto"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] text-text-secondary uppercase tracking-widest font-mono">Color</label>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="h-10 w-10 rounded-xl border-2 cursor-pointer relative overflow-hidden"
                                                    style={{ borderColor: editColor, backgroundColor: `${editColor}20` }}
                                                >
                                                    <input
                                                        type="color"
                                                        value={editColor}
                                                        onChange={(e) => setEditColor(e.target.value)}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                    />
                                                    <div className="h-full w-full flex items-center justify-center">
                                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: editColor }} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {['#8A63D2', '#00C1B3', '#E34A95', '#6B8AFD', '#00F0C8'].map(c => (
                                                        <button
                                                            key={c}
                                                            onClick={() => setEditColor(c)}
                                                            className={cn(
                                                                "h-7 w-7 rounded-lg border-2 transition-all",
                                                                editColor === c ? "scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                                                            )}
                                                            style={{ backgroundColor: `${c}30`, borderColor: editColor === c ? c : 'transparent' }}
                                                        >
                                                            <div className="h-full w-full flex items-center justify-center">
                                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setEditingMember(null)}
                                            className="flex-1 py-2.5 bg-surface/50 text-text-secondary border border-surface-highlight rounded-xl hover:text-text-primary transition-all text-sm"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={saveMemberEdit}
                                            className="flex-1 py-2.5 bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all text-sm font-medium"
                                        >
                                            Guardar
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
