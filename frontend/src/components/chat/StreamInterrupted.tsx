/**
 * El aviso de turno cortado, DENTRO del hilo.
 *
 * El momento más frágil del producto es un debate que se corta a medias. Hasta
 * ahora eso se contaba con un aviso flotante que se va solo, o con nada: la
 * burbuja se quedaba a medias y el usuario no sabía si el director seguía
 * pensando. Esto vive donde está la mirada —justo debajo del turno roto—, no se
 * va solo, y trae la acción.
 *
 * §11, las tres cosas que pide un error: qué pasó («se cortó»), qué se conserva
 * («lo escrito sigue aquí», y de verdad: el contenido no se toca) y qué hacer
 * («Reintentar el turno»).
 */
import { RotateCcw, Unplug } from 'lucide-react';

interface StreamInterruptedProps {
    /** Reintenta el turno cortado. Ausente si no se sabe qué reenviar. */
    onRetry?: () => void;
    /** Sin red no se reintenta: se dice antes de que el botón falle otra vez. */
    offline?: boolean;
}

export function StreamInterrupted({ onRetry, offline }: StreamInterruptedProps) {
    return (
        <div
            role="alert"
            data-testid="stream-interrumpido"
            className="ms-0 sm:ms-14 flex flex-col gap-2 rounded-sm border border-oxblood-500 border-s-[3px] bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
            <div className="flex items-start gap-2.5 min-w-0">
                <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-sm font-[550] text-content-strong">
                        El turno se cortó antes de terminar
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-content-muted">
                        {offline
                            ? 'No hay conexión. Lo escrito hasta aquí sigue en el hilo; reintenta cuando vuelva la red.'
                            : 'Lo escrito hasta aquí sigue en el hilo y no se ha cobrado el turno de nuevo.'}
                    </p>
                </div>
            </div>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={offline}
                    className="flex shrink-0 items-center justify-center gap-2 self-start rounded-sm border border-brass-600 px-3 py-2 text-xs font-[550] text-accent transition-colors hover:bg-accent/12 disabled:border-stroke-edge disabled:text-content-quiet sm:self-auto"
                >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reintentar el turno
                </button>
            )}
        </div>
    );
}
