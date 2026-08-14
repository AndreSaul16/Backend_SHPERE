import { cn } from '@/lib/utils';
import { avanceDeLaPluma } from './pluma';

/**
 * §8.8 «La Pluma del Acta» — el libro se escribe solo.
 *
 * «Mientras el acta se redacta (chunks de artefacto llegando), su tarjeta y su
 * pestaña muestran que *alguien está escribiendo las actas*: un trazo de pluma
 * — una línea de 24×2px bajo el título — que avanza con cada chunk recibido y
 * se reinicia (…). Al cerrarse el artefacto, el trazo se completa en una regla
 * llena y entonces cae el sello (§8.3).»
 *
 * **Sin temporizadores. Ninguno.** El único dato de entrada es cuántos trozos
 * han llegado de verdad; si dejan de llegar, la pluma se para en el sitio donde
 * se quedó, que es exactamente lo que está pasando. Una barra que siguiera
 * moviéndose sola estaría inventando un progreso que nadie le ha contado, y ésa
 * es la diferencia entre este efecto y el spinner que sustituye.
 *
 * El `scaleX` va en el estilo en línea porque es un valor continuo que cambia
 * con cada trozo: no hay clase que pueda expresarlo, y la transición de
 * `--duration-tap` la pone el CSS. Sólo `transform`, o sea compositor.
 */

interface PlumaDelActaProps {
    /** Trozos de artefacto recibidos. Es el ÚNICO motor de este componente. */
    chunks: number;
    /** El artefacto ya está cerrado: la regla se completa y cede el paso. */
    completa: boolean;
    className?: string;
}

export function PlumaDelActa({ chunks, completa, className }: PlumaDelActaProps) {
    const avance = avanceDeLaPluma(chunks, completa);

    return (
        <span
            data-testid="pluma-del-acta"
            data-avance={avance}
            data-completa={completa ? 'si' : 'no'}
            className={cn('pluma-del-acta', className)}
            aria-hidden="true"
        >
            <span className="pluma-trazo" style={{ transform: `scaleX(${avance})` }} />
        </span>
    );
}
