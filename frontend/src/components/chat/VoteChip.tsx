import { cn } from '@/lib/utils';
import type { BoardVote } from '@/types';

/**
 * Chip de voto — DESIGN §P2, §2.4 y §9.9.
 *
 * F6: los tres votos se pintaban con el color de la BURBUJA, así que «✗ EN
 * CONTRA · 91%» —la señal más valiosa del producto— era cromáticamente idéntica
 * a «✓ A FAVOR · 78%» y sólo se distinguían por el glifo. §P2 es explícita: «un
 * voto en contra debe encontrarse antes que un voto a favor» y «el disenso usa
 * `--color-dissent` y nunca comparte tratamiento con los votos a favor».
 *
 * El color NO es el único canal (§P5): siguen estando el glifo, la palabra y el
 * porcentaje. Lo que cambia es el peso óptico — el disenso pesa, la conformidad
 * se apaga — para que el desacuerdo se encuentre antes al recorrer el hilo.
 *
 * Vive aquí y no dentro de `MessageBubble` porque la conversación compartida
 * (tarea 2.4) es la superficie pública del producto y tiene que contar el
 * desacuerdo exactamente igual: dos chips distintos serían dos productos.
 */
const VOTE_CHIP: Record<BoardVote['decision'], { clase: string; texto: string; glifo: string }> = {
    // Oxblood, relleno y peso: es lo que hay que ver primero.
    NO: { clase: 'border-dissent/50 bg-dissent/12 text-dissent font-bold', texto: 'EN CONTRA', glifo: '✗' },
    // Ámbar: hay decisión, pero cuelga de una condición.
    CONDICIONAL: { clase: 'border-warning/45 bg-warning/12 text-warning font-bold', texto: 'CONDICIONAL', glifo: '~' },
    // Conformidad: neutra y callada. Es el fondo contra el que destaca el disenso.
    SI: { clase: 'border-stroke-edge bg-surface-2 text-content-muted font-medium', texto: 'A FAVOR', glifo: '✓' },
};

interface VoteChipProps {
    decision: string;
    confidence?: number;
}

export function VoteChip({ decision, confidence }: VoteChipProps) {
    const chip = VOTE_CHIP[decision as BoardVote['decision']] ?? VOTE_CHIP.CONDICIONAL;
    const cifra = typeof confidence === 'number' ? `${confidence}%` : null;
    return (
        <span
            // §9.9: radio corto y filete del color semántico a 40-50% con
            // relleno al 12%; nunca píldora.
            className={cn('px-2 py-0.5 rounded-xs text-micro font-mono border tnum', chip.clase)}
            title={cifra ? `Voto: ${decision} · confianza ${cifra}` : `Voto: ${decision}`}
        >
            {chip.glifo} {chip.texto}
            {cifra ? ` · ${cifra}` : ''}
        </span>
    );
}
