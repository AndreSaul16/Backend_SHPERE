/**
 * Variantes de botón de DESIGN §9.1, en su propio módulo para que `Button.tsx`
 * exporte sólo componentes.
 *
 * Las cinco variantes de la tabla de §9.1 y sus seis estados. Ningún sitio de
 * uso puede añadir un estado: §9 lo prohíbe expresamente.
 *
 * El anillo de foco no aparece aquí porque lo pone la regla global de
 * `:focus-visible` de `index.css` — «idéntico en las cinco variantes», dice la
 * tabla, y una regla global es la única forma de que eso sea verdad.
 */
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
    // relleno brass-500 / texto baize-950 = 8.96:1
    primary: cn(
        'bg-accent-fill text-accent-on-fill',
        'hover:bg-accent-hover',
        'active:bg-brass-600',
        'disabled:bg-baize-700 disabled:text-content-quiet',
    ),
    secondary: cn(
        'border border-stroke-control text-content',
        'hover:border-brass-600 hover:bg-stroke-hairline',
        'disabled:border-stroke-hairline disabled:text-content-quiet',
    ),
    ghost: cn(
        'text-content-muted',
        'hover:bg-stroke-hairline hover:text-content-strong',
        'disabled:text-content-quiet',
    ),
    destructive: cn(
        'border border-oxblood-500 text-oxblood-400',
        'hover:bg-oxblood-500/12',
        'disabled:border-stroke-hairline disabled:text-content-quiet',
    ),
    link: cn(
        'text-accent underline decoration-1 underline-offset-2',
        'hover:text-accent-hover hover:decoration-2',
        'disabled:text-content-quiet disabled:no-underline',
    ),
};

const SIZE: Record<ButtonSize, string> = {
    // §9.1: alto var(--row-h), padding 0 14px, gap 8px.
    md: 'h-(--row-h) gap-2 px-3.5',
    sm: 'h-8 gap-1.5 px-2.5',
};

export function buttonClass(opts?: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
}): string {
    const { variant = 'secondary', size = 'md', className } = opts ?? {};
    return cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-sm',
        // Archivo sm/550. `font-medium` es 500; 550 no existe como utilidad y
        // Archivo es variable, así que se pide por peso arbitrario.
        'text-sm font-[550] whitespace-nowrap',
        'transition-colors duration-(--duration-tap) ease-(--ease-settle)',
        // §7.5: press a scale(.985), no a .95 — a .95 parece de juguete.
        'active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        variant !== 'link' && SIZE[size],
        VARIANT[variant],
        className,
    );
}
