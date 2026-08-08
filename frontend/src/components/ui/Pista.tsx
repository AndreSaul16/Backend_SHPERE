/**
 * La nota de primera vez — PLAN §6 Q13 (tarea 5.12).
 *
 * Una sola forma para las tres pistas, porque tres notas distintas en tres
 * sitios distintos se leen como tres cosas distintas y no como «esto es la
 * aplicación explicándose».
 *
 * Reglas que lleva de serie:
 *
 * - **Se descarta y no vuelve**, y el descarte es un botón de verdad con su
 *   nombre accesible. Un aviso que sólo se quita pinchando fuera no se puede
 *   quitar con el teclado.
 * - **No roba el foco.** Es `role="note"`, no un diálogo: aparece al lado de la
 *   cosa que explica mientras el usuario está mirando otra. Robar el foco aquí
 *   sería sacarlo del debate que está leyendo.
 * - **Entra con opacidad y 4px**, dentro del presupuesto de §7.4, y con
 *   `prefers-reduced-motion` aparece puesta.
 */
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { conMovimiento, CURVA, DURACION } from '@/lib/motion';
import { cn } from '@/lib/utils';

export function Pista({
    children,
    onDescartar,
    className,
    testId,
}: {
    children: React.ReactNode;
    onDescartar: () => void;
    className?: string;
    testId?: string;
}) {
    const reducido = useReducedMotion();
    return (
        <motion.aside
            role="note"
            data-testid={testId}
            initial={reducido ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={conMovimiento(reducido, { duration: DURACION.reveal, ease: CURVA.settle })}
            className={cn(
                'flex items-start gap-2 rounded-sm border border-brass-600 bg-accent/12 px-3 py-2 text-xs leading-relaxed text-content',
                className,
            )}
        >
            <span className="min-w-0 flex-1">{children}</span>
            <button
                type="button"
                onClick={onDescartar}
                aria-label="Entendido, no volver a mostrar"
                className="-me-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-content-muted transition-colors duration-(--duration-tap) hover:bg-stroke-hairline hover:text-content-strong"
            >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
        </motion.aside>
    );
}
