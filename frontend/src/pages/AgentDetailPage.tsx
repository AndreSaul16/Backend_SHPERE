import { useState, useEffect, useCallback } from "react";
import { AGENT_HEX } from '@/store/useChatStore';
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    Save,
    Brain,
    Palette,
    Thermometer,
    Cpu,
    Trash2,
    AlertTriangle,
    Loader2,
    BookOpen,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UnsavedGuardDialog } from "@/components/ui/UnsavedGuardDialog";
import { BarraDeGuardado } from "@/components/ui/BarraDeGuardado";
import { contarCambios } from "@/lib/cambiosSinGuardar";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { reasonOf, toast } from "@/lib/toastBus";
import { KnowledgeBasePanel } from "@/components/agents/KnowledgeBasePanel";
import { InlineError } from "@/components/ui/InlineError";
import { buttonClass } from "@/components/ui/buttonStyles";

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
// Main Page Component
// ---------------------------------------------------------------------------

export function AgentDetailPage() {
    const { agentId } = useParams<{ agentId: string }>();
    const navigate = useNavigate();

    // ── Loading / Error ──────────────────────────────────────────────────
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Los avisos van al <ToastProvider> de la raíz (§9.5). Esta página tenía su
    // propio sistema de toasts, con su propio contador, sus propios colores y sin
    // `role`/`aria-live`: nadie lo oía, y era el segundo sistema de avisos de la
    // app. Ahora hay uno.

    // ── Form State ───────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState(AGENT_HEX.custom);
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

    /* 6.5 — cuántos campos, no si los hay. `originalHash` ya era la referencia
       de «lo último que dijo el servidor»; contar contra ella no añade estado
       nuevo, sólo deja de tirar información que ya teníamos. */
    const cambiosPendientes = originalHash
        ? contarCambios(JSON.parse(originalHash), JSON.parse(computeHash()))
        : 0;

    /** Volver a lo guardado. Reversible: basta con volver a editar. */
    const descartarCambios = useCallback(() => {
        if (!originalHash) return;
        const o = JSON.parse(originalHash) as {
            name: string; description: string; color: string;
            systemPrompt: string; temperature: number; model: AllowedModel;
        };
        setName(o.name); setDescription(o.description); setColor(o.color);
        setSystemPrompt(o.systemPrompt); setTemperature(o.temperature); setModel(o.model);
    }, [originalHash]);

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
                setColor(data.identity?.color ?? AGENT_HEX.custom);
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
                        color: data.identity?.color ?? AGENT_HEX.custom,
                        systemPrompt: data.brain_config?.system_prompt ?? "",
                        temperature: data.brain_config?.temperature ?? 0.7,
                        model: ALLOWED_MODELS.includes(data.brain_config?.model as AllowedModel)
                            ? (data.brain_config.model as AllowedModel)
                            : "deepseek-v4-pro",
                    })
                );
            } catch (err: any) {
                // El motivo va al detalle, nunca de titular (§11). Antes ESTO
                // era todo el mensaje: «Error 500: Internal Server Error».
                if (!cancelled) setFetchError(err?.message ?? "");
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
            toast.success("Agente actualizado");
        } catch (err: any) {
            toast.error("No se pudo guardar el agente", reasonOf(err) ?? "Tus cambios siguen en el formulario.");
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
            toast.success("Agente eliminado");
            // Small delay so the user can see the toast
            setTimeout(() => navigate("/chat"), 400);
        } catch (err: any) {
            toast.error("No se pudo eliminar el agente", reasonOf(err) ?? "El agente sigue en tu lista.");
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
    if (fetchError !== null) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-midnight/40 px-4">
                <div className="w-full max-w-md space-y-3">
                    <InlineError
                        title="No se ha podido abrir este agente"
                        detail="Su configuración sigue guardada tal cual: esto es un fallo al traerla, no una pérdida."
                        reason={fetchError || undefined}
                        onRetry={() => window.location.reload()}
                        retryLabel="Volver a cargarlo"
                    />
                    {/* Dos salidas, no una: reintentar por si fue un tropiezo, y
                        volver al chat por si el agente ya no existe. */}
                    <button
                        onClick={() => navigate("/chat")}
                        className={buttonClass({ variant: "secondary", className: "w-full" })}
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
            {/* 5.15 · D63 — este formulario YA calculaba `isDirty` y sólo lo
                usaba para atenuar el botón de guardar: un clic en el rail se
                llevaba por delante un prompt de sistema reescrito entero. */}
            <UnsavedGuardDialog
                sucio={isDirty}
                objeto={name || "este director"}
                consecuencia="Se pierden el prompt, el modelo y los ajustes que has cambiado."
            />
            {/* ── Header ────────────────────────────────────────────── */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-surface-0 sticky top-0 z-10">
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
                                className="hidden sm:inline-flex px-2 py-0.5 rounded text-micro font-mono font-bold uppercase border"
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
                        className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-6"
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
                                className="h-20 w-20 sm:h-24 sm:w-24 rounded-md flex items-center justify-center text-3xl sm:text-4xl font-bold border-2 shadow-2xl transition-all duration-500"
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
                        <TextField
                            label="Nombre"
                            id="agent-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Nexus, Oberon..."
                        />

                        {/* Description */}
                        <TextAreaField
                            label="Descripción"
                            id="agent-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            placeholder="Breve descripción del propósito del agente..."
                            controlClassName="resize-none"
                        />

                        {/* Color Picker */}
                        <div className="space-y-1.5">
                            <label htmlFor="agent-color" className="text-micro text-content-muted uppercase font-mono block ml-1">
                                Color de identidad
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <input
                                        id="agent-color"
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
                                    <Palette className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" aria-hidden="true" />
                                    <input
                                        id="agent-color-hex"
                                        aria-label="Color de identidad en hexadecimal"
                                        type="text"
                                        value={color}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) setColor(val);
                                        }}
                                        maxLength={7}
                                        className="w-full bg-midnight/50 border border-stroke-hairline rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-content-strong uppercase focus:border-electric-cyan/50 transition-all"
                                        placeholder={AGENT_HEX.custom}
                                    />
                                </div>
                                {/* Quick Presets */}
                                <div className="hidden sm:flex items-center gap-1.5">
                                    {[AGENT_HEX.custom, AGENT_HEX.CEO, AGENT_HEX.CMO, AGENT_HEX.CFO, AGENT_HEX.CTO].map(
                                        (preset) => (
                                            <button
                                                key={preset}
                                                onClick={() => setColor(preset)}
                                                className={cn(
                                                    "h-6 w-6 rounded-lg border transition-all hover:scale-125",
                                                    color === preset
                                                        ? "border-stroke-control scale-110"
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
                        className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-6"
                    >
                        <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-electric-cyan" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Configuración Cerebral
                            </h2>
                        </div>

                        {/* System Prompt */}
                        {/* El recuento va como `hint`, o sea ligado con
                            aria-describedby: antes era un <p> suelto que el
                            lector de pantalla no asociaba a nada. */}
                        <TextAreaField
                            label="System Prompt"
                            id="agent-system-prompt"
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            rows={10}
                            placeholder="Eres un asistente experto en..."
                            hint={`${systemPrompt.length} caracteres`}
                            controlClassName="font-mono leading-relaxed resize-y min-h-[160px]"
                        />

                        {/* Temperature Slider */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label htmlFor="agent-temperature" className="text-micro text-content-muted uppercase font-mono ml-1 flex items-center gap-1.5">
                                    <Thermometer className="h-3 w-3" aria-hidden="true" />
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
                                    id="agent-temperature"
                                    type="range"
                                    min={0}
                                    max={2}
                                    step={0.1}
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    aria-valuetext={`${temperature.toFixed(1)} de 2`}
                                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-midnight/80 border border-stroke-hairline
                                        [&::-webkit-slider-thumb]:appearance-none
                                        [&::-webkit-slider-thumb]:h-5
                                        [&::-webkit-slider-thumb]:w-5
                                        [&::-webkit-slider-thumb]:rounded-full
                                        [&::-webkit-slider-thumb]:border-2
                                        [&::-webkit-slider-thumb]:border-stroke-control
                                        [&::-webkit-slider-thumb]:shadow-lg
                                        [&::-webkit-slider-thumb]:transition-transform
                                        [&::-webkit-slider-thumb]:hover:scale-125
                                        [&::-moz-range-thumb]:h-5
                                        [&::-moz-range-thumb]:w-5
                                        [&::-moz-range-thumb]:rounded-full
                                        [&::-moz-range-thumb]:border-2
                                        [&::-moz-range-thumb]:border-stroke-control
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
                                    <span className="text-micro text-content-quiet">
                                        0.0 Preciso
                                    </span>
                                    <span className="text-micro text-content-quiet">
                                        1.0 Balanceado
                                    </span>
                                    <span className="text-micro text-content-quiet">
                                        2.0 Creativo
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Model Selector */}
                        <div className="space-y-1.5">
                            <span id="agent-model-label" className="text-micro text-content-muted uppercase font-mono ml-1 flex items-center gap-1.5">
                                <Cpu className="h-3 w-3" aria-hidden="true" />
                                Modelo
                            </span>
                            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="agent-model-label">
                                {ALLOWED_MODELS.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setModel(m)}
                                        aria-pressed={model === m}
                                        className={cn(
                                            "px-4 py-3 rounded-xl border text-sm font-mono transition-all text-left",
                                            model === m
                                                ? "border-electric-cyan/40 bg-electric-cyan/10 text-electric-cyan"
                                                : "border-stroke-hairline bg-midnight/50 text-content-muted hover:border-stroke-edge hover:text-content-strong"
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
                                        <p className="text-xs mt-1 opacity-50 ml-4">
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
                        className="rounded-md bg-surface-2 border border-stroke-edge overflow-hidden"
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
                        className="p-6 sm:p-8 rounded-md bg-oxblood-500/12 border border-oxblood-500 space-y-4"
                    >
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-danger" />
                            <h2 className="text-danger text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Zona de Peligro
                            </h2>
                        </div>

                        <p className="text-xs text-content-quiet leading-relaxed">
                            Eliminar este agente es una acción irreversible. Se perderá toda la configuración,
                            el system prompt, la base de conocimiento y los datos asociados.
                        </p>

                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-oxblood-500/10 border border-oxblood-500/30 rounded-xl text-sm font-medium text-danger hover:bg-oxblood-500 hover:text-content-strong transition-all"
                        >
                            <Trash2 className="h-4 w-4" />
                            Eliminar Agente
                        </button>
                    </motion.section>
                    {/* 6.5 · La barra adherida. El botón de guardar de la
                        cabecera se queda —es donde la mano lo busca al llegar—
                        pero este formulario mide dos pantallas y media: quien
                        acaba de reescribir el prompt de sistema está al final,
                        no arriba, y hasta hoy tenía que subir. */}
                    <BarraDeGuardado
                        cambios={cambiosPendientes}
                        guardando={isSaving}
                        onGuardar={() => { void handleSave(); }}
                        onDescartar={descartarCambios}
                        objeto={name || "este director"}
                    />
                </div>
            </div>

            {/* ── Confirmación de borrado (§9.4 / §11) ─────────────── */}
            <ConfirmDialog
                open={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                question="¿Eliminar el agente"
                objectName={name || "este agente"}
                consequence="Se pierden su configuración, su base de conocimiento y sus datos asociados. No se puede deshacer."
                confirmLabel="Eliminar definitivamente"
                confirmLoadingLabel="Eliminando"
                loading={isDeleting}
            />
        </div>
    );
}
