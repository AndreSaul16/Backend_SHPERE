/**
 * Clases de los estados de §9.2, fuera de `Field.tsx` para que ese fichero
 * exporte sólo componentes (`react-refresh/only-export-components`).
 *
 * Aquí viven los OCHO estados de la tabla de DESIGN §9.2 y ninguno más. §9
 * prohíbe inventar estados en el sitio de uso: si hace falta uno nuevo, se
 * añade en esta función y en la tabla de DESIGN, no en un `className` suelto.
 */
import { cn } from '@/lib/utils';

/** Etiqueta de §9.2: `--text-micro`, versalitas, `ink-300` (= content-muted). */
export const FIELD_LABEL_CLASS = 'block text-micro uppercase text-content-muted';

export interface FieldStateClassOptions {
    error?: boolean;
    readOnly?: boolean;
    disabled?: boolean;
    loading?: boolean;
    className?: string;
}

export function fieldControlClass(state?: FieldStateClassOptions): string {
    const { error, readOnly, disabled, loading, className } = state ?? {};
    return cn(
        // default: relleno baize-900 (e1), filete --stroke-control (3.47:1 ✓
        // WCAG 1.4.11), texto ink-100, placeholder ink-500 (4.59:1 — el
        // placeholder es texto y cumple AA).
        'w-full rounded-sm border bg-surface-1 px-3.5 py-2.5 text-sm text-content',
        'placeholder:text-content-quiet',
        'transition-colors duration-(--duration-tap) ease-(--ease-settle)',
        // focus-visible: filete a brass-400. El ANILLO no se declara aquí: lo
        // pone la regla global de `:focus-visible` de index.css (@layer base,
        // con :where() y especificidad 0). §9.2 pide filete Y anillo, y para
        // los campos el offset es 1px, no los 2px del global de botones.
        'focus-visible:border-brass-400 focus-visible:outline-offset-1',
        // hover: filete a brass-600, sólo si el campo está operativo.
        !disabled && !readOnly && 'hover:border-brass-600',
        // El orden importa: error gana a readonly, que gana a disabled.
        // `filled` es idéntico a default a propósito (§9.2: «un campo lleno no
        // cambia de aspecto»), así que no aparece.
        error
            ? 'border-oxblood-500'
            : readOnly
              ? 'border-transparent bg-surface-0'
              : disabled
                ? 'border-stroke-hairline bg-surface-2 text-content-quiet'
                : loading
                  ? 'border-stroke-hairline'
                  : 'border-stroke-control',
        disabled && 'cursor-not-allowed',
        className,
    );
}
