/**
 * Estado vacío canónico — DESIGN §9.14.
 *
 * «Nunca un hueco en blanco y nunca sólo un icono.» La anatomía es fija: glifo
 * de línea, título que dice **qué falta**, una frase que dice **qué hacer**, y
 * **una** acción. Una, no dos: un vacío con tres botones no es un vacío, es un
 * menú, y el usuario que llega aquí no sabía ni que tenía que decidir algo.
 *
 * Existe porque los cinco huecos que quedaban en la app estaban resueltos cada
 * uno a su manera: la búsqueda del selector de agentes tenía frase pero ni
 * glifo ni salida; `ContactsSettings` tenía frase suelta; el panel de
 * artefactos tenía glifo y título pero ninguna acción; y
 * `ServiceCredentialsSettings` con la lista vacía no pintaba absolutamente
 * nada — página en blanco.
 *
 * `tamano="compacto"` es para los que viven dentro de otra cosa (una lista, un
 * panel lateral). El grande es para cuando el vacío ocupa la vista entera.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EstadoVacioProps {
    /** Glifo de línea de lucide, ya dimensionado por el componente. */
    glifo: ReactNode;
    /** Qué falta. No «Vacío»: «Aún no tienes contactos». */
    titulo: string;
    /** Qué hacer. Una frase, no un párrafo. */
    frase: ReactNode;
    /** La acción. Una. Opcional sólo cuando de verdad no hay nada que hacer. */
    accion?: { etiqueta: string; onClick: () => void };
    /** Pista de atajo, si la hay (§9.14 la permite). */
    pista?: ReactNode;
    tamano?: 'compacto' | 'amplio';
    className?: string;
}

export function EstadoVacio({
    glifo,
    titulo,
    frase,
    accion,
    pista,
    tamano = 'compacto',
    className,
}: EstadoVacioProps) {
    const amplio = tamano === 'amplio';
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-3 text-center',
                amplio ? 'justify-center p-8' : 'px-4 py-6',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'flex items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent',
                    amplio ? 'h-14 w-14 [&>svg]:h-7 [&>svg]:w-7' : 'h-11 w-11 [&>svg]:h-5 [&>svg]:w-5',
                )}
            >
                {glifo}
            </span>
            <div className={cn('space-y-1', amplio && 'max-w-xs space-y-2')}>
                <p className={cn('font-semibold text-content-strong', amplio ? 'text-lg' : 'text-sm')}>
                    {titulo}
                </p>
                <p className={cn('leading-relaxed text-content-muted', amplio ? 'text-sm' : 'text-xs')}>
                    {frase}
                </p>
            </div>
            {accion && (
                <button
                    type="button"
                    onClick={accion.onClick}
                    className="rounded-sm border border-brass-600 px-3 py-1.5 text-xs font-semibold text-accent transition-colors duration-(--duration-tap) hover:bg-accent/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    {accion.etiqueta}
                </button>
            )}
            {pista && <p className="text-micro text-content-quiet">{pista}</p>}
        </div>
    );
}
