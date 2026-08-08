/**
 * Las versiones de un turno regenerado — PLAN §6 Q12 (tarea 5.11).
 *
 * «Regenerar» ya existía y **destruía** la respuesta anterior: truncaba el hilo
 * desde esa burbuja y lo escrito se perdía. Si habías gastado créditos en dos
 * versiones, te quedabas con una y sin forma de decidir. La pérdida silenciosa
 * de una respuesta pagada es un fallo de producto, no una función que falta.
 *
 * Cómo se lee: una barra con `v1 … vN`, la última marcada como la que está en
 * el hilo. Elegir una anterior abre el diff por palabras contra la actual, con
 * su resumen en una línea — porque dos respuestas de junta se parecen mucho y
 * lo que se quiere ver es qué cambió, no releerlas enteras.
 *
 * §P5: lo quitado y lo añadido NO se distinguen sólo por color. Lo quitado va
 * tachado y lo añadido subrayado, y el resumen lo dice con cifras.
 */
import { useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { diffPorPalabras, resumenDeCambios } from '@/utils/diffPorPalabras';

export function VersionesDelTurno({
    versiones,
    actual,
}: {
    /** Versiones anteriores en orden, v1 primero. */
    versiones: string[];
    /** Lo que hay ahora mismo en el hilo. */
    actual: string;
}) {
    // `null` = ninguna seleccionada, o sea sólo la barra. Abrir el diff por
    // defecto llenaría el hilo de bloques de comparación en cada regeneración.
    const [comparando, setComparando] = useState<number | null>(null);

    const trozos = useMemo(
        () => (comparando === null ? null : diffPorPalabras(versiones[comparando], actual)),
        [comparando, versiones, actual],
    );
    const resumen = useMemo(() => (trozos ? resumenDeCambios(trozos) : null), [trozos]);

    const total = versiones.length + 1;

    return (
        <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-micro uppercase text-content-quiet">
                    <GitCompare className="h-3 w-3" aria-hidden="true" />
                    Regenerada
                </span>
                {versiones.map((_, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => setComparando((actualSel) => (actualSel === i ? null : i))}
                        aria-pressed={comparando === i}
                        aria-label={`Comparar la versión ${i + 1} con la actual`}
                        className={cn(
                            'rounded-xs border px-2 py-0.5 font-mono text-micro uppercase transition-colors duration-(--duration-tap)',
                            comparando === i
                                ? 'border-brass-500 bg-accent/12 text-accent'
                                : 'border-stroke-edge text-content-muted hover:border-brass-600 hover:text-content-strong',
                        )}
                    >
                        v{i + 1}
                    </button>
                ))}
                {/* La actual no es un botón: no hay nada que comparar consigo
                    misma, y un botón que no hace nada es peor que una etiqueta. */}
                <span className="rounded-xs border border-stroke-hairline px-2 py-0.5 font-mono text-micro uppercase text-content-quiet">
                    v{total} · actual
                </span>
            </div>

            {comparando !== null && (
                <div className="rounded-sm border border-stroke-edge bg-surface-2 p-3">
                    {trozos === null ? (
                        <p className="text-xs text-content-muted">
                            Estas dos versiones son demasiado largas para compararlas palabra a
                            palabra sin bloquear la pantalla. Puedes leer la v{comparando + 1}
                            entera aquí abajo.
                        </p>
                    ) : (
                        <>
                            <p className="mb-2 text-micro uppercase text-content-muted tnum">
                                v{comparando + 1} → v{total} · {resumen?.anadidas ?? 0} palabras
                                añadidas · {resumen?.quitadas ?? 0} quitadas
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                                {trozos.map((trozo, i) =>
                                    trozo.tipo === 'igual' ? (
                                        <span key={i}>{trozo.texto}</span>
                                    ) : trozo.tipo === 'quitado' ? (
                                        <del
                                            key={i}
                                            className="bg-dissent/12 text-dissent decoration-1"
                                        >
                                            {trozo.texto}
                                        </del>
                                    ) : (
                                        <ins
                                            key={i}
                                            className="bg-success/12 text-success underline decoration-1 underline-offset-2"
                                        >
                                            {trozo.texto}
                                        </ins>
                                    ),
                                )}
                            </p>
                        </>
                    )}
                    {trozos === null && (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-content-muted">
                            {versiones[comparando]}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
