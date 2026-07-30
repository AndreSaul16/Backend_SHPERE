/**
 * <Modal> — DESIGN §9.4. Un solo primitivo, y todos los diálogos lo usan.
 *
 * El punto de partida eran cuatro modales hechos a mano (`AgentSelectorModal`,
 * `AgentCreationWizard`, `BoardActivationModal`, `PaywallModal`) más tres
 * diálogos de confirmación en línea, y **ninguno** tenía `role="dialog"`: para
 * un lector de pantalla no había diálogo, sólo texto que aparecía en medio de
 * la página, con el foco todavía en el botón de la página de detrás.
 *
 * Contrato obligatorio de §9.4, punto por punto y todos implementados aquí:
 *   role="dialog" · aria-modal="true" · aria-labelledby al título · trampa de
 *   foco · foco inicial en el primer control (NO en el cierre) · Escape cierra ·
 *   foco restaurado al disparador · scroll del fondo bloqueado · clic en el
 *   velo cierra sólo si no es destructivo · botón de cierre con aria-label y
 *   área táctil ≥ 44×44px.
 *
 * Decisiones que no se ven en el código:
 *
 * - El `keydown` va en `document`, no en el panel. Si va en el panel, `Escape`
 *   deja de funcionar en cuanto el foco cae en el velo o en el `<body>` (pasa
 *   al cerrar un `<select>` nativo), y ese es justo el momento en el que el
 *   usuario pulsa `Escape`.
 * - El velo es `aria-hidden` y su `onClick` no lleva `onKeyDown`: el camino de
 *   teclado equivalente no es «pulsar el velo», es `Escape` y el botón de
 *   cierre, que es lo que dice el patrón de diálogo modal de la APG. Un velo
 *   enfocable metería una parada de tabulación sin nombre ni papel.
 * - La restauración del foco se hace en la limpieza del efecto de apertura, no
 *   en `onClose`: así también vuelve cuando el modal se cierra por una razón
 *   que no pasa por `onClose` (navegación, desmontaje del padre).
 */
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    type ReactNode,
    type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ancho máximo por tamaño (§9.4): sm 420px, md 560px, lg 760px. */
const SIZE_CLASS = {
    sm: 'sm:max-w-[420px]',
    md: 'sm:max-w-[560px]',
    lg: 'sm:max-w-[760px]',
} as const;

export type ModalSize = keyof typeof SIZE_CLASS;

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    /** Va al `<h2>` que `aria-labelledby` referencia. Obligatorio. */
    title: ReactNode;
    /** Subtítulo. Si se pasa, queda ligado con `aria-describedby`. */
    description?: ReactNode;
    size?: ModalSize;
    /**
     * §9.4: «clic en el velo cierra sólo si no es destructivo». Un diálogo que
     * puede perder trabajo del usuario pasa `false`.
     */
    dismissOnBackdrop?: boolean;
    /**
     * Dónde va el foco al abrir. Si no se pasa, al primer control enfocable
     * del cuerpo — nunca al botón de cierre.
     */
    initialFocusRef?: RefObject<HTMLElement | null>;
    /** Pie adherido con las acciones alineadas al final. */
    footer?: ReactNode;
    /** Oculta el botón de cierre. Sólo para diálogos que exigen una decisión. */
    hideCloseButton?: boolean;
    closeLabel?: string;
    /** Clases extra del panel. */
    className?: string;
    /** Clases extra del cuerpo con scroll. */
    bodyClassName?: string;
    children: ReactNode;
}

/**
 * Selector de lo enfocable. `[data-modal-close]` queda fuera a propósito para
 * el foco INICIAL (§9.4), pero sigue dentro de la trampa de tabulación.
 */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Visibilidad SIN mirar el layout. La comprobación evidente —
 * `el.offsetParent !== null` — es una trampa doble: en jsdom `offsetParent` es
 * siempre `null`, así que la trampa de foco quedaría sin probar, y en el
 * navegador devuelve `null` también para cualquier elemento con
 * `position: fixed`, que es exactamente cómo se posiciona un modal. Se recorre
 * la cadena de ancestros mirando `display`, `visibility` y `[hidden]`, que es
 * lo que de verdad decide si un control se puede enfocar.
 */
function isVisible(el: HTMLElement, root: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node) {
        if (node.hasAttribute('hidden')) return false;
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (node === root) break;
        node = node.parentElement;
    }
    return true;
}

function focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute('aria-hidden') !== 'true' && isVisible(el, root),
    );
}

export function Modal({
    open,
    onClose,
    title,
    description,
    size = 'md',
    dismissOnBackdrop = true,
    initialFocusRef,
    footer,
    hideCloseButton,
    closeLabel = 'Cerrar',
    className,
    bodyClassName,
    children,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const autoId = useId();
    const titleId = `modal-title-${autoId}`;
    const descId = `modal-desc-${autoId}`;

    // ── Foco inicial, foco restaurado y scroll del fondo ──────────────────
    useEffect(() => {
        if (!open) return;

        const trigger = document.activeElement as HTMLElement | null;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        // Un frame de margen: con AnimatePresence el panel puede no estar
        // pintado en el mismo tick en el que `open` pasa a true.
        const focusInitial = () => {
            const panel = panelRef.current;
            if (!panel) return;
            if (initialFocusRef?.current) {
                initialFocusRef.current.focus();
                return;
            }
            const candidate = focusables(panel).find(
                (el) => !el.hasAttribute('data-modal-close'),
            );
            (candidate ?? panel).focus();
        };
        focusInitial();
        const raf = requestAnimationFrame(focusInitial);

        return () => {
            cancelAnimationFrame(raf);
            document.body.style.overflow = overflow;
            // §9.4: el foco vuelve al disparador. Sin esto el usuario de
            // teclado reaparece al principio del documento.
            if (trigger && document.contains(trigger)) trigger.focus();
        };
    }, [open, initialFocusRef]);

    // ── Escape y trampa de foco ───────────────────────────────────────────
    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;
            const panel = panelRef.current;
            if (!panel) return;
            const items = focusables(panel);
            if (items.length === 0) {
                e.preventDefault();
                panel.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;
            // Si el foco se ha escapado del panel (o está en el propio panel),
            // se recoloca en el extremo que toca según la dirección.
            if (!active || !panel.contains(active) || active === panel) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
                return;
            }
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        },
        [onClose],
    );

    useEffect(() => {
        if (!open) return;
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open, onKeyDown]);

    return (
        <AnimatePresence>
            {open && (
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
                    data-testid="modal-root"
                >
                    {/* Velo (§5): el único backdrop-filter autorizado, y son 3px. */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        aria-hidden="true"
                        data-testid="modal-backdrop"
                        onClick={dismissOnBackdrop ? onClose : undefined}
                        className="absolute inset-0 bg-baize-950/72 backdrop-blur-[3px]"
                    />

                    {/* Panel e4 (§5): baize-800, filete --stroke-control, sombra e4. */}
                    <motion.div
                        ref={panelRef}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={description ? descId : undefined}
                        initial={{ opacity: 0, scale: 0.98, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                            'relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden',
                            'rounded-t-lg sm:rounded-lg',
                            'border border-stroke-control bg-surface-3 shadow-e4',
                            'focus-visible:outline-none',
                            SIZE_CLASS[size],
                            className,
                        )}
                    >
                        {/* Cabecera adherida */}
                        <div className="sticky top-0 flex items-start gap-4 border-b border-stroke-hairline bg-surface-3 px-5 py-4">
                            <div className="min-w-0 flex-1">
                                <h2
                                    id={titleId}
                                    className="text-lg font-semibold text-content-strong"
                                >
                                    {title}
                                </h2>
                                {description && (
                                    <p id={descId} className="mt-1 text-xs text-content-muted">
                                        {description}
                                    </p>
                                )}
                            </div>
                            {!hideCloseButton && (
                                <button
                                    type="button"
                                    data-modal-close=""
                                    onClick={onClose}
                                    aria-label={closeLabel}
                                    // §12.11: ≥ 44×44px. El cierre de
                                    // BoardActivationModal medía ~24px.
                                    className="-me-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong"
                                >
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </button>
                            )}
                        </div>

                        {/* Cuerpo con scroll propio (§9.4) */}
                        <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>
                            {children}
                        </div>

                        {/* Pie adherido, acciones al final */}
                        {footer && (
                            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-stroke-hairline bg-surface-3 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
