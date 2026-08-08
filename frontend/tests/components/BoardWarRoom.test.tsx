/**
 * La cabecera de la junta: la Mesa (§8.1) más el recuento y el coste.
 *
 * La barra de fases textual que se probaba aquí se ha ido al Canto (§8.4) —era
 * `hidden sm:flex`, o sea que a 390px el orden del día desaparecía entero—, y
 * con ella la regresión **D34**, que ahora vive en `AgendaRail.test.tsx`. Lo
 * que sigue siendo de esta cabecera es lo que se comprueba abajo: que monta la
 * mesa y que la región viva nombra la fase en vez de decir «en curso».
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardWarRoom } from '../../src/components/chat/BoardWarRoom';
import type { BoardSessionState } from '../../src/store/useChatStore';
import type { Agent, BoardPhase } from '../../src/types';

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const {
            initial, animate, exit, transition, layoutId, layout, variants,
            drag, dragConstraints, dragElastic, onDragEnd,
            whileHover, whileTap, whileFocus, ...domProps
        } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

const AGENTS: Agent[] = [
    {
        id: 'ceo-1',
        name: 'Oberon (CEO)',
        role: 'CEO',
        avatar: 'O',
        description: 'Visión estratégica.',
        color: 'text-agent-ceo',
        hexColor: '#B290EC',
        isOnline: true,
    },
    {
        id: 'cto-1',
        name: 'Nexus (CTO)',
        role: 'CTO',
        avatar: 'N',
        description: 'Arquitectura.',
        color: 'text-agent-cto',
        hexColor: '#00BFB0',
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

describe('BoardWarRoom — la cabecera de la junta', () => {
    it('monta la Mesa: un asiento por director, y todos a la vez', () => {
        render(<BoardWarRoom board={makeBoard()} agents={AGENTS} />);
        expect(screen.getAllByRole('tab')).toHaveLength(2);
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
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

    it('las cinco fases de `BoardPhase` tienen etiqueta: la región viva nunca dice «en curso»', () => {
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

    it('el recuento y el coste se dicen, y el disenso se cuenta aparte', () => {
        render(
            <BoardWarRoom
                board={makeBoard({ tally: { SI: 2, NO: 1, CONDICIONAL: 1 }, cost: 5 })}
                agents={AGENTS}
            />,
        );
        // Dos veces: el equivalente visual y la región viva que lo anuncia.
        expect(screen.getAllByText(/2 a favor · 1 en contra · 1 condicional/)).toHaveLength(2);
        expect(screen.getByText('5 créditos')).toBeInTheDocument();
    });
});
