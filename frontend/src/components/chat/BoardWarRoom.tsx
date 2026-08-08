import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Agent } from "@/types";
import type { BoardSessionState } from "@/store/useChatStore";
import { conMovimiento, CURVA, DURACION } from "@/lib/motion";
import { fasesDe } from "./agendaPhases";
import { BoardTable } from "./BoardTable";

/**
 * La cabecera de la junta: la Mesa (§8.1) y lo que la mesa no puede decir sola.
 *
 * Qué cambió y por qué:
 *
 * - **Las placas y el orden del día se han ido de aquí.** Las primeras a
 *   `BoardTable`, que es el Palco de §8.1; el segundo al Canto de §8.4, porque
 *   la barra de fases que vivía aquí era `hidden sm:flex` — o sea que **a 390px
 *   el orden del día desaparecía entero**, justo en el ancho que §4.3 declara
 *   caso base.
 * - **Ya no se anima el alto.** La banda entraba con `height: 0 → auto`, que
 *   §7.4 prohíbe por su nombre. Entra con opacidad y 6px de recorrido, que se
 *   componen.
 * - **Ya no hay resplandor en bucle** bajo el que habla. El pulso vive ahora en
 *   el punto de 4px de la placa, que es el único bucle que §8.11 presupuesta
 *   para esta superficie.
 *
 * Lo que sí se queda: el recuento, el coste y la región viva. La mesa dice
 * quién y cuánto; esto dice en qué ha quedado.
 */
export function BoardWarRoom({
    board,
    agents,
    intervencionPorRol,
}: {
    board: BoardSessionState;
    agents: Agent[];
    intervencionPorRol?: Record<string, string>;
}) {
    const reducido = useReducedMotion();
    const fases = fasesDe(board);
    const faseActual = fases.find((f) => f.clave === board.phase);

    const tallyText = (() => {
        if (!board.tally) return null;
        const { SI = 0, NO = 0, CONDICIONAL = 0 } = board.tally;
        const parts = [SI && `${SI} a favor`, NO && `${NO} en contra`, CONDICIONAL && `${CONDICIONAL} condicional`].filter(Boolean);
        return parts.length ? `La junta votó ${parts.join(" · ")}` : null;
    })();

    return (
        <motion.div
            initial={reducido ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={conMovimiento(reducido, { duration: DURACION.reveal, ease: CURVA.settle })}
            className="border-b border-stroke-hairline bg-surface-1 z-10"
        >
            <div className="max-w-5xl mx-auto px-4 py-2 sm:px-6">
                <BoardTable board={board} agents={agents} intervencionPorRol={intervencionPorRol} />

                {/* Consenso / coste.
                    3.7 · §4.3 — el recuento NO se trunca. A 390px disponía de
                    266px para 426 y salía «La junta votó 2 a favor · 1 en c…»:
                    o sea que la línea que dice EN QUÉ HA QUEDADO la junta —el
                    entregable del producto— se cortaba justo en el disenso.
                    Medido en el navegador. Ahora envuelve en dos líneas: el
                    contenedor pasa a `flex-wrap`, el recuento suelta el
                    `truncate` y el coste se va al final con `ml-auto`. El alto
                    mínimo deja de ser fijo por lo mismo. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mt-2 min-h-[14px]">
                    <AnimatePresence>
                        {tallyText && (
                            <motion.span
                                initial={reducido ? false : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={conMovimiento(reducido, { duration: DURACION.pop, ease: CURVA.settle })}
                                className="text-micro text-accent font-mono min-w-0 [text-wrap:pretty]"
                                aria-hidden="true"
                            >
                                {tallyText}
                                {board.earlyExit && " — consenso, debate abreviado"}
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <span className="text-micro font-mono text-content-muted uppercase ml-auto shrink-0 tnum">
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
                        ? `${tallyText}${board.earlyExit ? ' — consenso, debate abreviado' : ''}. Fase: ${faseActual?.etiqueta ?? 'en curso'}.`
                        : ''}
                </p>
            </div>
        </motion.div>
    );
}
