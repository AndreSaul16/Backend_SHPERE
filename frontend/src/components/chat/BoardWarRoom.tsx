import { useCallback, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Columns2 } from "lucide-react";
import type { Agent } from "@/types";
import type { BoardSessionState } from "@/store/useChatStore";
import { conMovimiento, CURVA, DURACION } from "@/lib/motion";
import { fasesDe } from "./agendaPhases";
import { BoardTable } from "./BoardTable";
import { DisagreementBar } from "./DisagreementBar";
import { gradoDeDesacuerdo } from "./desacuerdo";
import { DirectorCompare } from "./DirectorCompare";
import { comboDe, useAtajo } from "@/hooks/useShortcuts";

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

    /* 5.9 · Q2 — el comparador. Vive aquí porque aquí está la mesa: el atajo
       sólo existe donde hay una junta con debate, y en `/settings` pulsar ⇧C no
       puede abrir una ventana sobre datos que no hay. */
    const [comparando, setComparando] = useState(false);
    useAtajo(comboDe('comparar'), useCallback(() => setComparando(true), []));

    const fases = fasesDe(board);
    const faseActual = fases.find((f) => f.clave === board.phase);

    // Q8: el veredicto también se anuncia. Quien no ve la barra tiene que
    // recibir la lectura, no sólo la aritmética.
    const veredicto = gradoDeDesacuerdo(board.votes);

    const tallyText = (() => {
        if (!board.tally) return null;
        const { SI = 0, NO = 0, CONDICIONAL = 0 } = board.tally;
        const parts = [SI && `${SI} a favor`, NO && `${NO} en contra`, CONDICIONAL && `${CONDICIONAL} condicional`].filter(Boolean);
        return parts.length ? `La junta votó ${parts.join(" · ")}` : null;
    })();

    // BVT-004 — un empate no es un consenso, y el recuento no puede dejar que
    // lo parezca: «1 a favor · 1 en contra · 1 condicional» a secas se lee como
    // si la junta hubiera decidido algo. Y el sufijo de consenso queda excluido
    // por construcción: si nadie ganó, no hubo con qué abreviar el debate.
    const hayEmpate = veredicto.etiqueta === 'Empate';
    const coletilla = hayEmpate
        ? " — Empate: la junta no decidió"
        : board.earlyExit
            ? " — consenso, debate abreviado"
            : "";

    /* CS-010 — el importe y su motivo, en el mismo sitio y a la vez.
       El motivo sale de `board.participants`, que es de donde sale el precio
       de verdad (`stream.py`: `cost = BOARD_REDUCED_COST if len(participants)
       <= 2 else BOARD_MEETING_COST`). NO del consenso: esa era la promesa que
       PRODUCT.md hacía y el producto no cumplía (CS-008). Un descuento sin
       motivo se lo explica el usuario solo, y se lo explicaba mal. */
    const directores = board.participants?.length ?? 0;
    const motivoDelCoste =
        directores > 0 && directores <= 2
            ? `junta reducida a ${directores} ${directores === 1 ? "director" : "directores"}`
            : null;

    return (
        <motion.div
            initial={reducido ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={conMovimiento(reducido, { duration: DURACION.reveal, ease: CURVA.settle })}
            className="border-b border-stroke-hairline bg-surface-1 z-10"
        >
            <DirectorCompare
                open={comparando}
                onClose={() => setComparando(false)}
                board={board}
                agents={agents}
            />
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
                {/* 5.5 · Q8 — el grado de desacuerdo, encima del recuento.
                    El recuento dice CUÁNTOS; esto dice QUÉ significa. Va
                    primero porque es lo que se quiere saber al abrir un debate
                    viejo, y porque §P2 pide que el conflicto se encuentre antes
                    que la conformidad. */}
                <DisagreementBar votes={board.votes} className="mt-2" />

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mt-2 min-h-[14px]">
                    <AnimatePresence>
                        {tallyText && (
                            <motion.span
                                initial={reducido ? false : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={conMovimiento(reducido, { duration: DURACION.pop, ease: CURVA.settle })}
                                className="text-micro text-brass-800 dark:text-accent font-mono min-w-0 [text-wrap:pretty]"
                                aria-hidden="true"
                            >
                                {tallyText}
                                {coletilla}
                            </motion.span>
                        )}
                    </AnimatePresence>
                    {/* 5.9 · Q2 — la puerta del comparador sin teclado. A 390px
                        no hay ⇧C que pulsar, y sin este botón la función no
                        existiría para la mayoría del tráfico. */}
                    <button
                        type="button"
                        onClick={() => setComparando(true)}
                        className="ml-auto flex shrink-0 items-center gap-1 rounded-xs border border-stroke-edge px-2 py-0.5 font-mono text-micro uppercase text-content-muted transition-colors duration-(--duration-tap) hover:border-brass-600 hover:text-content-strong"
                    >
                        <Columns2 className="h-3 w-3" aria-hidden="true" />
                        Comparar
                        <kbd className="ms-1 hidden text-content-quiet sm:inline">⇧C</kbd>
                    </button>
                    <span className="text-micro font-mono text-content-muted uppercase shrink-0 tnum">
                        {board.cost} créditos
                        {motivoDelCoste && (
                            <span className="ms-1 normal-case text-content-quiet">
                                ({motivoDelCoste})
                            </span>
                        )}
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
                        ? `${veredicto.nivel !== 'sin-datos' ? `${veredicto.etiqueta}. ` : ''}${tallyText}${coletilla}. Fase: ${faseActual?.etiqueta ?? 'en curso'}.${motivoDelCoste ? ` Coste: ${board.cost} créditos, ${motivoDelCoste}.` : ''}`
                        : ''}
                </p>
            </div>
        </motion.div>
    );
}
