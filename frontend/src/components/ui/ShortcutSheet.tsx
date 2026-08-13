/**
 * La hoja de atajos — PLAN §6 Q9 (tarea 5.3).
 *
 * «La hoja de atajos es, de hecho, la mejor documentación de lo que la
 * aplicación sabe hacer.» Por eso NO se escribe a mano: se pinta del mismo
 * registro (`ATAJOS`) del que cada sitio de uso saca su combinación. Un atajo
 * nuevo aparece aquí solo; uno que se retira, desaparece. Una hoja que hay que
 * acordarse de actualizar acaba mintiendo, y una documentación que miente es
 * peor que ninguna.
 *
 * Se abre de dos maneras, y las dos importan:
 *   · con `?`, que es la convención;
 *   · desde la paleta de comandos («Ver los atajos de teclado»), que es cómo la
 *     encuentra quien no sabe que `?` hace algo — y quien no tiene teclado.
 *
 * `?` no dispara dentro de un campo de texto: escribir «¿lo hacemos?» en el
 * compositor no puede abrir una ventana encima. Esa regla vive en `useAtajo` y
 * vale para todos los atajos de una sola tecla.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { ATAJOS, comboDe, esApple, teclasDe, useAtajo, type GrupoDeAtajo } from '@/hooks/useShortcuts';
import { alPedirLaHojaDeAtajos } from '@/lib/atajosBus';

const ORDEN: GrupoDeAtajo[] = ['Navegación', 'La junta', 'Lectura', 'Ayuda'];

export function ShortcutSheet() {
    const [abierta, setAbierta] = useState(false);
    const apple = esApple();

    const cerrar = useCallback(() => setAbierta(false), []);

    useAtajo(
        comboDe('ayuda'),
        useCallback((e: KeyboardEvent) => {
            e.preventDefault();
            setAbierta(true);
        }, []),
    );

    useEffect(() => alPedirLaHojaDeAtajos(() => setAbierta(true)), []);

    return (
        <Modal
            open={abierta}
            onClose={cerrar}
            title="Atajos de teclado"
            description="Todo lo que la aplicación sabe hacer sin ratón."
            size="md"
        >
            <div className="space-y-6">
                {ORDEN.map((grupo) => {
                    const delGrupo = ATAJOS.filter((a) => a.grupo === grupo);
                    if (delGrupo.length === 0) return null;
                    return (
                        <section key={grupo} aria-label={grupo}>
                            <h3 className="mb-2 text-micro uppercase tracking-wide text-content-quiet">
                                {grupo}
                            </h3>
                            <dl className="space-y-1">
                                {delGrupo.map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-sm px-2 py-1.5 odd:bg-stroke-hairline/50"
                                    >
                                        <dt className="min-w-0 text-sm text-content">
                                            {a.que}
                                            {a.donde && (
                                                <span className="ms-2 text-micro uppercase text-content-quiet">
                                                    {a.donde}
                                                </span>
                                            )}
                                        </dt>
                                        <dd className="flex shrink-0 items-center gap-1">
                                            {teclasDe(a.combo, apple).map((tecla, i) => (
                                                <kbd
                                                    key={`${a.id}-${i}`}
                                                    className="rounded-xs border border-stroke-control bg-surface-inset px-1.5 py-0.5 font-mono text-micro text-content-strong"
                                                >
                                                    {tecla}
                                                </kbd>
                                            ))}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </section>
                    );
                })}
            </div>

            <p className="mt-6 text-xs text-content-muted">
                Ningún atajo de una sola tecla funciona mientras escribes: dentro de un campo
                de texto sólo pasan las combinaciones con {apple ? '⌘' : 'Ctrl'}.
            </p>
        </Modal>
    );
}
