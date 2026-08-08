/**
 * El grado de desacuerdo, en una línea — PLAN §6 Q8 (tarea 5.5), DESIGN §P2.
 *
 * La auditoría lo llamó «el de mayor wow por línea de código», y con razón: los
 * datos ya estaban en el store desde el primer debate (`votes`, con decisión y
 * confianza por director) y la cabecera sólo enseñaba el recuento crudo. Un
 * «2 a favor · 1 en contra» obliga al usuario a hacer la lectura; esto la hace.
 *
 * Tres decisiones:
 *
 * - **El color no es el único canal** (§P5). El veredicto va escrito —
 *   «Unanimidad», «Junta dividida»—, el recuento sigue debajo y la barra lleva
 *   `role="meter"` con su `aria-valuetext`. Quitando el color entero la línea
 *   sigue diciendo lo mismo.
 * - **La conformidad se apaga y el disenso pesa**, igual que en el chip de voto
 *   (§P2): el tramo «a favor» es filete neutro y el tramo «en contra» es
 *   oxblood macizo. Es lo que hace que el desacuerdo se encuentre antes.
 * - **No hay movimiento propio.** §7.4 presupuesta esta superficie para la Mesa
 *   y la Aguja; una barra que además se anima en cada voto compite con la
 *   aguja, que es la medida principal. Sólo el color transiciona, y con
 *   `motion-reduce` ni eso.
 */
import { cn } from '@/lib/utils';
import type { BoardVote } from '@/types';
import { gradoDeDesacuerdo, type NivelDeDesacuerdo } from './desacuerdo';

/** Tratamiento por nivel. Ni un `text-red-500`: todo sale de §2. */
const TONO: Record<NivelDeDesacuerdo, string> = {
    'sin-datos': 'text-content-quiet',
    unanime: 'text-content-muted',
    mayoria: 'text-warning',
    // §P2: el disenso es oxblood y no comparte tratamiento con la conformidad.
    dividida: 'text-dissent font-semibold',
};

/** Los tres tramos de la barra, en el orden en que se leen. */
const TRAMOS = [
    { clave: 'SI', clase: 'bg-stroke-control' },
    { clave: 'CONDICIONAL', clase: 'bg-warning' },
    { clave: 'NO', clase: 'bg-dissent' },
] as const;

export function DisagreementBar({
    votes,
    className,
}: {
    votes: Record<string, BoardVote> | null | undefined;
    className?: string;
}) {
    const grado = gradoDeDesacuerdo(votes);

    // Sin dos votos no hay grado que medir, y una barra vacía en la cabecera
    // ocuparía sitio para no decir nada.
    if (grado.nivel === 'sin-datos') return null;

    return (
        <div
            className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}
            data-testid="grado-de-desacuerdo"
            data-nivel={grado.nivel}
        >
            <span className={cn('text-micro uppercase tracking-wide', TONO[grado.nivel])}>
                {grado.etiqueta}
            </span>

            <span
                role="meter"
                aria-label="Grado de desacuerdo de la junta"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={grado.grado}
                aria-valuetext={`${grado.etiqueta}. ${grado.detalle}`}
                title={grado.detalle}
                // 24 caracteres de ancho mínimo y crecer con el sitio: a 390px
                // la línea comparte fila con el veredicto, y una barra que
                // empuja al veredicto a otra línea deja el número sin su
                // sustantivo.
                className="flex h-1 min-w-24 flex-1 overflow-hidden rounded-xs bg-surface-inset"
            >
                {TRAMOS.map(({ clave, clase }) => {
                    const n = grado.recuento[clave];
                    if (n === 0) return null;
                    return (
                        <span
                            key={clave}
                            aria-hidden="true"
                            className={cn(
                                'block h-full transition-colors duration-(--duration-reveal) motion-reduce:transition-none',
                                clase,
                            )}
                            style={{ width: `${(n / grado.total) * 100}%` }}
                        />
                    );
                })}
            </span>
        </div>
    );
}
