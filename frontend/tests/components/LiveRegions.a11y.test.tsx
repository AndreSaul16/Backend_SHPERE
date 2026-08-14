/**
 * D09 (tarea 1.12) — las regiones vivas de §12.6.
 *
 * «Todo lo que cambia sin interacción se anuncia: el turno en streaming, el
 * saldo de créditos, los toasts, el resultado de guardar, el recuento de
 * votos. Hoy: **0 `aria-live`** en toda la app.»
 *
 * El caudal del turno se prueba aparte (`tests/hooks/useLiveAnnouncement`).
 * Aquí se prueba lo otro que puede fallar en silencio: que la región esté en el
 * DOM ANTES de tener contenido —varios lectores no anuncian una región que
 * aparece a la vez que su texto— y que lo que se anuncia sea una frase
 * entendible, no el número que acaba de cambiar.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardWarRoom } from '../../src/components/chat/BoardWarRoom';
import type { BoardSessionState } from '../../src/store/useChatStore';
import type { Agent } from '../../src/types';

const agents: Agent[] = [];

const board = (overrides: Partial<BoardSessionState> = {}): BoardSessionState => ({
    active: true,
    phase: 'analysis',
    participants: ['CEO', 'CTO', 'CFO'],
    statusByRole: { CEO: 'done', CTO: 'speaking', CFO: 'idle' },
    votes: {},
    tally: null,
    unanimous: false,
    earlyExit: false,
    cost: 5,
    devil: false,
    lastIntervention: null,
    ...overrides,
});

describe('D09 — recuento de votos anunciado', () => {
    it('la región existe aunque todavía no haya recuento', () => {
        render(<BoardWarRoom board={board()} agents={agents} />);

        const region = screen.getByTestId('live-tally');
        expect(region).toHaveAttribute('aria-live', 'polite');
        // Vacía, pero presente: si se montase con su contenido, el primer
        // recuento no lo anunciaría nadie.
        expect(region.textContent).toBe('');
    });

    it('anuncia el recuento como frase, con la fase', () => {
        render(
            <BoardWarRoom
                board={board({ tally: { SI: 2, NO: 1 }, phase: 'synthesis' })}
                agents={agents}
            />,
        );

        const texto = screen.getByTestId('live-tally').textContent ?? '';
        expect(texto).toContain('2 a favor');
        expect(texto).toContain('1 en contra');
        expect(texto).toContain('Síntesis');
    });

    it('el recuento visual queda oculto al lector para no leerse dos veces', () => {
        render(<BoardWarRoom board={board({ tally: { SI: 3 } })} agents={agents} />);

        // `aria-atomic` sobre la región relee la frase entera; si además se
        // anunciase el nodo visual, el usuario oiría el recuento por duplicado.
        //
        // Se busca por `data-testid` y no por texto porque desde §8.12 la cifra
        // del recuento va dentro de un odómetro, o sea que la frase visible ya
        // no es un único nodo de texto y `getByText` no la encuentra. La
        // aserción no se relaja: se pide el nodo visual EXACTO, se comprueba que
        // dice el recuento y que está oculto al lector.
        const visual = screen.getByTestId('tally-visual');
        expect(visual).toHaveTextContent('La junta votó 3 a favor');
        expect(visual).toHaveAttribute('aria-hidden', 'true');
    });

    it('avisa del consenso abreviado, que no se ve en ningún otro sitio', () => {
        render(
            <BoardWarRoom board={board({ tally: { SI: 3 }, earlyExit: true })} agents={agents} />,
        );
        expect(screen.getByTestId('live-tally').textContent).toContain('debate abreviado');
    });
});
