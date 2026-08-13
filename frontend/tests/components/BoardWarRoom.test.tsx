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

/**
 * lanzamiento-p0 · CS-010 — el importe y su motivo, juntos.
 *
 * El war-room decía «3 créditos» sin explicar por qué no eran 5. Un descuento
 * sin motivo se lo explica el usuario solo, y la explicación que tenía a mano
 * era la equivocada: PRODUCT.md prometía que el debate cuesta menos cuando hay
 * consenso. El motivo real está en el propio evento `board_plan`, que ya trae
 * `participants` y `cost`: lo decide el triaje por número de directores.
 */
describe('CS-010 — el coste se muestra con su motivo', () => {
    it('una junta reducida dice cuánto cuesta Y por qué', () => {
        render(
            <BoardWarRoom
                board={makeBoard({ participants: ['CTO', 'CFO'], cost: 3 })}
                agents={AGENTS}
            />,
        );

        expect(screen.getByText('3 créditos')).toBeInTheDocument();
        expect(screen.getByText(/junta reducida a 2 directores/)).toBeInTheDocument();
    });

    it('una junta completa no inventa ningún descuento', () => {
        render(
            <BoardWarRoom
                board={makeBoard({ participants: ['CTO', 'CFO', 'CMO'], cost: 5 })}
                agents={AGENTS}
            />,
        );

        expect(screen.getByText('5 créditos')).toBeInTheDocument();
        expect(screen.queryByText(/junta reducida/)).toBeNull();
    });

    it('el motivo no menciona el consenso: lo decide el triaje', () => {
        render(
            <BoardWarRoom
                board={makeBoard({ participants: ['CTO', 'CFO'], cost: 3, unanimous: true, earlyExit: true })}
                agents={AGENTS}
            />,
        );

        const motivo = screen.getByText(/junta reducida a 2 directores/);
        expect(motivo.textContent).not.toMatch(/consenso|unanimidad/i);
    });
});

/**
 * lanzamiento-p0 · BVT-004 — un empate no es un consenso.
 *
 * Con 1-1-1 no hay decisión ganadora, y el veredicto lo llamaba «Junta
 * dividida», que es lo mismo que llama a un 2-1 con disenso convencido. La
 * diferencia importa: en un empate la junta NO decidió, y el war-room no puede
 * dar a entender lo contrario.
 */
describe('BVT-004 — el empate se declara como empate', () => {
    const empate = makeBoard({
        phase: 'synthesis',
        tally: { SI: 1, NO: 1, CONDICIONAL: 1 },
        votes: {
            CTO: { decision: 'SI', confidence: 80 },
            CFO: { decision: 'NO', confidence: 78 },
            CMO: { decision: 'CONDICIONAL', confidence: 75 },
        },
    });

    it('el recuento visible dice «Empate», no «consenso»', () => {
        render(<BoardWarRoom board={empate} agents={AGENTS} />);

        // Dos apariciones, como en el resto del fichero: el equivalente visual
        // y la región viva. La primera es la que se lee con los ojos.
        const [recuento] = screen.getAllByText(/1 a favor · 1 en contra · 1 condicional/);
        expect(recuento.textContent).toContain('Empate');
        expect(recuento.textContent).not.toContain('consenso');
    });

    it('una mayoría real sigue sin llamarse empate', () => {
        render(
            <BoardWarRoom
                board={makeBoard({
                    phase: 'synthesis',
                    tally: { SI: 2, NO: 1 },
                    votes: {
                        CTO: { decision: 'SI', confidence: 80 },
                        CEO: { decision: 'SI', confidence: 82 },
                        CFO: { decision: 'NO', confidence: 55 },
                    },
                })}
                agents={AGENTS}
            />,
        );

        const [recuento] = screen.getAllByText(/2 a favor · 1 en contra/);
        expect(recuento.textContent).not.toContain('Empate');
    });
});
