import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FaseDelDia } from './agendaPhases';

/**
 * El Rail del Orden del Día — en móvil es el Canto, y el scroll es el eje
 * (DESIGN §8.4, §4.3).
 *
 * En vertical el eje del debate ya existe: es el scroll. El orden del día se
 * imprime como el uñero de un libro de registro — un filamento de 3px pegado al
 * borde, dividido en segmentos proporcionales a los turnos de cada fase, con el
 * cursor de latón ligado al scroll del lector. En `lg+` el canto se ensancha a
 * la canal de 56px y aparecen el número y el nombre al margen.
 *
 * Sobre el cursor y el hilo principal. §8.4 pide `animation-timeline: scroll()`
 * —fuera del hilo principal— con un rAF como red. Aquí se ligan LOS DOS a la
 * misma variable `--canto-p`: donde el navegador soporta líneas de tiempo de
 * scroll con nombre, el recorrido lo lleva el compositor y esta clase no
 * escucha nada; donde no, un oyente pasivo coalescido por rAF escribe la misma
 * variable. El dibujo es idéntico en ambos casos, así que no hay dos verdades.
 *
 * El desplazamiento se expresa en unidades de contenedor (`cqh`) y no en
 * píxeles medidos: es sólo `translate`, no obliga a medir el DOM en cada
 * fotograma y sobrevive a que la ventana cambie de alto.
 *
 * Sin ninguna de las dos cosas —ni línea de tiempo ni rAF— el canto sigue
 * completo: los segmentos se ven, dicen su fase y saltan a ella. El cursor se
 * queda arriba. Nunca desaparece información.
 */

/** El navegador sabe ligar una animación al scroll sin pasar por JS. */
const HAY_LINEA_DE_TIEMPO =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timeline', 'scroll()');

export interface SegmentoDelDia extends FaseDelDia {
    /** Turnos de esta fase: marca el alto del segmento en el canto. */
    turnos: number;
}

interface AgendaRailProps {
    segmentos: SegmentoDelDia[];
    /** La fase viva engrosa su segmento; las despachadas se apagan. */
    faseViva: string | null;
    /** El contenedor con scroll del transcript: el eje del debate. */
    scroller: React.RefObject<HTMLElement | null>;
    /** Saltar a una fase. El componente no sabe dónde están los turnos. */
    onSaltar: (clave: string) => void;
}

export function AgendaRail({ segmentos, faseViva, scroller, onSaltar }: AgendaRailProps) {
    const reducido = useReducedMotion();
    const pistaRef = useRef<HTMLDivElement>(null);
    const [etiquetaFlotante, setEtiquetaFlotante] = useState<{ texto: string; y: number } | null>(null);
    const pulsacion = useRef<{ temporizador: number | null }>({ temporizador: null });

    /**
     * El cursor ligado al scroll. Con línea de tiempo nativa no se registra
     * nada: lo lleva el compositor. Sin ella, un oyente pasivo coalescido por
     * `requestAnimationFrame` escribe una custom property — un solo estilo por
     * fotograma como mucho, y ni un render de React.
     */
    useEffect(() => {
        // Con movimiento reducido la línea de tiempo nativa se apaga (§7.6), y
        // entonces el cursor lo coloca este efecto: se salta sólo cuando manda
        // de verdad el compositor.
        if (HAY_LINEA_DE_TIEMPO && !reducido) return;
        const el = scroller.current;
        const pista = pistaRef.current;
        if (!el || !pista) return;

        let pedido = 0;
        const medir = () => {
            pedido = 0;
            const recorrido = el.scrollHeight - el.clientHeight;
            const p = recorrido > 0 ? Math.min(1, Math.max(0, el.scrollTop / recorrido)) : 0;
            pista.style.setProperty('--canto-p', p.toFixed(4));
        };
        const alDesplazar = () => {
            if (pedido) return;
            pedido = requestAnimationFrame(medir);
        };

        medir();
        el.addEventListener('scroll', alDesplazar, { passive: true });
        return () => {
            el.removeEventListener('scroll', alDesplazar);
            if (pedido) cancelAnimationFrame(pedido);
        };
    }, [scroller, segmentos.length, reducido]);

    const cerrarEtiqueta = useCallback(() => {
        if (pulsacion.current.temporizador !== null) {
            window.clearTimeout(pulsacion.current.temporizador);
            pulsacion.current.temporizador = null;
        }
        setEtiquetaFlotante(null);
    }, []);

    useEffect(() => cerrarEtiqueta, [cerrarEtiqueta]);

    /** Mantener pulsado revela el nombre de la fase, y la etiqueta sigue al dedo. */
    const alPulsar = (e: React.PointerEvent<HTMLButtonElement>, seg: SegmentoDelDia) => {
        const y = e.clientY;
        pulsacion.current.temporizador = window.setTimeout(() => {
            setEtiquetaFlotante({ texto: `${seg.numero} · ${seg.etiqueta}`, y });
        }, 400);
    };

    const alMover = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (pulsacion.current.temporizador === null && !etiquetaFlotante) return;
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        const clave = bajo?.closest<HTMLElement>('[data-fase]')?.dataset.fase;
        const seg = segmentos.find((s) => s.clave === clave);
        if (!seg) return;
        setEtiquetaFlotante((prev) =>
            prev ? { texto: `${seg.numero} · ${seg.etiqueta}`, y: e.clientY } : prev,
        );
    };

    if (segmentos.length === 0) return null;

    const vivaIndice = segmentos.findIndex((s) => s.clave === faseViva);

    return (
        <nav
            aria-label="Orden del día"
            className="canto pointer-events-none fixed inset-y-0 left-0 z-30 shrink-0 lg:sticky lg:inset-auto lg:top-0 lg:h-full lg:self-stretch"
        >
            <div ref={pistaRef} className="canto-pista relative h-full">
                <ol className="pointer-events-auto absolute inset-y-0 left-0 flex h-full w-3 flex-col lg:w-full">
                    {segmentos.map((seg, i) => {
                        const viva = seg.clave === faseViva;
                        const despachada = vivaIndice >= 0 && i < vivaIndice;
                        return (
                            <li
                                key={seg.clave}
                                className="relative flex min-h-8 items-center"
                                style={{ flexGrow: Math.max(1, seg.turnos) }}
                            >
                                <button
                                    type="button"
                                    data-fase={seg.clave}
                                    aria-current={viva ? 'step' : undefined}
                                    onClick={() => onSaltar(seg.clave)}
                                    onPointerDown={(e) => alPulsar(e, seg)}
                                    onPointerMove={alMover}
                                    onPointerUp={cerrarEtiqueta}
                                    onPointerCancel={cerrarEtiqueta}
                                    onPointerLeave={cerrarEtiqueta}
                                    className="group flex h-full w-full items-center gap-2 outline-offset-2 lg:pl-2"
                                >
                                    {/* El filamento. La fase viva engrosa; las
                                        despachadas se apagan a ink-500. */}
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'block h-full rounded-full transition-colors duration-(--duration-reveal)',
                                            viva ? 'w-1 bg-accent' : 'w-[3px]',
                                            !viva && (despachada ? 'bg-ink-500' : 'bg-stroke-edge'),
                                        )}
                                    />
                                    {/* La canal de 56px: número y nombre al
                                        margen, como en una transcripción de
                                        Hansard. Debajo de lg no se pinta. */}
                                    <span className="hidden min-w-0 flex-col items-start text-left lg:flex">
                                        <span className="font-mono text-micro tnum leading-none text-content-quiet">
                                            {seg.numero}
                                        </span>
                                        <span
                                            className={cn(
                                                'truncate font-mono text-micro uppercase leading-tight',
                                                viva
                                                    ? 'font-bold text-accent'
                                                    : despachada
                                                      ? 'text-ink-500'
                                                      : 'text-content-quiet',
                                            )}
                                        >
                                            {seg.etiqueta}
                                        </span>
                                    </span>
                                    <span className="sr-only">
                                        Ir a la fase {seg.numero}, {seg.etiqueta}
                                        {viva ? ' (en curso)' : ''}
                                    </span>
                                </button>
                                {/* Muesca numerada en la juntura. */}
                                {i > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className="absolute left-0 top-0 h-px w-2 bg-stroke-control lg:w-3"
                                    />
                                )}
                            </li>
                        );
                    })}
                </ol>

                {/* El cursor de latón. No lleva rol: es el reflejo del scroll,
                    y la posición en el orden del día ya la dice `aria-current`
                    del segmento vivo. */}
                <span
                    aria-hidden="true"
                    className="canto-cursor pointer-events-none absolute left-0 top-0 h-10 w-1 rounded-full bg-accent shadow-e2 lg:w-1.5"
                />
            </div>

            {etiquetaFlotante && (
                <span
                    aria-hidden="true"
                    className="pointer-events-none fixed left-4 z-40 -translate-y-1/2 rounded-xs border border-stroke-edge bg-surface-3 px-2 py-1 font-mono text-micro uppercase text-content-strong shadow-e3"
                    style={{ top: etiquetaFlotante.y }}
                >
                    {etiquetaFlotante.texto}
                </span>
            )}
        </nav>
    );
}
