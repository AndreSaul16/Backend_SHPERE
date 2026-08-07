import { useRef, useState, useEffect } from "react";
import { ArrowLeft, Save, Camera, Zap, Pencil, Users, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useChatStore, getGroupMembers } from "@/store/useChatStore";
import { cn } from "@/lib/utils";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AvatarImage } from "@/components/ui/AvatarImage";
import { notify, reasonOf } from "@/lib/toastBus";
import { useBoardSettingsStore } from "@/store/useBoardSettingsStore";


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

    // D28: el guardado real del botón de la cabecera.
    const [savingAll, setSavingAll] = useState(false);

    // Member edit modal state
    const [editingMember, setEditingMember] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState("");

    // D47 — el ajuste de debate NO tiene estado local aquí. Es el mismo que
    // pinta `BoardMeetingSettings`, y con un `useState` en cada pantalla las
    // dos podían enseñar posiciones contrarias del mismo interruptor.
    const {
        enabled: boardEnabled,
        saving: boardSaving,
        error: boardError,
        load: loadBoardSettings,
        setEnabled: setBoardEnabled,
    } = useBoardSettingsStore();

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

    // Sincronizar cuando cambia la sesión (o cuando llega por primera vez).
    //
    // Se ajusta DURANTE EL RENDER y no en un `useEffect`: es el patrón que
    // React documenta para «reiniciar estado cuando cambia una prop». Con el
    // efecto había un render intermedio pintando el nombre viejo, y `useState`
    // + `setState` en efecto es además lo que el compilador marca. Se guarda de
    // qué sesión y de qué nombre base viene el valor actual, así que el ajuste
    // corre una sola vez por cambio real y no pisa lo que el usuario escribe.
    const [sincronizadoDe, setSincronizadoDe] = useState({ sessionId: currentSessionId, baseName });
    if (sincronizadoDe.sessionId !== currentSessionId || sincronizadoDe.baseName !== baseName) {
        setSincronizadoDe({ sessionId: currentSessionId, baseName });
        setLocalName(baseName);
    }

    // Load board meeting status for group chats
    useEffect(() => {
        if (!isGroupChat) return;
        loadBoardSettings();
    }, [isGroupChat, loadBoardSettings]);

    // Sin aviso: el mensaje de fallo sale pegado al propio interruptor, que es
    // donde está mirando quien acaba de pulsarlo. Un toast repetiría lo que ya
    // se lee ahí mismo.
    const toggleBoardMeeting = () => setBoardEnabled(!boardEnabled);

    const openMemberEdit = (member: typeof groupMembers[0]) => {
        const match = member.name.match(/^(.+?)\s*\(([A-Z]+)\)$/);
        setEditName(match ? match[1].trim() : member.name);
        setEditColor(member.hexColor);
        setEditingMember(member.id);
    };

    /**
     * D28 (segunda mitad) — editar un miembro sobrevive a la recarga.
     *
     * `renameAgent`/`updateAgentColor` sólo tocaban el array en memoria del
     * store: sin `persist` y sin API, el nombre y el color que el usuario le
     * daba a un director se perdían al recargar mientras el modal decía
     * «Guardar cambios». Ahora los dos escriben también en el almacén local
     * (`agentIdentityOverrides`), que se rehidrata al arrancar el store.
     *
     * Ojo: NO es guardado por API. El backend de este repo no tiene dónde
     * guardarlo —`/me/agent-overrides` sólo acepta prompt/temperatura/modelo,
     * y `visual_config` de la sesión es un modelo de campos fijos—, así que
     * hacerlo de verdad exige tocar el servidor. El detalle está en la cabecera
     * de `lib/agentIdentityOverrides.ts`.
     */
    const saveMemberEdit = () => {
        if (!editingMember) return;
        const nombreOk = useChatStore.getState().renameAgent(editingMember, editName);
        const colorOk = useChatStore.getState().updateAgentColor(editingMember, editColor);
        setEditingMember(null);
        if (!nombreOk || !colorOk) {
            // Modo privado, cuota llena, storage bloqueado. §11: qué pasó, qué
            // hacer y qué se conserva.
            notify({
                title: 'El cambio no se guardará al recargar',
                detail:
                    'Este navegador no deja guardar preferencias. El nombre y el color se ven ahora, pero volverán a los de fábrica al recargar.',
                variant: 'warning',
                dedupeKey: 'member-identity',
            });
        }
    };

    if (!activeAgent || !currentSessionId || !currentSession) {
        return (
            <div className="flex items-center justify-center h-full text-content-muted">
                <div className="text-center space-y-3">
                    <p className="text-lg font-medium">Sin chat activo</p>
                    <p className="text-sm text-content-quiet">Selecciona o crea un chat primero para acceder a su configuración.</p>
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
                // Persistir SOLO en visual_config de la sesión (atómico, aislado).
                // El `.catch` no es decorativo: `updateSessionMetadata` relanza,
                // y sin él esto era una promesa rechazada sin dueño — el avatar
                // se veía cambiado hasta recargar y luego volvía al anterior.
                updateSessionMetadata(currentSessionId, {
                    visual_config: {
                        ...currentSession?.visual_config,
                        avatar: base64
                    }
                }).catch((error) => {
                    notify({
                        title: 'No se pudo guardar el avatar',
                        detail: reasonOf(error) ?? 'La sesión mantiene la imagen anterior.',
                        variant: 'error',
                        dedupeKey: 'session-avatar',
                    });
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

    /** `true` si el nombre quedó guardado. */
    const handleNameChange = async (newName: string): Promise<boolean> => {
        if (!currentSessionId) return false;

        try {
            await updateSessionMetadata(currentSessionId, {
                title: newName,
                visual_config: {
                    ...currentSession?.visual_config,
                    name: newName
                }
            });
            return true;
        } catch (error) {
            // Avisa la página, no el store: `updateSessionMetadata` sirve a
            // nombre, color y avatar por igual, y sólo aquí se sabe cuál de los
            // tres se ha quedado sin guardar.
            //
            // `dedupeKey` porque el guardado va con rebote de 500ms al teclear:
            // con el backend caído, cada pausa al escribir apilaría un aviso.
            notify({
                title: 'No se pudo guardar el nombre',
                detail: reasonOf(error) ?? 'Tu texto sigue en el campo. Vuelve a intentarlo.',
                variant: 'error',
                dedupeKey: 'session-name',
            });
            return false;
        }
    };

    /**
     * D28 — el botón «Guardar» guarda.
     *
     * Antes era literalmente `onClick={() => navigate(-1)}`: la fila de §11
     * «El botón dice lo que hace» lo cita por su nombre como el ejemplo de lo
     * que no se debe hacer.
     *
     * Lo que quedaba de verdad sin guardar al pulsarlo era el nombre: se manda
     * con un rebote de 500ms, así que escribir y pulsar «Guardar» de seguido
     * dejaba el PATCH en el aire. Ahora el rebote se cancela y el guardado se
     * hace aquí, esperado: sólo se vuelve atrás cuando ha ido bien. Si falla,
     * la página se queda donde está —con el texto en el campo— y el aviso de
     * `handleNameChange` explica qué pasó (§11).
     */
    const handleSave = async () => {
        if (savingAll) return;
        if (debouncedSave.current) {
            clearTimeout(debouncedSave.current);
            debouncedSave.current = null;
        }
        setSavingAll(true);
        const guardado = await handleNameChange(localName || baseName);
        setSavingAll(false);
        if (guardado) navigate(-1);
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
            notify({
                title: 'No se pudo guardar el color',
                detail: reasonOf(error) ?? 'La sesión mantiene el color anterior.',
                variant: 'error',
                dedupeKey: 'session-color',
            });
        }
    };

    return (
        <div className="flex flex-col h-full bg-midnight/40 relative overflow-hidden">
            {/* Background Living Effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                    className="aurora-blob w-[60%] h-[60%] top-[-15%] left-[-10%]"
                    style={{ backgroundColor: 'rgba(30, 58, 95, 0.5)' }}
                />
                <div
                    className="aurora-blob w-[45%] h-[45%] bottom-[-10%] right-[-5%]"
                    style={{ backgroundColor: 'rgba(13, 74, 74, 0.4)', animationDelay: '-6s' }}
                />
            </div>

            {/* Header */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-surface-0 sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <h1 className="text-base sm:text-xl font-bold text-content-strong">Configuración</h1>
                </div>
                {/* D28 + §11 «El botón dice lo que hace»: decía «Guardar» y
                    sólo hacía `navigate(-1)`. Ahora guarda de verdad, y el
                    rótulo es el de la fila «Bien» de esa misma tabla. El
                    `<Button>` trae el estado `loading` de §9.1 —ancho
                    congelado, gerundio, `aria-busy`— de serie. */}
                <Button
                    variant="primary"
                    onClick={() => void handleSave()}
                    loading={savingAll}
                    loadingLabel="Guardando"
                    data-testid="guardar-cambios"
                >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Guardar cambios
                </Button>
            </div>

            {/* Content - Added pb-32 for mobile scrollability */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-8 pb-32 sm:pb-12 scrollbar-thin scrollbar-thumb-surface-highlight">
                <div className="max-w-xl mx-auto space-y-6 sm:space-y-8">

                    {/* Agent Avatar & Identity Section */}
                    <section className="flex flex-col items-center gap-4 sm:gap-6 p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge text-center">
                        <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                            {isGroupChat ? 'Identidad del Grupo' : 'Identidad del Agente'}
                        </h2>

                        <div className="relative group">
                            <input
                                id="session-avatar-file"
                                aria-label="Subir imagen de avatar"
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                className="sr-only"
                            />
                            {/* D14/§12.4: era un `<div onClick>` MÁS un botón que
                                hacía exactamente lo mismo — un camino de ratón
                                duplicado y ninguno de teclado. Ahora el avatar
                                entero es el <button> (área táctil de sobra,
                                §12.11) y la chapa de la cámara es decoración
                                dentro de él, no un segundo punto de tabulación. */}
                            <button
                                type="button"
                                onClick={triggerFileInput}
                                aria-label={isGroupChat ? 'Cambiar la imagen del grupo' : 'Cambiar la imagen del agente'}
                                className="relative h-24 w-24 sm:h-32 sm:w-32 rounded-md bg-surface border border-surface-highlight flex items-center justify-center text-3xl sm:text-4xl font-bold shadow-2xl transition-transform group-hover:scale-105 cursor-pointer overflow-hidden"
                            >
                                <AvatarImage
                                    src={avatarUrl}
                                    className="h-full w-full object-cover"
                                    fallback={<span style={{ color: sessionColor }}>{activeAgent.avatar}</span>}
                                />
                            </button>
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-2 -right-2 p-2 sm:p-2.5 bg-surface border border-surface-highlight rounded-xl text-electric-cyan shadow-lg"
                            >
                                <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
                            </span>
                        </div>

                        <div className="w-full max-w-sm space-y-4">
                            <div className="space-y-1.5">
                                <div className="relative group/input">
                                    <TextField
                                        label={isGroupChat ? 'Nombre del grupo' : 'Nombre del agente'}
                                        id="session-name"
                                        value={localName}
                                        onChange={(e) => handleNameInput(e.target.value)}
                                        controlClassName="py-3 pe-11 text-lg font-bold text-center"
                                        placeholder={isGroupChat ? "Junta Directiva" : "Ej: Oberon"}
                                    />
                                    <Pencil className="absolute right-4 top-[2.6rem] h-4 w-4 text-content-muted group-focus-within/input:text-accent transition-colors" aria-hidden="true" />
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-2">
                                    {activeAgent.role !== 'system' && (
                                        <span className="px-2 py-0.5 bg-electric-cyan/10 text-electric-cyan rounded text-micro font-mono border border-electric-cyan/20">
                                            {roleLabel}
                                        </span>
                                    )}
                                    <h3 className="text-sm font-medium text-content-muted">
                                        {isGroupChat ? 'Orquestación' : 'Nivel de Cargo'}
                                    </h3>
                                </div>
                                <p className="text-content-quiet text-xs italic">{activeAgent.description}</p>
                            </div>
                        </div>

                        <p className="text-xs text-content-quiet max-w-[280px]">
                            {isGroupChat
                                ? "La identidad del grupo se comparte con todos los miembros."
                                : "La personalización es única para esta conversación."}
                        </p>
                    </section>

                    {/* Color Settings Section */}
                    <section className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-4 sm:space-y-6">
                        <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-electric-cyan" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                {isGroupChat ? 'Paleta de Grupo' : 'Frecuencia del Experto (Color)'}
                            </h2>
                        </div>

                        {isGroupChat ? (
                            /* Presets for Group Chat */
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4">
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
                                        <span className="text-micro font-mono uppercase opacity-50">{c.name}</span>

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
                                                                                <input
                                            id="session-color"
                                            aria-label="Color de la sesión"
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
                                        <span className="text-micro font-bold font-mono uppercase text-content-strong">
                                            {sessionColor}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-content-quiet italic text-center max-w-[240px] leading-relaxed">
                                    Haz clic en el icono para abrir la rueda de colores y sintonizar la firma espectral del experto.
                                </p>
                            </div>
                        )}

                        <p className="text-xs text-content-quiet leading-relaxed text-center">
                            {isGroupChat
                                ? "La paleta define los colores de burbujas de todos los miembros."
                                : "Personaliza el color de los mensajes de este agente."}
                        </p>
                    </section>

                    {/* Board Meeting Toggle - Only for Group Chats */}
                    {isGroupChat && (
                        <section className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-4">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                                <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">Board Meeting</h2>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-content-strong">Debate entre agentes</p>
                                    <p className="text-xs text-content-muted mt-0.5">Los agentes discuten entre sí antes de responderte (consume más tokens)</p>
                                </div>
                                {/* §12.7: un interruptor es `role="switch"` con
                                    `aria-checked`; hasta ahora su estado era sólo
                                    la posición del punto y el color. */}
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={boardEnabled}
                                    aria-label="Debate entre agentes antes de responder"
                                    aria-busy={boardSaving}
                                    data-testid="board-toggle-chat"
                                    onClick={() => void toggleBoardMeeting()}
                                    disabled={boardSaving}
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                        boardEnabled ? "bg-electric-cyan" : "bg-surface-highlight",
                                        boardSaving && "opacity-50"
                                    )}
                                >
                                    {boardSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-content-muted" aria-hidden="true" />
                                    ) : (
                                        <span className={cn(
                                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                            boardEnabled ? "translate-x-6" : "translate-x-1"
                                        )} />
                                    )}
                                </button>
                            </div>
                            {boardError && (
                                <p className="text-xs text-danger bg-dissent/10 border border-dissent/30 rounded-xl px-3 py-2">
                                    {boardError}
                                </p>
                            )}
                            {/* §12.6: el resultado de guardar se anuncia. El
                                mensaje de error de arriba aparecía en silencio. */}
                            <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-board-save">
                                {boardSaving
                                    ? "Guardando la preferencia de debate…"
                                    : boardError
                                        ? boardError
                                        : boardEnabled
                                            ? "Debate entre agentes activado."
                                            : "Debate entre agentes desactivado."}
                            </p>
                        </section>
                    )}

                    {/* Group Members Section - Only for Group Chats */}
                    {isGroupChat && (
                        <section className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-4 sm:space-y-6">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">👥</span>
                                <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">Miembros del Grupo</h2>
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
                                                <p className="text-sm font-medium text-content-strong">{memberName}</p>
                                                <p className="text-xs text-content-quiet font-mono">{member.description}</p>
                                            </div>
                                            <span
                                                className="px-2 py-1 rounded text-micro font-bold font-mono border"
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

                            <p className="text-xs text-content-quiet leading-relaxed text-center">
                                Haz clic en un miembro para personalizar su nombre y color.
                            </p>
                        </section>
                    )}

                    {/* Member Edit Modal — §9.4. Era un <div> sin role="dialog",
                        sin trampa de foco y sin Escape. */}
                    <Modal
                        open={editingMember !== null}
                        onClose={() => setEditingMember(null)}
                        size="sm"
                        title="Editar miembro"
                        footer={
                            <div className="flex w-full items-center justify-end gap-3">
                                <Button variant="ghost" onClick={() => setEditingMember(null)}>
                                    Cancelar
                                </Button>
                                <Button variant="primary" onClick={saveMemberEdit}>
                                    Guardar cambios
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <TextField
                                label="Nombre"
                                id="member-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Ej: Hernesto"
                            />

                            <div className="space-y-1.5">
                                <label htmlFor="member-color" className="text-micro text-content-muted uppercase font-mono">Color</label>
                                <div className="flex items-center gap-3">
                                    <div
                                        className="h-10 w-10 rounded-sm border-2 relative overflow-hidden"
                                        style={{ borderColor: editColor, backgroundColor: `${editColor}20` }}
                                    >
                                        <input
                                            id="member-color"
                                            type="color"
                                            value={editColor}
                                            onChange={(e) => setEditColor(e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <div className="h-full w-full flex items-center justify-center">
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: editColor }} />
                                        </div>
                                    </div>
                                    {/* §9.9: el estado activo de un chip no puede ser
                                        sólo cromático — de ahí `aria-pressed`. */}
                                    <div className="flex gap-2" role="group" aria-label="Colores sugeridos">
                                        {['#8A63D2', '#00C1B3', '#E34A95', '#6B8AFD', '#00F0C8'].map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setEditColor(c)}
                                                aria-pressed={editColor === c}
                                                aria-label={`Color ${c}`}
                                                className={cn(
                                                    "h-9 w-9 rounded-sm border-2 transition-all",
                                                    editColor === c ? "scale-110 shadow-e2" : "border-transparent hover:scale-105"
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
                    </Modal>
                </div>
            </div>
        </div>
    );
}
