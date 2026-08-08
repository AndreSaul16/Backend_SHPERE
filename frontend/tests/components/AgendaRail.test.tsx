/**
 * El Rail del Orden del Día / el Canto (§8.4).
 *
 * Aquí vive además la regresión **D34** que antes probaba la barra de fases de
 * `BoardWarRoom`: la fase `devil` existe, y mientras habla el Abogado del
 * Diablo las anteriores se leen como despachadas y no como futuras. La barra se
 * ha ido —era `hidden sm:flex`, o sea que a 390px el orden del día desaparecía
 * entero—, pero el fallo que aquella tabla incompleta provocaba se sigue
 * vigilando: ahora sobre el canto, que es donde vive el orden del día.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { AgendaRail, type SegmentoDelDia } from '../../src/components/chat/AgendaRail';
import { fasesDe, FASES } from '../../src/components/chat/agendaPhases';
import type { BoardPhase } from '../../src/types';

vi.mock('framer-motion', () => ({
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: { children: unknown }) => children,
    motion: new Proxy({}, { get: () => 'div' }),
}));

const segmentos = (turnos: Record<string, number> = {}, conDevil = false): SegmentoDelDia[] =>
    fasesDe({ devil: conDevil, phase: null }).map((f) => ({ ...f, turnos: turnos[f.clave] ?? 0 }));

function pintar(props: Partial<React.ComponentProps<typeof AgendaRail>> = {}) {
    const scroller = createRef<HTMLElement>();
    const onSaltar = vi.fn();
    const utils = render(
        <AgendaRail
            segmentos={segmentos()}
            faseViva="analysis"
            scroller={scroller}
            onSaltar={onSaltar}
            {...props}
        />,
    );
    return { ...utils, onSaltar };
}

describe('§8.4 El Canto — el orden del día en el borde', () => {
    it('es una navegación con un salto por fase, y existe sin una sola animación', () => {
        pintar();
        const canto = screen.getByRole('navigation', { name: 'Orden del día' });
        expect(canto).toBeInTheDocument();
        // Sin el Abogado del Diablo son cuatro fases.
        expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    it('la fase viva se anuncia como el paso en curso', () => {
        pintar();
        const vivo = screen.getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'step');
        expect(vivo?.dataset.fase).toBe('analysis');
    });

    it('tocar un segmento salta a esa fase', async () => {
        const user = userEvent.setup();
        const { onSaltar } = pintar();
        await user.click(screen.getByRole('button', { name: /Ir a la fase 5, Síntesis/i }));
        expect(onSaltar).toHaveBeenCalledWith('synthesis');
    });

    it('los segmentos se reparten proporcionalmente a los turnos de cada fase', () => {
        pintar({ segmentos: segmentos({ opening: 1, analysis: 3, rebuttal: 2 }) });
        const pesos = screen
            .getAllByRole('listitem')
            .map((li) => (li as HTMLElement).style.flexGrow);
        // Una fase anunciada que aún no ha hablado ocupa el mínimo (1), para que
        // el orden del día se lea entero desde el primer turno.
        expect(pesos).toEqual(['1', '3', '2', '1']);
    });

    it('D34 — la fase `devil` existe y, cuando habla, las anteriores quedan despachadas', () => {
        pintar({ segmentos: segmentos({}, true), faseViva: 'devil' });

        const botones = screen.getAllByRole('button');
        expect(botones).toHaveLength(5);
        expect(botones.find((b) => b.getAttribute('aria-current') === 'step')?.dataset.fase).toBe('devil');

        // Con la tabla incompleta el índice de la fase viva era -1 y NINGUNA
        // quedaba marcada: ni las despachadas ni la actual.
        const etiqueta = (clave: string) =>
            screen.getByRole('button', { name: new RegExp(`Ir a la fase .*${clave}`, 'i') });
        expect(etiqueta('Apertura').textContent).toContain('Apertura');
        const apagadas = botones.slice(0, 3).map((b) => b.querySelector('span.block')!.className);
        for (const c of apagadas) expect(c).toContain('bg-ink-500');
        // La que aún no ha llegado no está apagada: está por venir.
        expect(botones[4].querySelector('span.block')!.className).toContain('bg-stroke-edge');
    });

    it('sin Abogado del Diablo el canto no anuncia una fase que no va a ocurrir', () => {
        pintar();
        expect(screen.queryByRole('button', { name: /Objeción/i })).toBeNull();
    });

    it('las cinco fases de `BoardPhase` tienen etiqueta: ninguna deja el canto sin marcar', () => {
        const todas: BoardPhase[] = ['opening', 'analysis', 'rebuttal', 'devil', 'synthesis'];
        for (const clave of todas) {
            expect(FASES.find((f) => f.clave === clave)?.etiqueta).toBeTruthy();
        }
        expect(FASES).toHaveLength(todas.length);
    });

    it('sin fases no se pinta nada: un canto vacío sería una promesa vacía', () => {
        pintar({ segmentos: [] });
        expect(screen.queryByRole('navigation')).toBeNull();
    });
});
