/**
 * <Button> — DESIGN §9.1.
 *
 * Se crea en la fase 1 porque `<ConfirmDialog>` y `<Toast>` necesitan las
 * variantes `destructive` y `ghost` con su estado `loading`, y §9 prohíbe
 * inventar estados en el sitio de uso. La migración de los ~120 botones
 * artesanales de la app NO es de esta fase; este componente es el destino.
 *
 * Los dos «prohibido» de §9.1 están resueltos aquí y no en el sitio de uso:
 *
 * 1. «Botón deshabilitado a `opacity-40` sin más (≈2.5:1)»: el deshabilitado
 *    cambia de TOKEN (relleno `baize-700`, texto `ink-500`), no de opacidad.
 * 2. «Ancho que salta al entrar en loading»: la etiqueta original se queda en
 *    el flujo con `invisible`, así que reserva su ancho exacto, y el contenido
 *    de carga se pinta encima en posición absoluta. Sin medir nada en JS.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /**
     * §9.1 estado `loading`: ancho congelado, etiqueta sustituida por el
     * spinner más un texto EN GERUNDIO, `aria-busy`, `disabled`.
     */
    loading?: boolean;
    /** El gerundio. Sin él el spinner no dice qué está pasando. */
    loadingLabel?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'secondary',
        size = 'md',
        loading,
        loadingLabel,
        className,
        children,
        disabled,
        type = 'button',
        ...rest
    },
    ref,
) {
    return (
        <button
            {...rest}
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={buttonClass({ variant, size, className })}
        >
            {/* Reserva de ancho: mismo contenido, invisible, sigue en el flujo. */}
            <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
                {children}
            </span>
            {loading && (
                <span className="absolute inset-0 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {loadingLabel}
                </span>
            )}
        </button>
    );
});
