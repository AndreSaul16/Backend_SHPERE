/**
 * <ToastProvider> — DESIGN §9.5.
 *
 * «No existe hoy», dice §9.5, y por eso había 24 registros de consola que eran
 * fallos invisibles para el usuario. Esto es la mitad visible; la otra es
 * `lib/toastBus.ts`, para que también puedan avisar el store y los servicios.
 *
 * Reglas de §9.5 implementadas aquí, en el orden en que las enumera:
 *   e3 · --radius-sm · borde de inicio de 3px en el color semántico ·
 *   [glifo] [título sm/550] [detalle xs] [acción] [cerrar] · esquina inferior
 *   derecha en sm+, ancho completo abajo por debajo de sm · success 4s, info 6s,
 *   warning 8s, error no se cierra solo · pila máxima de 3 y «+N más» ·
 *   role="status" para info/success y role="alert" para warning/error ·
 *   auto-cierre en pausa mientras hay hover o foco dentro · SIEMPRE un botón de
 *   cierre.
 *
 * El bug de `ErrorOverlay.tsx:19` que §9.5 cita —`right-6` con `w-full`, que se
 * sale por la izquierda por debajo de ~448px— no se reproduce: aquí el ancho
 * completo y el anclaje a la derecha son estados excluyentes del breakpoint.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    TOAST_DURATION,
    TOAST_STACK_MAX,
    subscribeToasts,
    type ToastRecord,
    type ToastVariant,
} from '@/lib/toastBus';

const ICON = {
    success: CheckCircle2,
    info: Info,
    warning: AlertTriangle,
    error: AlertCircle,
} as const;

/** Borde de inicio de 3px en el color semántico + color del glifo. */
const ACCENT: Record<ToastVariant, string> = {
    success: 'border-s-success text-success',
    info: 'border-s-info text-info',
    warning: 'border-s-warning text-warning',
    error: 'border-s-danger text-danger',
};

interface ToastItemProps {
    toast: ToastRecord;
    onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [paused, setPaused] = useState(false);
    const duration = TOAST_DURATION[toast.variant];
    const remaining = useRef(duration ?? 0);
    const Icon = ICON[toast.variant];
    const assertive = toast.variant === 'warning' || toast.variant === 'error';

    useEffect(() => {
        if (duration == null || paused) return;
        const startedAt = Date.now();
        const timer = setTimeout(() => onDismiss(toast.id), remaining.current);
        return () => {
            clearTimeout(timer);
            // Lo que quedaba cuando el ratón entró: al salir se retoma, no se
            // reinicia. Si se reiniciase, pasar el ratón por encima daría un
            // aviso eterno.
            remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
        };
    }, [duration, paused, toast.id, onDismiss]);

    return (
        <motion.li
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            // El role va en el aviso, como pide §9.5. `status` implica
            // aria-live="polite" y `alert` implica "assertive": un fallo
            // interrumpe, un éxito espera turno.
            role={assertive ? 'alert' : 'status'}
            aria-live={assertive ? 'assertive' : 'polite'}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className={cn(
                // e3 (§5): baize-800, filete edge + filete negro por fuera,
                // sombra e3. El doble trazo es lo que lo despega sin blur.
                'pointer-events-auto flex w-full items-start gap-3 rounded-sm',
                'border border-stroke-edge border-s-[3px] bg-surface-3 p-3',
                'shadow-e3 ring-1 ring-black/40',
                ACCENT[toast.variant],
            )}
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-[550] text-content-strong">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 text-xs text-content-muted">{toast.detail}</p>}
                {toast.action && (
                    <button
                        type="button"
                        onClick={() => {
                            toast.action?.onClick();
                            onDismiss(toast.id);
                        }}
                        className="mt-2 rounded-sm text-xs font-[550] text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`Cerrar aviso: ${toast.title}`}
                className="-me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong"
            >
                <X className="h-4 w-4" aria-hidden="true" />
            </button>
        </motion.li>
    );
}

export function ToastProvider({ children }: { children?: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);

    useEffect(
        () =>
            subscribeToasts((incoming) => {
                setToasts((prev) => {
                    const next = incoming.dedupeKey
                        ? prev.filter((t) => t.dedupeKey !== incoming.dedupeKey)
                        : prev;
                    return [...next, incoming];
                });
            }),
        [],
    );

    const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

    // §9.5: se ven los 3 últimos; los anteriores se cuentan.
    const visible = toasts.slice(-TOAST_STACK_MAX);
    const hidden = toasts.length - visible.length;

    return (
        <>
            {children}
            {/* El contenedor está SIEMPRE en el DOM: un `aria-live` que se monta
                al mismo tiempo que su contenido no se anuncia en varios
                lectores, porque no había región que observar. */}
            <div
                className={cn(
                    'pointer-events-none fixed z-[200] flex flex-col gap-2',
                    // Ancho completo abajo por debajo de sm; esquina inferior
                    // derecha en sm+.
                    'inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                    'sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-[380px] sm:p-0',
                )}
            >
                {hidden > 0 && (
                    <p className="pointer-events-auto self-end rounded-sm border border-stroke-edge bg-surface-3 px-2 py-1 text-micro uppercase text-content-muted shadow-e3">
                        {`+${hidden} más`}
                    </p>
                )}
                <ul className="flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                        {visible.map((t) => (
                            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                        ))}
                    </AnimatePresence>
                </ul>
            </div>
        </>
    );
}
