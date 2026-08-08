/**
 * Onboarding first-run: checklist de 4 pasos sobre el Welcome Screen.
 * El progreso se deriva de datos reales (sesiones de grupo, mensajes, agentes
 * custom, servicios conectados) — sin estado nuevo en backend. Al completar
 * todos llama a completeOnboarding() y deja de mostrarse.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Check, Users, MessagesSquare, Sparkles, Plug } from "lucide-react";
import { useChatStore } from "@/store/useChatStore";
import { profileService, integrationsService, serviceCredentialsService } from "@/services/api";
import { cn } from "@/lib/utils";

interface Props {
    onPrimaryAction: () => void; // abre el selector de agentes (paso 1)
}

export function OnboardingChecklist({ onPrimaryAction }: Props) {
    /* 4.6 · D20: tres campos, una suscripción global. */
    const sessions = useChatStore((s) => s.sessions);
    const customAgents = useChatStore((s) => s.customAgents);
    const messagesBySession = useChatStore((s) => s.messagesBySession);
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [hasConnection, setHasConnection] = useState(false);
    const completedRef = useState({ done: false })[0];

    // Cargar flag de perfil: si ya completó onboarding, no mostrar.
    useEffect(() => {
        let alive = true;
        profileService.getProfile()
            .then((p) => { if (alive && p.onboarding_completed) setDismissed(true); })
            .catch(() => { /* ignore */ })
            .finally(() => { if (alive) setLoaded(true); });
        return () => { alive = false; };
    }, []);

    // ¿Tiene alguna herramienta conectada? (OAuth o credencial de servicio).
    // Sin esto, el usuario descubre Settings → Connections solo cuando una
    // tool le falla en el chat.
    useEffect(() => {
        let alive = true;
        Promise.allSettled([integrationsService.list(), serviceCredentialsService.list()])
            .then(([oauth, creds]) => {
                if (!alive) return;
                const oauthConnected = oauth.status === "fulfilled" && oauth.value.connected.length > 0;
                const credConnected = creds.status === "fulfilled" && creds.value.services.some((s) => s.connected);
                setHasConnection(oauthConnected || credConnected);
            });
        return () => { alive = false; };
    }, []);

    const steps = useMemo(() => {
        const hasGroup = sessions.some((s) => s.type === "group");
        const hasMessage = Object.values(messagesBySession).some((msgs) =>
            msgs.some((m) => m.role === "user")
        );
        const hasCustom = customAgents.length > 0;
        return [
            { key: "group", label: "Convoca tu Junta Directiva", desc: "Crea un chat grupal con tus expertos", done: hasGroup, icon: Users },
            { key: "debate", label: "Lanza tu primer debate", desc: "Envía una decisión y deja que debatan", done: hasMessage, icon: MessagesSquare },
            { key: "custom", label: "Crea tu experto a medida", desc: "Un agente con tu conocimiento y tono", done: hasCustom, icon: Sparkles },
            { key: "connect", label: "Conecta tus herramientas", desc: "Calendar, WhatsApp, LinkedIn… para que actúen por ti", done: hasConnection, icon: Plug },
        ];
    }, [sessions, customAgents, messagesBySession, hasConnection]);

    const allDone = steps.every((s) => s.done);

    // Al completar los 3, marcar onboarding como completado (una vez).
    useEffect(() => {
        if (allDone && loaded && !dismissed && !completedRef.done) {
            completedRef.done = true;
            profileService.completeOnboarding().catch(() => { /* ignore */ });
        }
    }, [allDone, loaded, dismissed, completedRef]);

    if (dismissed || allDone) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full rounded-md bg-surface-1 border border-stroke-edge p-4 space-y-2.5 text-left"
        >
            <div className="flex items-center justify-between">
                <p className="text-micro font-mono uppercase text-electric-cyan">Primeros pasos</p>
                <span className="text-xs font-mono text-content-muted tabular-nums">
                    {steps.filter((s) => s.done).length}/{steps.length}
                </span>
            </div>
            {steps.map((step) => {
                const Icon = step.icon;
                return (
                    <button
                        key={step.key}
                        onClick={
                            step.done
                                ? undefined
                                : step.key === "connect"
                                    ? () => navigate("/settings/integrations")
                                    : onPrimaryAction
                        }
                        disabled={step.done}
                        className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left",
                            step.done
                                ? "border-success/20 bg-success/[0.04] cursor-default"
                                : "border-stroke-hairline hover:border-electric-cyan/30 hover:bg-stroke-highlight"
                        )}
                    >
                        <div className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                            step.done ? "bg-success/20 text-success" : "bg-stroke-highlight text-content-muted"
                        )}>
                            {step.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                            <p className={cn("text-xs font-semibold", step.done ? "text-content-muted line-through" : "text-content-strong")}>
                                {step.label}
                            </p>
                            <p className="text-xs text-content-muted truncate">{step.desc}</p>
                        </div>
                    </button>
                );
            })}
        </motion.div>
    );
}
