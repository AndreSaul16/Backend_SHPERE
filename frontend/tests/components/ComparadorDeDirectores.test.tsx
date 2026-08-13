import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectorCompare } from '../../src/components/chat/DirectorCompare';
import { BoardWarRoom } from '../../src/components/chat/BoardWarRoom';
import { useChatStore } from '../../src/store/useChatStore';
import type { Agent } from '../../src/types';
import type { BoardSessionState } from '../../src/store/useChatStore';

/**
 * Tarea 5.9 · Q2 — comparador de directores.
 *
 * «El producto existe para el desacuerdo, y hoy hay que hacer scroll arriba y
 * abajo para comparar lo que dijo el CFO con lo que dijo el CTO.»
 *
 * Se comprueba también la desviación consciente del enunciado: las casillas NO
 * van dentro de las placas, porque las placas son `role="tab"` (o sea
 * `<button>`) y meter un control dentro es el anidamiento interactivo que §12.8
 * prohíbe. La elección vive en dos desplegables etiquetados.
 */

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
    { id: 'ceo-1', name: 'Oberon (CEO)', role: 'CEO', avatar: 'O', description: '', color: 'text-agent-ceo', hexColor: '#B290EC', isOnline: true },
    { id: 'cto-1', name: 'Nexus (CTO)', role: 'CTO', avatar: 'N', description: '', color: 'text-agent-cto', hexColor: '#00BFB0', isOnline: true },
    { id: 'cfo-1', name: 'Ledger (CFO)', role: 'CFO', avatar: 'L', description: '', color: 'text-agent-cfo', hexColor: '#E0B341', isOnline: true },
];

const BOARD: BoardSessionState = {
    active: false,
    phase: 'synthesis',
    participants: ['CTO', 'CFO'],
    statusByRole: { CEO: 'done', CTO: 'done', CFO: 'done' },
    votes: {
        CEO: { decision: 'SI', confidence: 70 },
        CTO: { decision: 'SI', confidence: 82 },
        CFO: { decision: 'NO', confidence: 91 },
    },
    tally: { SI: 2, NO: 1 },
    unanimous: false,
    earlyExit: false,
    cost: 5,
    devil: false,
    lastIntervention: null,
};

beforeEach(() => {
    useChatStore.getState().resetState();
    useChatStore.setState({
        currentSessionId: 'junta',
        messagesBySession: {
            junta: [
                { id: '1', role: 'user', content: '¿Subimos precios?', timestamp: new Date() },
                { id: '2', role: 'CTO', content: '**A favor.** La plataforma aguanta.', timestamp: new Date() },
                { id: '3', role: 'CFO', content: '**En contra.** Perderemos la cola larga.', timestamp: new Date() },
                { id: '4', role: 'CTO', content: 'Insisto: el coste marginal es cero.', timestamp: new Date() },
            ] as never,
        },
    });
});

describe('el comparador', () => {
    const abrir = () =>
        render(<DirectorCompare open onClose={vi.fn()} board={BOARD} agents={AGENTS} />);

    it('abre con dos directores que NO votaron lo mismo', () => {
        abrir();
        // Comparar a dos que votaron igual es el caso menos interesante: abrir
        // ahí obliga a cambiar los dos desplegables antes de ver nada útil.
        const izq = screen.getByLabelText(/columna izquierda/i, { selector: 'select' }) as HTMLSelectElement;
        const der = screen.getByLabelText(/columna derecha/i, { selector: 'select' }) as HTMLSelectElement;
        expect(BOARD.votes[izq.value].decision).not.toBe(BOARD.votes[der.value].decision);
    });

    it('enfrenta las intervenciones de cada uno', () => {
        abrir();
        expect(screen.getByText(/la plataforma aguanta/i)).toBeInTheDocument();
        expect(screen.getByText(/perderemos la cola larga/i)).toBeInTheDocument();
    });

    it('el markdown no llega crudo a la cita', () => {
        abrir();
        expect(screen.queryByText(/\*\*A favor\.\*\*/)).toBeNull();
    });

    it('las dos columnas llevan su voto y su confianza en la cabecera', () => {
        abrir();
        // El chip parte su texto en varios nodos; el `title` lleva la frase.
        expect(screen.getByTitle('Voto: NO · confianza 91%')).toBeInTheDocument();
        expect(screen.getByTitle('Voto: SI · confianza 82%')).toBeInTheDocument();
        expect(screen.getAllByRole('meter').length).toBeGreaterThanOrEqual(2);
    });

    it('cambiar el desplegable cambia la columna', async () => {
        const user = userEvent.setup();
        abrir();
        await user.selectOptions(screen.getByLabelText(/columna izquierda/i, { selector: 'select' }), 'CFO');
        // El CFO intervino una vez; su cita aparece ahora en las dos columnas.
        expect(screen.getAllByText(/perderemos la cola larga/i).length).toBe(2);
    });

    it('la elección NO se mete dentro de las placas: nada interactivo anidado', () => {
        abrir();
        const dialogo = screen.getByRole('dialog');
        for (const control of dialogo.querySelectorAll('button, select, a[href], input')) {
            expect(control.closest('button, a[href]') === control || control.closest('button, a[href]') === null)
                .toBe(true);
        }
    });

    it('un director que no intervino lo dice, en vez de dejar la columna muda', async () => {
        const user = userEvent.setup();
        abrir();
        await user.selectOptions(screen.getByLabelText(/columna izquierda/i, { selector: 'select' }), 'CEO');
        expect(screen.getByText(/no llegó a intervenir/i)).toBeInTheDocument();
    });

    it('sin dos directores no se finge una comparación', () => {
        render(
            <DirectorCompare
                open
                onClose={vi.fn()}
                board={{ ...BOARD, participants: [], devil: false }}
                agents={AGENTS}
            />,
        );
        expect(screen.getByText(/no tiene dos directores que enfrentar/i)).toBeInTheDocument();
    });
});

describe('cómo se llega al comparador', () => {
    it('⇧C lo abre desde la cabecera de la junta', async () => {
        render(<BoardWarRoom board={BOARD} agents={AGENTS} />);
        fireEvent.keyDown(document, { key: 'C', shiftKey: true });
        expect(await screen.findByRole('dialog', { name: /comparar directores/i })).toBeInTheDocument();
    });

    it('y también un botón, porque a 390px no hay ⇧C que pulsar', async () => {
        render(<BoardWarRoom board={BOARD} agents={AGENTS} />);
        fireEvent.click(screen.getByRole('button', { name: /comparar/i }));
        expect(await screen.findByRole('dialog', { name: /comparar directores/i })).toBeInTheDocument();
    });

    it('Escape lo cierra', async () => {
        render(<BoardWarRoom board={BOARD} agents={AGENTS} />);
        fireEvent.click(screen.getByRole('button', { name: /comparar/i }));
        await screen.findByRole('dialog');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
