/**
 * El error de una sección, con salida — DESIGN §11.
 *
 * Existe porque el patrón que había repetido en ocho pantallas era éste:
 *
 *     {error && <div className="…text-danger">{error}</div>}
 *
 * …donde `error` es un `String(e)` crudo. O sea: un recuadro rojo con
 * «Error: TypeError: Failed to fetch» y nada más. §11 lo prohíbe por escrito
 * («el error dice qué pasó, qué hacer y qué se conservó») y además deja al
 * usuario parado: no hay reintento, no se puede cerrar y no dice si ha perdido
 * algo.
 *
 * Este componente hace las tres cosas obligatorias y no deja escribir un error
 * sin ellas: el `title` dice QUÉ pasó, el `detail` QUÉ se conserva o qué hacer,
 * y `onRetry` es la salida. Si de verdad no hay reintento posible, el `detail`
 * tiene que decir qué hacer en su lugar.
 *
 * El motivo técnico (`reason`) es opcional y va en letra pequeña al final,
 * nunca en el título, y sólo cuando aporta —un código de estado, un límite de
 * tamaño—. Nunca un volcado de `error.message` del backend.
 */
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InlineErrorTone = 'error' | 'warning';

/**
 * El fallo de una sección, guardado en estado.
 *
 * Las pantallas de ajustes guardaban `useState<string | null>` y le metían un
 * `String(e)`. Guardar el fallo con esta forma obliga a escribir el «qué pasó»
 * y el «qué se conserva» EN EL SITIO donde se sabe qué se intentaba hacer, que
 * es lo único que evita el «Error: TypeError: Failed to fetch».
 */
export interface FalloDeSeccion {
    title: string;
    detail: string;
    onRetry?: () => void;
    retryLabel?: string;
    reason?: string;
    tone?: InlineErrorTone;
    onDismiss?: () => void;
}

interface InlineErrorProps {
    /** Qué pasó, en cristiano. Nunca «Error». */
    title: string;
    /** Qué se conserva y/o qué puede hacer el usuario. Obligatorio. */
    detail: string;
    /** La salida. Sin ella, `detail` tiene que decir qué hacer. */
    onRetry?: () => void;
    retryLabel?: string;
    /** Motivo técnico, sólo si es accionable. Va al final y en pequeño. */
    reason?: string;
    /**
     * `warning` para lo que no ha roto nada (un refresco de saldo que falla);
     * `error` para lo que sí (algo que no se ha guardado). §11 pide que no
     * suenen igual.
     */
    tone?: InlineErrorTone;
    /**
     * Descartar el aviso. Sólo donde el fallo NO bloquea nada: un cobro que no
     * ha salido se puede apartar; un panel que no carga, no.
     */
    onDismiss?: () => void;
    className?: string;
}

export function InlineError({
    title,
    detail,
    onRetry,
    retryLabel = 'Reintentar',
    reason,
    tone = 'error',
    onDismiss,
    className,
}: InlineErrorProps) {
    return (
        <div
            role="alert"
            data-testid="error-en-linea"
            className={cn(
                'flex items-start gap-3 rounded-sm border border-s-[3px] bg-surface-2 p-3',
                tone === 'error' ? 'border-stroke-edge border-s-danger' : 'border-stroke-edge border-s-warning',
                className,
            )}
        >
            <AlertTriangle
                className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'error' ? 'text-danger' : 'text-warning')}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-[550] text-content-strong">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{detail}</p>
                {reason && (
                    <p className="mt-1 text-micro text-content-quiet">{reason}</p>
                )}
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="mt-2 flex items-center gap-1.5 rounded-sm text-xs font-[550] text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
                    >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        {retryLabel}
                    </button>
                )}
            </div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={`Cerrar aviso: ${title}`}
                    className="-me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
