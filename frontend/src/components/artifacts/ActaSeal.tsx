import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { reclamarSello } from './sealRegistry';
import { cn } from '@/lib/utils';

/**
 * El Sello — DESIGN §8.3, tarea 2.2.
 *
 * «Cuando el CEO cierra el acta, un tampón de anilina violeta aterriza sobre su
 * cabecera. Es el único momento celebratorio de la app y sucede exactamente una
 * vez por debate.»
 *
 * Tres decisiones que hay que respetar si alguien vuelve por aquí:
 *
 * 1. LA TEXTURA VIENE HORNEADA. §8.3 se escribió con `feTurbulence` +
 *    `feDisplacementMap` en runtime y la auditoría v3 lo revocó: con el móvil
 *    como mayoría del tráfico, ese filtro cuesta 4-8 ms de pintado por
 *    fotograma en gama media y no compra NADA, porque la sangría de tinta es
 *    estática — lo que se anima es el aterrizaje, no el sangrado. Las cuatro
 *    variantes salen de `scripts/gen-seals.mjs`, que ejecuta el mismo ruido por
 *    octavas offline y escupe geometría de ~6 KB (2,4 KB comprimidos). Aquí no
 *    hay ni un `filter: url(#…)`, y no debe haberlo nunca.
 *
 * 2. EL COLOR ES `aniline-500` LITERAL, no `var(--certify)`. El sello aterriza
 *    SIEMPRE sobre papel, en los dos temas, y `--certify` en tema oscuro vale
 *    `aniline-400`, que sobre `paper-50` da 2.99:1. `aniline-500` sobre papel
 *    da contraste suficiente y no cambia al cambiar de tema, que es lo correcto
 *    para algo que vive dentro de la hoja.
 *
 * 3. LA VARIANTE SE ELIGE POR HASH DEL ID DE SESIÓN. Dos juntas distintas no
 *    llevan el mismo tampón; la misma junta lleva siempre el suyo, también tras
 *    recargar. Es la única parte de «tampón único» que sobrevive al horneado.
 *
 * La fecha va en `<text>` sobre el anillo, no dentro del activo: es lo único
 * dinámico y §8.3 ya lo pide así.
 */

/** Cuántos sangrados hay en `public/seals/`. */
const VARIANTES = 4;

/**
 * Hash estable (FNV-1a de 32 bits) del id de sesión → variante.
 * No es criptografía: sólo hace falta que reparta y que sea reproducible.
 */
function variantePara(sessionId: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < sessionId.length; i++) {
        h ^= sessionId.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return ((h >>> 0) % VARIANTES) + 1;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

interface ActaSealProps {
    /** Elige el sangrado. Misma sesión, mismo tampón. */
    sessionId: string;
    /** Fecha del cierre del acta. */
    date: Date;
    className?: string;
}

export function ActaSeal({ sessionId, date, className }: ActaSealProps) {
    const reducirMovimiento = useReducedMotion();
    const idBase = useId();
    const arcoAlto = `${idBase}-alto`;
    const arcoBajo = `${idBase}-bajo`;

    // La decisión se toma UNA vez por montaje: si se leyera el Set en cada
    // render, un re-render a mitad del aterrizaje lo cortaría. Va en `useState`
    // con inicializador perezoso y no en un `useRef`, porque leer un ref
    // durante el render es lo que `react-hooks/refs` prohíbe con razón.
    const [cae] = useState(() => reclamarSello(sessionId));

    const fechaCorta = FORMATO_FECHA.format(date).replace('.', '').toUpperCase();
    const fechaLarga = FORMATO_FECHA_LARGA.format(date);
    const variante = variantePara(sessionId);

    // §8.3: `scale 1.18→1` + `opacity 0→1` en --duration-pop con --ease-impact,
    // más el asentamiento de rotate(-1.5deg→0) en --duration-tap.
    // Con movimiento reducido el sello «aparece ya asentado»: sin estados
    // iniciales, sin transición, sin salto.
    const animado = cae && !reducirMovimiento;

    return (
        <motion.div
            role="img"
            aria-label={`Acta sellada el ${fechaLarga}`}
            // Lo que hace visible «una vez por debate» desde fuera: sin esto no
            // hay forma de comprobar en una prueba que la segunda visita al
            // acta ya no estampa.
            data-sellado={cae ? 'cae' : 'asentado'}
            className={cn('relative h-24 w-24 shrink-0 select-none', className)}
            initial={animado ? { opacity: 0, scale: 1.18, rotate: -1.5 } : false}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={
                animado
                    ? {
                        opacity: { duration: 0.16, ease: [0.34, 1.42, 0.64, 1] },
                        scale: { duration: 0.16, ease: [0.34, 1.42, 0.64, 1] },
                        rotate: { duration: 0.09, delay: 0.16, ease: [0.16, 1, 0.3, 1] },
                    }
                    : { duration: 0 }
            }
        >
            {/* El anillo horneado. La máscara CSS recorta un color macizo: el
                activo sólo aporta la silueta (su canal alfa) y el color lo pone
                `bg-aniline-500`, así que un solo fichero sirve para cualquier
                tinta. Las propiedades de máscara viven en `.acta-seal-stamp`
                (index.css); aquí sólo entra el activo elegido. */}
            <span
                aria-hidden="true"
                className="acta-seal-stamp absolute inset-0 block bg-aniline-500"
                style={{ '--seal-src': `url(/seals/seal-${variante}.svg)` } as CSSProperties}
            />

            {/* La leyenda. Va aquí y no en el activo porque la fecha es dinámica
                (§8.3) y porque así se compone con Archivo, la fuente del
                producto: un SVG usado como máscara CSS no carga @font-face y
                habría caído a la sans del sistema. */}
            <svg
                aria-hidden="true"
                viewBox="0 0 96 96"
                className="absolute inset-0 h-full w-full fill-aniline-500"
            >
                <path id={arcoAlto} d="M10 48A38 38 0 0 1 86 48" fill="none" />
                <path id={arcoBajo} d="M12.5 48A35.5 35.5 0 0 0 83.5 48" fill="none" />
                <text
                    fontFamily="var(--font-sans)"
                    fontSize="7.4"
                    fontWeight="600"
                    letterSpacing="1.1"
                    textAnchor="middle"
                >
                    <textPath href={`#${arcoAlto}`} startOffset="50%">
                        SPHERE · JUNTA
                    </textPath>
                </text>
                <text
                    fontFamily="var(--font-sans)"
                    fontSize="6.6"
                    fontWeight="600"
                    letterSpacing="0.9"
                    textAnchor="middle"
                >
                    <textPath href={`#${arcoBajo}`} startOffset="50%">
                        {fechaCorta}
                    </textPath>
                </text>
            </svg>
        </motion.div>
    );
}
