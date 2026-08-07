import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import type { Agent } from "@/types";
import { AGENT_HEX, getBoardAgentByRole, type BoardSessionState } from "@/store/useChatStore";
import { cn } from "@/lib/utils";

/**
 * D34 — las CINCO fases de `BoardPhase`, en el orden del grafo del backend
 * (`board_v2.py`: opening → analysis → rebuttal → devil → synthesis).
 *
 * `devil` faltaba aquí. Como la barra se pinta comparando contra
 * `findIndex(p.key === board.phase)`, mientras hablaba el Abogado del Diablo el
 * índice era -1 y NINGUNA fase quedaba marcada como pasada ni como actual: las
 * cinco se pintaban en `text-content-quiet`, o sea todas futuras, justo en el
 * momento más tenso del debate. Y la región viva anunciaba «Fase: en curso».
 */
const ALL_PHASES: { key: string; label: string }[] = [
    { key: "opening", label: "Apertura" },
    { key: "analysis", label: "Análisis" },
    { key: "rebuttal", label: "Réplicas" },
    { key: "devil", label: "Objeción" },
    { key: "synthesis", label: "Síntesis" },
];

/**
 * El asiento del Abogado del Diablo es opcional (`board_devil` en el backend),
 * así que su fase sólo entra en la barra cuando va a ocurrir de verdad: o
 * porque la junta lo lleva sentado, o porque ya está hablando. Anunciar una
 * fase que nunca llegará sería mentir sobre el orden del día.
 */
function phasesFor(board: Pick<BoardSessionState, "devil" | "phase">) {
    const conDevil = board.devil || board.phase === "devil";
    return conDevil ? ALL_PHASES : ALL_PHASES.filter((p) => p.key !== "devil");
}

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

    const phases = phasesFor(board);
    const phaseIndex = phases.findIndex((p) => p.key === board.phase);

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
            className="border-b border-white/5 bg-surface-1 overflow-hidden z-10"
        >
            <div className="max-w-4xl mx-auto px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Avatares de los directores en sesión */}
                    <div className="flex items-center gap-3">
                        {roles.map((role) => {
                            const agent = getBoardAgentByRole(agents, role);
                            const status = board.statusByRole[role] || "idle";
                            const vote = board.votes[role];
                            const hex = agent?.hexColor || AGENT_HEX.custom;
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
                        {phases.map((p, i) => (
                            <div key={p.key} className="flex items-center gap-1.5">
                                <span
                                    className={cn(
                                        "transition-colors",
                                        i === phaseIndex ? "text-accent font-bold" : i < phaseIndex ? "text-content-muted" : "text-content-quiet"
                                    )}
                                >
                                    {p.label}
                                </span>
                                {i < phases.length - 1 && <span className="text-content-quiet" aria-hidden="true">▸</span>}
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
                        ? `${tallyText}${board.earlyExit ? ' — consenso, debate abreviado' : ''}. Fase: ${phases[phaseIndex]?.label ?? 'en curso'}.`
                        : ''}
                </p>
            </div>
        </motion.div>
    );
}
