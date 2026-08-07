/**
 * Regresión D34 — `PHASE_LABELS` omitía la fase `devil`.
 *
 * `BoardPhase` es `opening | analysis | rebuttal | devil | synthesis` (y el
 * grafo del backend las recorre en ese orden: `board_v2.py`). La tabla de la
 * barra sólo declaraba cuatro, así que mientras hablaba el Abogado del Diablo
 * `findIndex` devolvía **-1** y la comparación `i === phaseIndex` /
 * `i < phaseIndex` fallaba para TODAS: las fases ya despachadas se pintaban
 * como futuras (`text-content-quiet`), ninguna quedaba marcada como actual, y
 * la región viva anunciaba «Fase: en curso».
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardWarRoom } from '../../src/components/chat/BoardWarRoom';
import type { BoardSessionState } from '../../src/store/useChatStore';
import type { Agent, BoardPhase } from '../../src/types';

const AGENTS: Agent[] = [
    {
        id: 'ceo-1',
        name: 'Oberon (CEO)',
        role: 'CEO',
        avatar: 'O',
        description: 'Visión estratégica.',
        color: 'text-agent-ceo',
        hexColor: '#8A63D2',
        isOnline: true,
    },
    {
        id: 'cto-1',
        name: 'Nexus (CTO)',
        role: 'CTO',
        avatar: 'N',
        description: 'Arquitectura.',
        color: 'text-agent-cto',
        hexColor: '#00C1B3',
        isOnline: true,
    },
];

const makeBoard = (overrides: Partial<BoardSessionState> = {}): BoardSessionState => ({
    active: true,
    phase: 'opening',
    participants: ['CTO'],
    statusByRole: {},
    votes: {},
    tally: null,
    unanimous: false,
    earlyExit: false,
    cost: 5,
    devil: false,
    lastIntervention: null,
    ...overrides,
});

/** La etiqueta de una fase dentro de la barra (no el avatar ni la región viva). */
const phaseLabel = (label: string) =>
    screen
        .getAllByText(label)
        .find((el) => el.tagName === 'SPAN' && el.className.includes('transition-colors'))!;

describe('BoardWarRoom — barra de fases (D34)', () => {
    it('la fase `devil` existe y queda marcada como actual', () => {
        render(<BoardWarRoom board={makeBoard({ phase: 'devil', devil: true })} agents={AGENTS} />);

        const objecion = phaseLabel('Objeción');
        expect(objecion).toBeDefined();
        // Actual = latón y negrita. Con el bug, `phaseIndex` era -1 y esta
        // etiqueta ni siquiera se pintaba.
        expect(objecion.className).toContain('text-accent');
    });

    it('con la fase `devil` las anteriores se pintan como despachadas, no como futuras', () => {
        render(<BoardWarRoom board={makeBoard({ phase: 'devil', devil: true })} agents={AGENTS} />);

        // Éste es el daño real del bug: con `phaseIndex = -1`, `i < phaseIndex`
        // es falso para todas y las tres primeras salían en `text-content-quiet`
        // (futuras) aunque ya hubieran ocurrido.
        for (const pasada of ['Apertura', 'Análisis', 'Réplicas']) {
            expect(phaseLabel(pasada).className).toContain('text-content-muted');
            expect(phaseLabel(pasada).className).not.toContain('text-content-quiet');
        }
        // Y la que aún no ha llegado sí es futura.
        expect(phaseLabel('Síntesis').className).toContain('text-content-quiet');
    });

    it('la región viva nombra la fase `devil` en vez de decir «en curso»', () => {
        render(
            <BoardWarRoom
                board={makeBoard({ phase: 'devil', devil: true, tally: { SI: 2, NO: 1 } })}
                agents={AGENTS}
            />,
        );

        expect(screen.getByTestId('live-tally').textContent).toContain('Fase: Objeción');
    });

    it('las cinco fases de `BoardPhase` tienen etiqueta: ninguna deja la barra sin marcar', () => {
        const todas: BoardPhase[] = ['opening', 'analysis', 'rebuttal', 'devil', 'synthesis'];
        for (const phase of todas) {
            const { unmount } = render(
                <BoardWarRoom
                    board={makeBoard({ phase, devil: true, tally: { SI: 3 } })}
                    agents={AGENTS}
                />,
            );
            expect(screen.getByTestId('live-tally').textContent).not.toContain('Fase: en curso');
            unmount();
        }
    });

    it('sin Abogado del Diablo, la barra no anuncia una fase que no va a ocurrir', () => {
        render(<BoardWarRoom board={makeBoard({ phase: 'rebuttal', devil: false })} agents={AGENTS} />);

        expect(screen.queryByText('Objeción')).toBeNull();
        expect(phaseLabel('Réplicas').className).toContain('text-accent');
        expect(phaseLabel('Síntesis').className).toContain('text-content-quiet');
    });
});
