import type { BoardPhase } from '@/types';

/**
 * El orden del día del debate — las cinco fases del grafo del backend
 * (`board_v2.py`: opening → analysis → rebuttal → devil → synthesis).
 *
 * Vive en su propio módulo, y no dentro de un componente, porque ahora lo
 * consumen dos: el Rail del Orden del Día (§8.4) y la mesa. La regla
 * `react-refresh/only-export-components` tampoco dejaría exportarlo desde un
 * fichero de componente.
 */
export interface FaseDelDia {
    clave: BoardPhase;
    /** Etiqueta corta, la que cabe en la canal de 56px. */
    etiqueta: string;
    /** El ordinal que va en la muesca del canto. */
    numero: number;
}

export const FASES: FaseDelDia[] = [
    { clave: 'opening', etiqueta: 'Apertura', numero: 1 },
    { clave: 'analysis', etiqueta: 'Análisis', numero: 2 },
    { clave: 'rebuttal', etiqueta: 'Réplicas', numero: 3 },
    { clave: 'devil', etiqueta: 'Objeción', numero: 4 },
    { clave: 'synthesis', etiqueta: 'Síntesis', numero: 5 },
];

/**
 * El asiento del Abogado del Diablo es opcional (`board_devil` en el backend),
 * así que su fase sólo entra en el orden del día cuando va a ocurrir de verdad.
 * Anunciar una fase que nunca llegará sería mentir sobre el orden del día.
 */
export function fasesDe(board: { devil: boolean; phase: BoardPhase | null }): FaseDelDia[] {
    const conDevil = board.devil || board.phase === 'devil';
    return conDevil ? FASES : FASES.filter((f) => f.clave !== 'devil');
}
