/**
 * El panel: la caja de e2 con filete que sostiene una sección de contenido.
 *
 * DESIGN §9.3. Era la cadena `p-6 sm:p-8 rounded-md bg-surface-2 border
 * border-stroke-edge` copiada a mano en once sitios de cinco ficheros, con
 * cuatro variaciones de relleno y dos de radio que nadie decidió: salieron de
 * copiar la de al lado. Once copias es un sistema de diseño que ya no lo es —
 * cambiar el filete obliga a encontrarlas todas, y la que se escape se queda
 * con el estilo viejo sin que nada falle.
 *
 * Va como FUNCIÓN DE CLASES y no como componente, igual que `buttonClass`, por
 * dos razones: los once sitios son etiquetas distintas (`<section>`,
 * `<motion.section>`, `<button>`, `<div>`) y meterlos todos en un componente
 * obligaría a un `as` que no aporta nada; y una clase se puede componer con lo
 * que cada sitio añada encima sin abrir un hueco de props.
 */
import { cn } from '@/lib/utils';

/** Cuánto aire lleva dentro. */
export type PanelPadding = 'none' | 'compact' | 'comfortable';

const PADDING: Record<PanelPadding, string> = {
    none: '',
    /** Tarjetas de una fila: un agente, una conexión. */
    compact: 'p-5',
    /** Secciones de formulario. Crece en `sm`, que es donde hay sitio. */
    comfortable: 'p-6 sm:p-8',
};

export function panelClass(opts?: {
    padding?: PanelPadding;
    /**
     * Se puede pulsar: el filete pasa a latón al apuntar. NO lleva
     * `translateY` ni escala — §7.5 lo prohíbe por su nombre.
     */
    interactive?: boolean;
    className?: string;
}): string {
    const { padding = 'comfortable', interactive = false, className } = opts ?? {};
    return cn(
        'rounded-md bg-surface-2 border border-stroke-edge',
        PADDING[padding],
        interactive && 'text-left transition-colors hover:border-brass-600',
        className,
    );
}
