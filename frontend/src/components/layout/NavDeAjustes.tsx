/**
 * 6.4 — la navegación de Configuración, en las dos formas que necesita.
 *
 * Dos problemas de la versión anterior, y ninguno era estético:
 *
 * 1. **La pestaña activa se distinguía sólo por color** (`bg-electric-cyan/10
 *    text-electric-cyan`), que es exactamente lo que §12 y el principio P5
 *    prohíben, y no tenía `aria-current`: para un lector de pantalla las siete
 *    entradas eran siete enlaces indistinguibles. Ahora la activa lleva
 *    `aria-current="page"` y un **filete de latón de 2px** (§9.8: subrayado, no
 *    relleno) además del cambio de tinta.
 * 2. **A 320px la barra se desplazaba sin ninguna pista visual.** «Contactos»
 *    era literalmente indescubrible: nada decía que hubiera más a la derecha.
 *    §9.8 lo resuelve con desvanecimiento en los dos cantos, y aquí es
 *    dinámico: sólo se desvanece el canto por el que queda algo, así que el
 *    desvanecimiento ES la pista y no un adorno permanente.
 *
 * El desvanecimiento se mide dentro de un `ResizeObserver` y del `onScroll`, no
 * en el cuerpo del efecto: la regla de lint de `set-state-in-effect` está ahí
 * por buenos motivos y `observe()` ya dispara una primera medición.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EntradaDeAjustes {
    id: string;
    label: string;
    icon: ReactNode;
    /** Destino. Las secciones viven bajo `/settings/`; Facturación y el panel
     *  de administración son rutas propias y se enlazan tal cual. */
    to: string;
    /** Marca las entradas que salen del shell (Facturación, Administración). */
    externa?: boolean;
}

const BASE =
    'flex items-center gap-2 whitespace-nowrap text-sm transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)';

/** Columna izquierda, a partir de `sm`. El filete de latón va al canto interior. */
export function NavLateralDeAjustes({ entradas }: { entradas: EntradaDeAjustes[] }) {
    return (
        <nav
            aria-label="Secciones de configuración"
            className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-e border-stroke-hairline p-3 sm:flex lg:w-60 lg:p-4"
        >
            {entradas.map((entrada) => (
                <NavLink
                    key={entrada.id}
                    to={entrada.to}
                    end
                    className={({ isActive }) =>
                        cn(
                            BASE,
                            'rounded-sm border-s-2 px-3 py-2',
                            isActive
                                ? 'border-s-accent bg-surface-1 font-medium text-content-strong'
                                : 'border-s-transparent text-content-muted hover:bg-surface-1/60 hover:text-content-strong',
                        )
                    }
                >
                    {entrada.icon}
                    <span className="truncate">{entrada.label}</span>
                    {entrada.externa && <span className="sr-only">(sale de Configuración)</span>}
                </NavLink>
            ))}
        </nav>
    );
}

/** Barra desplazable, por debajo de `sm`. Con desvanecimiento por el canto que queda. */
export function NavDesplazableDeAjustes({ entradas }: { entradas: EntradaDeAjustes[] }) {
    const pista = useRef<HTMLDivElement | null>(null);
    const [restaIzquierda, setRestaIzquierda] = useState(false);
    const [restaDerecha, setRestaDerecha] = useState(false);

    const medir = useCallback(() => {
        const el = pista.current;
        if (!el) return;
        // 1px de margen: los navegadores devuelven fracciones y el canto derecho
        // se quedaba «siempre con algo más» aunque estuviera al final.
        setRestaIzquierda(el.scrollLeft > 1);
        setRestaDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    useEffect(() => {
        const el = pista.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        // `observe()` dispara una medición inmediata: de ahí sale el estado
        // inicial sin llamar a `setState` dentro del efecto.
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => observador.disconnect();
    }, [medir]);

    return (
        <div className="relative sm:hidden">
            <div
                ref={pista}
                onScroll={medir}
                className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {entradas.map((entrada) => (
                    <NavLink
                        key={entrada.id}
                        to={entrada.to}
                        end
                        className={({ isActive }) =>
                            cn(
                                BASE,
                                'shrink-0 border-b-2 px-3 py-2.5 text-xs',
                                isActive
                                    ? 'border-b-accent font-medium text-content-strong'
                                    : 'border-b-transparent text-content-muted',
                            )
                        }
                    >
                        {entrada.icon}
                        {entrada.label}
                    </NavLink>
                ))}
            </div>

            {/* La pista de que hay más. Aparece sólo por el lado que queda, así
                que su presencia informa; si estuviera siempre, no diría nada. */}
            <span
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute inset-y-0 start-0 w-8 bg-linear-to-r from-surface-0 to-transparent transition-opacity duration-150',
                    restaIzquierda ? 'opacity-100' : 'opacity-0',
                )}
            />
            <span
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute inset-y-0 end-0 w-8 bg-linear-to-l from-surface-0 to-transparent transition-opacity duration-150',
                    restaDerecha ? 'opacity-100' : 'opacity-0',
                )}
            />
        </div>
    );
}
