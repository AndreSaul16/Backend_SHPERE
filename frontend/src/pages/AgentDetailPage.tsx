import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    Save,
    Brain,
    Palette,
    Thermometer,
    Cpu,
    Trash2,
    AlertTriangle,
    Check,
    X,
    Loader2,
    BookOpen,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KnowledgeBasePanel } from "@/components/agents/KnowledgeBasePanel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const ALLOWED_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
        const { getAuth } = await import("firebase/auth");
        const user = getAuth().currentUser;
        if (user) {
            headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
        }
    } catch {
        // sin auth — el backend rechazará con 401
    }
    return headers;
}

// ---------------------------------------------------------------------------
// Types (API response shape)
// ---------------------------------------------------------------------------

interface AgentIdentityAPI {
    name: string;
    role: string;
    color: string;
    description?: string;
    avatar_style?: string;
}

interface BrainConfigAPI {
    model: string;
    temperature: number;
    system_prompt: string;
}

interface AgentDetailAPI {
    agent_id: string;
    identity: AgentIdentityAPI;
    brain_config: BrainConfigAPI;
    owner_user_id?: string;
    is_public?: boolean;
    created_at?: string;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

type ToastVariant = "success" | "error";

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

let toastCounter = 0;

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
            <AnimatePresence mode="popLayout">
                {toasts.map((t) => (
                    <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className={cn(
                            "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl text-sm font-medium",
                            t.variant === "success" &&
                                "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
                            t.variant === "error" &&
                                "bg-red-500/10 border-red-500/30 text-red-400"
                        )}
                    >
                        {t.variant === "success" ? (
                            <Check className="h-4 w-4 shrink-0" />
                        ) : (
                            <X className="h-4 w-4 shrink-0" />
                        )}
                        <span>{t.message}</span>
                        <button
                            onClick={() => onDismiss(t.id)}
                            className="ml-2 p-0.5 hover:bg-white/10 rounded transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------

function DeleteConfirmationModal({
    agentName,
    onConfirm,
    onCancel,
    isDeleting,
}: {
    agentName: string;
    onConfirm: () => void;
    onCancel: () => void;
    isDeleting: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-surface border border-red-500/20 rounded-2xl p-6 space-y-5 shadow-2xl"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-red-500/10 rounded-xl">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-content-strong">Eliminar Agente</h3>
                        <p className="text-xs text-content-muted mt-0.5">Esta acción no se puede deshacer</p>
                    </div>
                </div>

                <p className="text-sm text-content-muted leading-relaxed">
                    Vas a eliminar permanentemente al agente{" "}
                    <span className="font-semibold text-red-400">{agentName}</span>.
                    Se perdera toda su configuracion, base de conocimiento y datos asociados.
                </p>

                <div className="flex gap-3 pt-1">
                    <button
                        onClick={onCancel}
                        disabled={isDeleting}
                        className="flex-1 py-2.5 bg-surface border border-white/5 rounded-xl text-sm font-medium text-content-muted hover:bg-surface-highlight transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex-1 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Eliminando...
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4" />
                                Eliminar definitivamente
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export function AgentDetailPage() {
    const { agentId } = useParams<{ agentId: string }>();
    const navigate = useNavigate();

    // ── Loading / Error ──────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // ── Toasts ───────────────────────────────────────────────────────────
    const [toasts, setToasts] = useState<Toast[]>([]);

    const pushToast = useCallback((message: string, variant: ToastVariant) => {
        const id = ++toastCounter;
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // ── Form State ───────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState("#00F0C8");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [temperature, setTemperature] = useState(0.7);
    const [model, setModel] = useState<AllowedModel>("deepseek-v4-pro");
    const [role, setRole] = useState("specialist");

    // ── Saving / Deleting ────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // ── Dirty tracking ───────────────────────────────────────────────────
    const [originalHash, setOriginalHash] = useState("");

    const computeHash = useCallback(
        () =>
            JSON.stringify({ name, description, color, systemPrompt, temperature, model }),
        [name, description, color, systemPrompt, temperature, model]
    );

    const isDirty = computeHash() !== originalHash;

    // ── Fetch Agent ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!agentId) return;

        let cancelled = false;

        async function fetchAgent() {
            setIsLoading(true);
            setFetchError(null);
            try {
                const headers = await getAuthHeaders();
                const res = await fetch(`${API_URL}/agents/${agentId}`, { headers });
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
                const data: AgentDetailAPI = await res.json();

                if (cancelled) return;

                setName(data.identity?.name ?? "");
                setDescription(data.identity?.description ?? "");
                setColor(data.identity?.color ?? "#00F0C8");
                setRole(data.identity?.role ?? "specialist");
                setSystemPrompt(data.brain_config?.system_prompt ?? "");
                setTemperature(data.brain_config?.temperature ?? 0.7);
                setModel(
                    ALLOWED_MODELS.includes(data.brain_config?.model as AllowedModel)
                        ? (data.brain_config.model as AllowedModel)
                        : "deepseek-v4-pro"
                );

                setOriginalHash(
                    JSON.stringify({
                        name: data.identity?.name ?? "",
                        description: data.identity?.description ?? "",
                        color: data.identity?.color ?? "#00F0C8",
                        systemPrompt: data.brain_config?.system_prompt ?? "",
                        temperature: data.brain_config?.temperature ?? 0.7,
                        model: ALLOWED_MODELS.includes(data.brain_config?.model as AllowedModel)
                            ? (data.brain_config.model as AllowedModel)
                            : "deepseek-v4-pro",
                    })
                );
            } catch (err: any) {
                if (!cancelled) setFetchError(err.message ?? "Error desconocido");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        fetchAgent();
        return () => {
            cancelled = true;
        };
    }, [agentId]);

    // ── Save Handler ─────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!agentId || isSaving) return;

        setIsSaving(true);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${API_URL}/agents/${agentId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    identity: {
                        name,
                        role,
                        color,
                        description,
                    },
                    brain_config: {
                        model,
                        temperature,
                        system_prompt: systemPrompt,
                    },
                }),
            });

            if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);

            setOriginalHash(computeHash());
            pushToast("Agente actualizado correctamente", "success");
        } catch (err: any) {
            pushToast(err.message ?? "Error al guardar", "error");
        } finally {
            setIsSaving(false);
        }
    };

    // ── Delete Handler ───────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!agentId || isDeleting) return;

        setIsDeleting(true);
        try {
            const headers = await getAuthHeaders();
            const res = await fetch(`${API_URL}/agents/${agentId}`, {
                method: "DELETE",
                headers,
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            pushToast("Agente eliminado", "success");
            // Small delay so the user can see the toast
            setTimeout(() => navigate("/chat"), 400);
        } catch (err: any) {
            pushToast(err.message ?? "Error al eliminar", "error");
            setIsDeleting(false);
        }
    };

    // ── Avatar letter + colour ───────────────────────────────────────────
    const avatarLetter = name.trim().charAt(0).toUpperCase() || "A";

    // ── Loading State ────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-midnight/40">
                <Loader2 className="h-8 w-8 animate-spin text-electric-cyan" />
                <p className="text-sm text-content-muted font-mono tracking-wider">
                    Cargando agente...
                </p>
            </div>
        );
    }

    // ── Error State ──────────────────────────────────────────────────────
    if (fetchError) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-midnight/40 px-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-3 max-w-md">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
                    <p className="text-sm text-red-400 font-medium">{fetchError}</p>
                    <button
                        onClick={() => navigate("/chat")}
                        className="px-4 py-2 bg-surface border border-white/5 rounded-xl text-sm text-content-muted hover:text-content-strong transition-colors"
                    >
                        Volver al chat
                    </button>
                </div>
            </div>
        );
    }

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-midnight/40 relative overflow-hidden">
            {/* ── Aurora Background ──────────────────────────────────── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                    className="aurora-blob w-[60%] h-[60%] top-[-15%] left-[-10%]"
                    style={{ backgroundColor: "rgba(30, 58, 95, 0.5)" }}
                />
                <div
                    className="aurora-blob w-[45%] h-[45%] bottom-[-10%] right-[-5%]"
                    style={{ backgroundColor: "rgba(13, 74, 74, 0.4)", animationDelay: "-6s" }}
                />
            </div>

            {/* ── Header ────────────────────────────────────────────── */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-midnight/90 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        onClick={() => navigate("/chat")}
                        className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>

                    {/* Agent identity in header */}
                    <div className="flex items-center gap-3">
                        <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold border"
                            style={{
                                backgroundColor: `${color}15`,
                                borderColor: `${color}40`,
                                color: color,
                            }}
                        >
                            {avatarLetter}
                        </div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-xl font-bold text-content-strong truncate max-w-[180px] sm:max-w-none">
                                {name || "Agente"}
                            </h1>
                            <span
                                className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border"
                                style={{
                                    color: color,
                                    borderColor: `${color}30`,
                                    backgroundColor: `${color}10`,
                                }}
                            >
                                {role}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all",
                        isDirty
                            ? "bg-electric-cyan/10 text-electric-cyan hover:bg-electric-cyan hover:text-midnight"
                            : "bg-surface text-content-quiet cursor-not-allowed"
                    )}
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">
                        {isSaving ? "Guardando..." : "Guardar Cambios"}
                    </span>
                </button>
            </div>

            {/* ── Scrollable Content ────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-8 pb-32 sm:pb-12 scrollbar-thin scrollbar-thumb-surface-highlight">
                <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">

                    {/* ════════════════════════════════════════════════ */}
                    {/* Section 1: Identity                             */}
                    {/* ════════════════════════════════════════════════ */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="p-6 sm:p-8 rounded-2xl bg-surface/60 border border-white/5 backdrop-blur-sm space-y-6"
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-luxury-purple" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Identidad del Agente
                            </h2>
                        </div>

                        {/* Avatar Preview */}
                        <div className="flex justify-center">
                            <div
                                className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-bold border-2 shadow-2xl transition-all duration-500"
                                style={{
                                    backgroundColor: `${color}15`,
                                    borderColor: `${color}50`,
                                    color: color,
                                    boxShadow: `0 0 40px ${color}20`,
                                }}
                            >
                                {avatarLetter}
                            </div>
                        </div>

                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono block ml-1 opacity-60">
                                Nombre
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ej: Nexus, Oberon..."
                                className="w-full bg-midnight/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-content-strong focus:border-electric-cyan/50 focus:ring-1 focus:ring-electric-cyan/20 transition-all placeholder:text-content-quiet"
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono block ml-1 opacity-60">
                                Descripción
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                                placeholder="Breve descripcion del propósito del agente..."
                                className="w-full bg-midnight/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-content-strong focus:border-electric-cyan/50 focus:ring-1 focus:ring-electric-cyan/20 transition-all resize-none placeholder:text-content-quiet"
                            />
                        </div>

                        {/* Color Picker */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono block ml-1 opacity-60">
                                Color de Identidad
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div
                                        className="h-10 w-10 rounded-xl border-2 transition-all duration-300 cursor-pointer hover:scale-110"
                                        style={{
                                            backgroundColor: `${color}30`,
                                            borderColor: color,
                                            boxShadow: `0 0 12px ${color}30`,
                                        }}
                                    />
                                </div>
                                <div className="relative flex-1">
                                    <Palette className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-quiet" />
                                    <input
                                        type="text"
                                        value={color}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setColor(val);
                                        }}
                                        maxLength={7}
                                        className="w-full bg-midnight/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-content-strong uppercase focus:border-electric-cyan/50 transition-all"
                                        placeholder="#00F0C8"
                                    />
                                </div>
                                {/* Quick Presets */}
                                <div className="hidden sm:flex items-center gap-1.5">
                                    {["#00F0C8", "#7B61FF", "#E34A95", "#6B8AFD", "#00C1B3"].map(
                                        (preset) => (
                                            <button
                                                key={preset}
                                                onClick={() => setColor(preset)}
                                                className={cn(
                                                    "h-6 w-6 rounded-lg border transition-all hover:scale-125",
                                                    color === preset
                                                        ? "border-white/40 scale-110"
                                                        : "border-transparent opacity-60"
                                                )}
                                                style={{ backgroundColor: preset }}
                                                title={preset}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.section>

                    {/* ════════════════════════════════════════════════ */}
                    {/* Section 2: Brain Config                         */}
                    {/* ════════════════════════════════════════════════ */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="p-6 sm:p-8 rounded-2xl bg-surface/60 border border-white/5 backdrop-blur-sm space-y-6"
                    >
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-electric-cyan" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Configuración Cerebral
                            </h2>
                        </div>

                        {/* System Prompt */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono block ml-1 opacity-60">
                                System Prompt
                            </label>
                            <textarea
                                value={systemPrompt}
                                onChange={(e) => setSystemPrompt(e.target.value)}
                                rows={10}
                                placeholder="Eres un asistente experto en..."
                                className="w-full bg-midnight/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-content-strong font-mono leading-relaxed focus:border-electric-cyan/50 focus:ring-1 focus:ring-electric-cyan/20 transition-all resize-y min-h-[160px] placeholder:text-content-quiet"
                            />
                            <p className="text-[10px] text-content-quiet ml-1">
                                {systemPrompt.length} caracteres
                            </p>
                        </div>

                        {/* Temperature Slider */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono ml-1 opacity-60 flex items-center gap-1.5">
                                    <Thermometer className="h-3 w-3" />
                                    Temperatura
                                </label>
                                <span
                                    className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg border"
                                    style={{
                                        color: color,
                                        borderColor: `${color}30`,
                                        backgroundColor: `${color}10`,
                                    }}
                                >
                                    {temperature.toFixed(1)}
                                </span>
                            </div>
                            <div className="relative px-1">
                                <input
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-midnight/80 border border-white/5
                                        [&::-webkit-slider-thumb]:appearance-none
                                        [&::-webkit-slider-thumb]:h-5
                                        [&::-webkit-slider-thumb]:w-5
                                        [&::-webkit-slider-thumb]:rounded-full
                                        [&::-webkit-slider-thumb]:border-2
                                        [&::-webkit-slider-thumb]:border-white/20
                                        [&::-webkit-slider-thumb]:shadow-lg
                                        [&::-webkit-slider-thumb]:transition-transform
                                        [&::-webkit-slider-thumb]:hover:scale-125
                                        [&::-moz-range-thumb]:h-5
                                        [&::-moz-range-thumb]:w-5
                                        [&::-moz-range-thumb]:rounded-full
                                        [&::-moz-range-thumb]:border-2
                                        [&::-moz-range-thumb]:border-white/20
                                        [&::-moz-range-thumb]:shadow-lg"
                                    style={{
                                        // @ts-expect-error -- CSS custom property for thumb color
                                        "--thumb-color": color,
                                    }}
                                    ref={(el) => {
                                        if (el) {
                                            el.style.setProperty(
                                                "background",
                                                `linear-gradient(to right, ${color}60 0%, ${color}60 ${(temperature / 2) * 100}%, rgba(255,255,255,0.05) ${(temperature / 2) * 100}%, rgba(255,255,255,0.05) 100%)`
                                            );
                                            // Set thumb color via stylesheet trick
                                            el.style.setProperty("--tw-thumb", color);
                                        }
                                    }}
                                />
                                <div className="flex justify-between mt-1.5 px-0.5">
                                    <span className="text-[9px] text-content-quiet font-mono">
                                        0.0 Preciso
                                    </span>
                                    <span className="text-[9px] text-content-quiet font-mono">
                                        1.0 Balanceado
                                    </span>
                                    <span className="text-[9px] text-content-quiet font-mono">
                                        2.0 Creativo
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Model Selector */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-content-muted uppercase tracking-widest font-mono block ml-1 opacity-60 flex items-center gap-1.5">
                                <Cpu className="h-3 w-3" />
                                Modelo
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ALLOWED_MODELS.map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setModel(m)}
                                        className={cn(
                                            "px-4 py-3 rounded-xl border text-sm font-mono transition-all text-left",
                                            model === m
                                                ? "border-electric-cyan/40 bg-electric-cyan/10 text-electric-cyan"
                                                : "border-white/5 bg-midnight/50 text-content-muted hover:border-white/10 hover:text-content-strong"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={cn(
                                                    "h-2 w-2 rounded-full transition-colors",
                                                    model === m
                                                        ? "bg-electric-cyan"
                                                        : "bg-content-muted"
                                                )}
                                            />
                                            <span className="truncate">{m}</span>
                                        </div>
                                        <p className="text-[10px] mt-1 opacity-50 ml-4">
                                            {m === "deepseek-v4-pro"
                                                ? "Razonamiento máximo (recomendado)"
                                                : "Rápido y económico"}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.section>

                    {/* ════════════════════════════════════════════════ */}
                    {/* Section 3: Knowledge Base                       */}
                    {/* ════════════════════════════════════════════════ */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="rounded-2xl bg-surface/60 border border-white/5 backdrop-blur-sm overflow-hidden"
                    >
                        <div className="flex items-center gap-2 px-6 sm:px-8 pt-6 sm:pt-8 pb-2">
                            <BookOpen className="h-4 w-4 text-luxury-purple" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Base de Conocimiento
                            </h2>
                        </div>
                        <div className="px-2 sm:px-4 pb-4">
                            <KnowledgeBasePanel agentId={agentId!} />
                        </div>
                    </motion.section>

                    {/* ════════════════════════════════════════════════ */}
                    {/* Section 4: Danger Zone                          */}
                    {/* ════════════════════════════════════════════════ */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="p-6 sm:p-8 rounded-2xl bg-red-500/5 border border-red-500/20 backdrop-blur-sm space-y-4"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <h2 className="text-red-400 text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Zona de Peligro
                            </h2>
                        </div>

                        <p className="text-xs text-content-quiet leading-relaxed">
                            Eliminar este agente es una acción irreversible. Se perderá toda la configuración,
                            el system prompt, la base de conocimiento y los datos asociados.
                        </p>

                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500 hover:text-white transition-all"
                        >
                            <Trash2 className="h-4 w-4" />
                            Eliminar Agente
                        </button>
                    </motion.section>
                </div>
            </div>

            {/* ── Toasts ────────────────────────────────────────────── */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            {/* ── Delete Confirmation Modal ──────────────────────── */}
            <AnimatePresence>
                {showDeleteModal && (
                    <DeleteConfirmationModal
                        agentName={name || "este agente"}
                        onConfirm={handleDelete}
                        onCancel={() => setShowDeleteModal(false)}
                        isDeleting={isDeleting}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
