import { motion, useReducedMotion } from 'framer-motion';
import { conMovimiento, SPRING_NEEDLE } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * La Aguja de Confianza — DESIGN §8.2.
 *
 * «Un voto no es un chip: es una medida.» Un arco graduado de 0 a 100 con una
 * aguja que sobrepasa y se posa; el tramo pasado el 70 va en oxblood, porque la
 * certeza alta —a favor o en contra— es la información que más importa (§P2).
 *
 * Tres decisiones que conviene no deshacer:
 *
 * 1. **La medida existe para quien no la ve.** `role="meter"` con
 *    `aria-valuenow`. Antes de esto la app tenía CERO medidas anunciadas: el
 *    91% de confianza del voto en contra sólo estaba en un chip de texto.
 * 2. **El tramo rojo se dibuja siempre**, esté la aguja donde esté. Es
 *    graduación del instrumento, no relleno de progreso: se lee «esta aguja ha
 *    entrado en la zona que importa» de un vistazo, sin comparar cifras.
 * 3. **Dentro de un botón la aguja va muda** (`decorativa`). ARIA declara los
 *    descendientes de un botón como presentacionales, así que un `meter` ahí
 *    dentro no lo anuncia nadie: mentiría el marcado. En la banda del Palco la
 *    cifra viaja en el nombre accesible de la placa, y la medida de verdad vive
 *    en el asiento en foco, que no es un botón.
 */

/** §8.2: pasado el 70 el arco se tiñe de oxblood. */
export const UMBRAL_OXBLOOD = 70;

/**
 * §8.2 pide 40×24 en el asiento y §8.1/§8.2 bajan a 32×20 en la placa de la
 * banda del Palco, donde la aguja ES la lectura rápida y el número exacto está
 * a un toque.
 */
const GEOMETRIA = {
    banda: { w: 32, h: 20, cx: 16, cy: 17, r: 13, aguja: 10.5, pivote: 1.5, grosor: 2 },
    asiento: { w: 40, h: 24, cx: 20, cy: 21, r: 16, aguja: 13, pivote: 1.75, grosor: 2 },
} as const;

export type TamanoAguja = keyof typeof GEOMETRIA;

interface ConfidenceNeedleProps {
    /** 0-100. Se recorta al rango: un backend creativo no debe romper el dibujo. */
    valor: number;
    /** Nombre del director, para el nombre accesible de la medida. */
    etiqueta: string;
    tamano?: TamanoAguja;
    /** Dentro de un botón: sin rol ni valor, porque ARIA no los anunciaría. */
    decorativa?: boolean;
    /** La cifra al lado, en Archivo `tnum` y `micro` (§8.2). */
    mostrarCifra?: boolean;
    className?: string;
}

export function ConfidenceNeedle({
    valor,
    etiqueta,
    tamano = 'asiento',
    decorativa = false,
    mostrarCifra = false,
    className,
}: ConfidenceNeedleProps) {
    const reducido = useReducedMotion();
    const g = GEOMETRIA[tamano];
    const v = Math.max(0, Math.min(100, Math.round(valor)));

    // El arco es un semicírculo: la aguja barre de -90° (0) a +90° (100).
    const angulo = (v / 100) * 180 - 90;
    const largoArco = Math.PI * g.r;
    // El tramo 70→100 es el último 30% del recorrido.
    const largoRojo = largoArco * (1 - UMBRAL_OXBLOOD / 100);
    const inicioRojo = largoArco * (UMBRAL_OXBLOOD / 100);

    const enZonaRoja = v > UMBRAL_OXBLOOD;
    const arco = `M ${g.cx - g.r} ${g.cy} A ${g.r} ${g.r} 0 0 1 ${g.cx + g.r} ${g.cy}`;

    return (
        <span className={cn('inline-flex items-center gap-1', className)}>
            <svg
                width={g.w}
                height={g.h}
                viewBox={`0 0 ${g.w} ${g.h}`}
                className="overflow-visible shrink-0"
                {...(decorativa
                    ? { 'aria-hidden': true, focusable: false }
                    : {
                          role: 'meter',
                          'aria-valuemin': 0,
                          'aria-valuemax': 100,
                          'aria-valuenow': v,
                          'aria-valuetext': `${v} de 100`,
                          'aria-label': `Confianza de ${etiqueta}`,
                      })}
            >
                {/* Graduación: el arco entero, apagado. */}
                <path
                    d={arco}
                    fill="none"
                    stroke="var(--stroke-control)"
                    strokeWidth={g.grosor}
                    strokeLinecap="butt"
                />
                {/* El tramo que importa (§8.2), siempre dibujado. */}
                <path
                    d={arco}
                    fill="none"
                    stroke="var(--dissent-strong)"
                    strokeWidth={g.grosor}
                    strokeLinecap="butt"
                    strokeDasharray={`${largoRojo} ${largoArco}`}
                    strokeDashoffset={-inicioRojo}
                />
                {/* La aguja: sobrepasa una vez y se posa (SPRING_NEEDLE). */}
                <motion.line
                    x1={g.cx}
                    y1={g.cy}
                    x2={g.cx}
                    y2={g.cy - g.aguja}
                    stroke={enZonaRoja ? 'var(--dissent-strong)' : 'var(--accent)'}
                    strokeWidth={g.grosor - 0.4}
                    strokeLinecap="round"
                    style={{ transformOrigin: `${g.cx}px ${g.cy}px` }}
                    initial={{ rotate: -90 }}
                    animate={{ rotate: angulo }}
                    transition={conMovimiento(reducido, SPRING_NEEDLE)}
                />
                <circle
                    cx={g.cx}
                    cy={g.cy}
                    r={g.pivote}
                    fill={enZonaRoja ? 'var(--dissent-strong)' : 'var(--accent)'}
                />
            </svg>
            {mostrarCifra && (
                <span
                    className={cn(
                        'font-mono text-micro tnum leading-none',
                        enZonaRoja ? 'text-dissent font-bold' : 'text-content-muted',
                    )}
                    aria-hidden="true"
                >
                    {v}
                </span>
            )}
        </span>
    );
}
