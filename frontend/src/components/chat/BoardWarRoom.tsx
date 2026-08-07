import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import type { Agent } from "@/types";
import { getBoardAgentByRole, type BoardSessionState } from "@/store/useChatStore";
import { cn } from "@/lib/utils";

const PHASE_LABELS: { key: string; label: string }[] = [
    { key: "opening", label: "Apertura" },
    { key: "analysis", label: "Análisis" },
    { key: "rebuttal", label: "Réplicas" },
    { key: "synthesis", label: "Síntesis" },
];

const VOTE_GLYPH: Record<string, string> = { SI: "✓", NO: "✗", CONDICIONAL: "~" };

/**
 * Cabecera "war-room" del Board V2: muestra los directores en sesión con su estado
 * vivo (anillo pulsante de quien habla, check + voto de quien terminó) y la barra
 * de fases del debate. Solo se renderiza durante un debate activo.
 */
export function BoardWarRoom({ board, agents }: { board: BoardSessionState; agents: Agent[] }) {
    // Roles a mostrar: CEO siempre + participantes + DEVIL si aplica.
    const roles = ["CEO", ...board.participants.filter((r) => r !== "CEO")];
    if (board.devil) roles.push("DEVIL");

    const phaseIndex = PHASE_LABELS.findIndex((p) => p.key === board.phase);

    const tallyText = (() => {
        if (!board.tally) return null;
        const { SI = 0, NO = 0, CONDICIONAL = 0 } = board.tally;
        const parts = [SI && `${SI} a favor`, NO && `${NO} en contra`, CONDICIONAL && `${CONDICIONAL} condicional`].filter(Boolean);
        return parts.length ? `La junta votó ${parts.join(" · ")}` : null;
    })();

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/5 bg-midnight/50 backdrop-blur-xl overflow-hidden z-10"
        >
            <div className="max-w-4xl mx-auto px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Avatares de los directores en sesión */}
                    <div className="flex items-center gap-3">
                        {roles.map((role) => {
                            const agent = getBoardAgentByRole(agents, role);
                            const status = board.statusByRole[role] || "idle";
                            const vote = board.votes[role];
                            const hex = agent?.hexColor || "#00F0C8";
                            return (
                                <div key={role} className="flex flex-col items-center gap-1 w-12">
                                    <div className="relative">
                                        <motion.div
                                            className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold border"
                                            style={{
                                                color: hex,
                                                borderColor: `${hex}40`,
                                                backgroundColor: `${hex}12`,
                                                opacity: status === "idle" ? 0.4 : 1,
                                            }}
                                            animate={
                                                status === "speaking"
                                                    ? { boxShadow: [`0 0 0px ${hex}00`, `0 0 14px ${hex}99`, `0 0 0px ${hex}00`] }
                                                    : { boxShadow: `0 0 0px ${hex}00` }
                                            }
                                            transition={status === "speaking" ? { repeat: Infinity, duration: 1.4 } : { duration: 0.3 }}
                                        >
                                            {agent?.avatar || role[0]}
                                        </motion.div>
                                        {status === "done" && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-midnight flex items-center justify-center"
                                            >
                                                <Check className="h-2 w-2 text-white" />
                                            </motion.div>
                                        )}
                                    </div>
                                    {vote ? (
                                        <span
                                            className="text-micro font-mono font-bold leading-none tabular-nums"
                                            style={{ color: hex }}
                                            title={`${vote.decision} · ${vote.confidence}%`}
                                        >
                                            {VOTE_GLYPH[vote.decision] || "·"} {vote.confidence}%
                                        </span>
                                    ) : (
                                        <span className="text-micro font-mono uppercase text-content-muted leading-none truncate w-full text-center">
                                            {status === "speaking" ? "hablando" : role}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Barra de fases */}
                    <div className="hidden sm:flex items-center gap-1.5 text-micro font-mono uppercase">
                        {PHASE_LABELS.map((p, i) => (
                            <div key={p.key} className="flex items-center gap-1.5">
                                <span
                                    className={cn(
                                        "transition-colors",
                                        i === phaseIndex ? "text-accent font-bold" : i < phaseIndex ? "text-content-muted" : "text-content-quiet"
                                    )}
                                >
                                    {p.label}
                                </span>
                                {i < PHASE_LABELS.length - 1 && <span className="text-content-quiet" aria-hidden="true">▸</span>}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Consenso / coste */}
                <div className="flex items-center justify-between mt-2 min-h-[14px]">
                    <AnimatePresence>
                        {tallyText && (
                            <motion.span
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-micro text-accent font-mono"
                                aria-hidden="true"
                            >
                                {tallyText}
                                {board.earlyExit && " — consenso, debate abreviado"}
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <span className="text-micro font-mono text-content-muted uppercase ml-auto">
                        {board.cost} créditos
                    </span>
                </div>

                {/* §12.6: el recuento cambia solo, según van votando los
                    directores, así que se anuncia. `aria-atomic` para que se lea
                    la frase entera y no el número que acaba de cambiar; el
                    equivalente visual ya está arriba, por eso esto es `sr-only`.
                    La región está SIEMPRE en el DOM aunque el recuento aún no
                    exista: varios lectores no anuncian una región que aparece a
                    la vez que su contenido. */}
                <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-tally">
                    {tallyText
                        ? `${tallyText}${board.earlyExit ? ' — consenso, debate abreviado' : ''}. Fase: ${PHASE_LABELS[phaseIndex]?.label ?? 'en curso'}.`
                        : ''}
                </p>
            </div>
        </motion.div>
    );
}
