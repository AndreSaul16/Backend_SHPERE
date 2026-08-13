/**
 * Comparador de directores — PLAN §6 Q2 (tarea 5.9), DESIGN §P2.
 *
 * «El producto EXISTE para el desacuerdo, y hoy hay que hacer scroll arriba y
 * abajo para comparar lo que dijo el CFO con lo que dijo el CTO.» Esto pone las
 * dos intervenciones enfrentadas, con sus votos y sus confianzas en la cabecera
 * de cada columna.
 *
 * Una desviación consciente del enunciado, y el motivo: el plan dice «dos
 * casillas EN LAS PLACAS». Las placas son `role="tab"`, o sea `<button>`, y
 * meterles dentro una casilla es exactamente el anidamiento interactivo que
 * §12.8 prohíbe —«cero elementos interactivos dentro de elementos
 * interactivos»— y que la fase 1 vino a quitar de la barra lateral. La elección
 * de los dos directores vive aquí, en dos desplegables etiquetados: se maneja
 * con teclado, funciona a 390px, y `⇧C` sigue abriendo la comparación con dos
 * directores ya puestos, que es lo que el atajo promete.
 *
 * Se lee el hilo del store y no se recibe por props a propósito: quien monta
 * esto es la cabecera de la junta, que no tiene los mensajes, y pasárselos
 * obligaría a la cabecera a suscribirse al hilo entero —o sea a repintarse con
 * cada token del debate— para una ventana que casi siempre está cerrada.
 */
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SelectField } from '@/components/ui/Field';
import { ConfidenceNeedle } from './ConfidenceNeedle';
import { VoteChip } from './VoteChip';
import { citaLlana } from '@/utils/citaLlana';
import { colorDeAgente } from '@/lib/colorDeAgente';
import {
    AGENT_HEX,
    getBoardAgentByRole,
    useChatStore,
    useMensajesDeSesion,
    type BoardSessionState,
} from '@/store/useChatStore';
import type { Agent } from '@/types';

interface DirectorCompareProps {
    open: boolean;
    onClose: () => void;
    board: BoardSessionState;
    agents: Agent[];
}

/** Nombre corto para la cabecera: «Nexus (CTO)» → «Nexus». */
function nombreCorto(nombre: string | undefined, rol: string): string {
    if (!nombre) return rol;
    return nombre.replace(/\s*\([^)]*\)\s*$/, '').trim() || rol;
}

export function DirectorCompare({ open, onClose, board, agents }: DirectorCompareProps) {
    const currentSessionId = useChatStore((s) => s.currentSessionId);
    const mensajes = useMensajesDeSesion(currentSessionId);

    const roles = useMemo(() => {
        const lista = ['CEO', ...board.participants.filter((r) => r !== 'CEO')];
        if (board.devil && !lista.includes('DEVIL')) lista.push('DEVIL');
        return lista;
    }, [board.participants, board.devil]);

    const intervenciones = useMemo(() => {
        const porRol: Record<string, string[]> = {};
        for (const m of mensajes) {
            if (m.role === 'user' || m.role === 'system' || !m.content) continue;
            (porRol[m.role] ??= []).push(citaLlana(m.content, 600));
        }
        return porRol;
    }, [mensajes]);

    /* Preselección: los dos primeros que HABLARON y NO coinciden en el voto.
       Dos filtros, y los dos por lo mismo: comparar a quien no llegó a
       intervenir deja media ventana vacía, y comparar a dos que votaron igual
       es el caso menos interesante — abrir ahí obliga a cambiar los dos
       desplegables antes de ver nada útil. */
    const [porDefectoIzq, porDefectoDer] = useMemo(() => {
        const hablaron = roles.filter((r) => (intervenciones[r]?.length ?? 0) > 0);
        const conVoto = hablaron.filter((r) => board.votes[r]);
        for (const a of conVoto) {
            for (const b of conVoto) {
                if (a !== b && board.votes[a].decision !== board.votes[b].decision) return [a, b];
            }
        }
        const candidatos = hablaron.length >= 2 ? hablaron : roles;
        return [candidatos[0] ?? '', candidatos[1] ?? candidatos[0] ?? ''];
    }, [roles, board.votes, intervenciones]);

    const [izquierda, setIzquierda] = useState<string | null>(null);
    const [derecha, setDerecha] = useState<string | null>(null);
    const rolIzq = izquierda ?? porDefectoIzq;
    const rolDer = derecha ?? porDefectoDer;

    if (roles.length < 2) {
        return (
            <Modal open={open} onClose={onClose} title="Comparar directores" size="sm">
                <p className="text-sm text-content-muted">
                    Esta junta no tiene dos directores que enfrentar. Convoca un debate y
                    vuelve aquí cuando hayan intervenido.
                </p>
            </Modal>
        );
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Comparar directores"
            description="Lo que dijo cada uno, enfrentado, con su voto y su confianza."
            size="lg"
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Columna
                    lado="Izquierda"
                    rol={rolIzq}
                    roles={roles}
                    agents={agents}
                    board={board}
                    intervenciones={intervenciones[rolIzq] ?? []}
                    onCambiar={setIzquierda}
                />
                <Columna
                    lado="Derecha"
                    rol={rolDer}
                    roles={roles}
                    agents={agents}
                    board={board}
                    intervenciones={intervenciones[rolDer] ?? []}
                    onCambiar={setDerecha}
                />
            </div>
        </Modal>
    );
}

function Columna({
    lado,
    rol,
    roles,
    agents,
    board,
    intervenciones,
    onCambiar,
}: {
    lado: string;
    rol: string;
    roles: string[];
    agents: Agent[];
    board: BoardSessionState;
    intervenciones: string[];
    onCambiar: (rol: string) => void;
}) {
    const agente = getBoardAgentByRole(agents, rol);
    const hex = agente?.hexColor || AGENT_HEX.custom;
    const voto = board.votes[rol];

    return (
        <section
            aria-label={`Columna ${lado}: ${nombreCorto(agente?.name, rol)}`}
            className="flex min-w-0 flex-col rounded-sm border border-stroke-edge bg-surface-2"
        >
            <div className="border-b border-stroke-hairline p-3">
                <SelectField
                    label={`Director de la columna ${lado.toLowerCase()}`}
                    value={rol}
                    onChange={(e) => onCambiar(e.target.value)}
                >
                    {roles.map((r) => (
                        <option key={r} value={r}>
                            {nombreCorto(getBoardAgentByRole(agents, r)?.name, r)} · {r}
                        </option>
                    ))}
                </SelectField>

                {/* El voto y la confianza en la cabecera, que es lo que pide Q2:
                    sin ellos la comparación es sólo dos textos y se pierde en
                    qué quedó cada uno. */}
                <div className="mt-3 flex items-center justify-between gap-2">
                    <span
                        aria-hidden="true"
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: colorDeAgente(rol, hex) }}
                    />
                    {voto ? (
                        <>
                            <VoteChip decision={voto.decision} confidence={voto.confidence} />
                            <ConfidenceNeedle
                                valor={voto.confidence ?? 0}
                                etiqueta={nombreCorto(agente?.name, rol)}
                                tamano="asiento"
                                mostrarCifra
                                className="shrink-0"
                            />
                        </>
                    ) : (
                        <span className="flex-1 text-micro uppercase text-content-quiet">
                            Sin voto registrado
                        </span>
                    )}
                </div>
            </div>

            <div className="max-h-[40dvh] min-w-0 flex-1 space-y-3 overflow-y-auto p-3">
                {intervenciones.length === 0 ? (
                    <p className="text-xs text-content-muted">
                        Este director no llegó a intervenir en esta junta.
                    </p>
                ) : (
                    intervenciones.map((texto, i) => (
                        <blockquote
                            key={`${rol}-${i}`}
                            className="border-l-2 pl-3 text-sm leading-relaxed text-content"
                            style={{ borderColor: colorDeAgente(rol, hex) }}
                        >
                            {texto}
                        </blockquote>
                    ))
                )}
            </div>
        </section>
    );
}
