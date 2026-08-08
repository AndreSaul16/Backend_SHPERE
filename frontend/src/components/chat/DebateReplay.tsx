/**
 * Replay del debate — PLAN §6 Q7 (tarea 5.10).
 *
 * Dos pájaros de un tiro, y por eso vale la pena:
 *
 * 1. **Un debate de junta tarda ~100 s en producción y el usuario se va.** Al
 *    volver se encuentra el resultado, no la deliberación, que es justo lo que
 *    hace distinto a este producto. El replay devuelve el espectáculo sin
 *    gastar créditos: los turnos aparecen en su orden y las agujas se mueven a
 *    medida que llegan los votos.
 * 2. **Es la junta de muestra que pedía `docs/BOARD_FRONTERA_Y_QA §5.4`.** Una
 *    cuenta nueva ve cómo es una junta antes de pagar la primera.
 *
 * Cómo está hecho, y por qué así:
 *
 * - **No hay estado nuevo del debate.** La mesa que se ve durante el replay se
 *   reconstruye con `rebuildBoardSession` sobre los turnos YA revelados, que es
 *   la misma función con la que el store reconstruye una junta del historial.
 *   Así las agujas, los votos y las fases del replay son los de verdad, no una
 *   imitación que puede divergir.
 * - **La duración de cada turno sale de su longitud**, no de un valor fijo: un
 *   turno de tres líneas y otro de veinte no tardan lo mismo en leerse, y con
 *   un tiempo constante el replay se lee como una presentación de diapositivas.
 * - **`prefers-reduced-motion` no apaga el replay**: apaga las transiciones. El
 *   replay es CONTENIDO que aparece, no decoración; quitarlo dejaría a esos
 *   usuarios sin la función. Lo que se quita es el movimiento de la mesa, que
 *   ya lo respeta cada componente por su cuenta.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MessageBubble } from './MessageBubble';
import { BoardWarRoom } from './BoardWarRoom';
import { rebuildBoardSession } from '@/store/chat/boardSession';
import { getBoardAgentByRole } from '@/store/useChatStore';
import { fasesDe } from './agendaPhases';
import { cn } from '@/lib/utils';
import type { Agent, Message } from '@/types';
import { VELOCIDADES, duracionDeTurno, type Velocidad } from './replayTiempos';

export function DebateReplay({
    open,
    onClose,
    mensajes,
    agentes,
    titulo,
}: {
    open: boolean;
    onClose: () => void;
    mensajes: Message[];
    agentes: Agent[];
    titulo: string;
}) {
    // Cuántos turnos se han revelado. Empieza en 1: la consulta del usuario ya
    // está en pantalla desde el principio, porque es el enunciado y sin él los
    // primeros veinte segundos de debate no se entienden.
    const [revelados, setRevelados] = useState(1);
    const [reproduciendo, setReproduciendo] = useState(true);
    const [velocidad, setVelocidad] = useState<Velocidad>(1);

    const total = mensajes.length;
    const acabado = revelados >= total;

    // Abrir es empezar de cero. Se hace al cambiar `open` durante el render y
    // no en un efecto: un `setState` síncrono dentro de un efecto es la cascada
    // de renders que el lint del proyecto marca.
    const [abiertoAntes, setAbiertoAntes] = useState(open);
    if (open !== abiertoAntes) {
        setAbiertoAntes(open);
        if (open) {
            setRevelados(1);
            setReproduciendo(true);
            setVelocidad(1);
        }
    }

    const visibles = useMemo(() => mensajes.slice(0, revelados), [mensajes, revelados]);

    /* La mesa del replay se reconstruye de los turnos revelados con la MISMA
       función que usa el store para una junta del historial. */
    const board = useMemo(() => rebuildBoardSession(visibles), [visibles]);

    useEffect(() => {
        if (!open || !reproduciendo || acabado) return;
        const siguiente = mensajes[revelados];
        const espera = duracionDeTurno(siguiente?.content ?? '', velocidad);
        const t = window.setTimeout(() => setRevelados((n) => n + 1), espera);
        return () => window.clearTimeout(t);
    }, [open, reproduciendo, acabado, revelados, velocidad, mensajes]);

    const reiniciar = useCallback(() => {
        setRevelados(1);
        setReproduciendo(true);
    }, []);

    // Progreso por fase (Q7: «barra de progreso por fase»). Sale de los turnos,
    // no de un reparto inventado: una fase con seis intervenciones ocupa más.
    const fases = useMemo(() => {
        const declaradas = fasesDe(board ?? { devil: false, phase: null });
        return declaradas.map((f) => {
            const dela = mensajes.filter((m) => m.phase === f.clave);
            const hechos = visibles.filter((m) => m.phase === f.clave).length;
            return { ...f, totalDeLaFase: dela.length, hechos };
        });
    }, [board, mensajes, visibles]);

    const faseViva = visibles[visibles.length - 1]?.phase ?? null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Reproducción · ${titulo}`}
            description="El debate como ocurrió, sin gastar créditos."
            size="lg"
            bodyClassName="p-0"
        >
            {board && (
                <BoardWarRoom board={board} agents={agentes} />
            )}

            {/* Mandos. Van ARRIBA y no al pie: en una hoja móvil el pie queda
                fuera de la vista en cuanto el debate crece, y unos mandos a los
                que hay que bajar no son mandos. */}
            <div
                className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-stroke-hairline bg-surface-3 px-4 py-2"
                data-testid="mandos-replay"
            >
                <button
                    type="button"
                    onClick={() => (acabado ? reiniciar() : setReproduciendo((v) => !v))}
                    aria-label={acabado ? 'Volver a empezar' : reproduciendo ? 'Pausar' : 'Reanudar'}
                    className="flex h-9 items-center gap-1.5 rounded-sm border border-stroke-control px-3 text-xs text-content hover:border-brass-600"
                >
                    {acabado ? (
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : reproduciendo ? (
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {acabado ? 'Repetir' : reproduciendo ? 'Pausa' : 'Seguir'}
                </button>

                <div
                    role="group"
                    aria-label="Velocidad de reproducción"
                    className="flex items-center gap-1"
                >
                    {VELOCIDADES.map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setVelocidad(v)}
                            aria-pressed={velocidad === v}
                            aria-label={`Velocidad ${v} por uno`}
                            className={cn(
                                'h-9 rounded-sm border px-2.5 font-mono text-micro uppercase transition-colors duration-(--duration-tap)',
                                velocidad === v
                                    ? 'border-brass-500 bg-accent/12 text-accent'
                                    : 'border-stroke-edge text-content-muted hover:border-brass-600',
                            )}
                        >
                            {v}×
                        </button>
                    ))}
                </div>

                <p className="ms-auto text-micro uppercase text-content-quiet tnum">
                    {revelados} de {total} turnos
                </p>
            </div>

            {/* Barra de progreso por fase. */}
            <div className="flex gap-1 px-4 py-2" aria-hidden="true">
                {fases.map((f) => (
                    <span
                        key={f.clave}
                        className={cn(
                            'h-1 flex-1 overflow-hidden rounded-xs bg-surface-inset',
                            f.clave === faseViva && 'ring-1 ring-brass-600',
                        )}
                        style={{ flexGrow: Math.max(1, f.totalDeLaFase) }}
                    >
                        <span
                            className="block h-full bg-accent-fill transition-[width] duration-(--duration-reveal) motion-reduce:transition-none"
                            style={{
                                width: `${f.totalDeLaFase === 0 ? 0 : (f.hechos / f.totalDeLaFase) * 100}%`,
                            }}
                        />
                    </span>
                ))}
            </div>
            {/* La misma información en palabras, que es la que se anuncia. */}
            <p className="sr-only" aria-live="polite" aria-atomic="true">
                {`Turno ${revelados} de ${total}${faseViva ? `. Fase: ${fases.find((f) => f.clave === faseViva)?.etiqueta ?? ''}` : ''}`}
            </p>

            <div className="space-y-6 px-4 py-4">
                {visibles.map((m, i) => (
                    <MessageBubble
                        key={m.id}
                        message={m}
                        agent={getBoardAgentByRole(agentes, m.role) ?? undefined}
                        agentColor={getBoardAgentByRole(agentes, m.role)?.hexColor}
                        isTyping={false}
                        isLast={i === visibles.length - 1}
                    />
                ))}
            </div>
        </Modal>
    );
}
