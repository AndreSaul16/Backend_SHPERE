import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import type { Message, BoardVote } from '../../src/types';

/**
 * F6 (P1) — el chip de voto tiene que distinguir el disenso.
 *
 * «✓ A FAVOR · 78%», «✗ EN CONTRA · 91%» y «~ CONDICIONAL · 64%» se pintaban
 * los TRES con el color de la burbuja, así que el voto en contra con 91% de
 * confianza —la señal más valiosa de la pantalla según §P2— era cromáticamente
 * idéntico al voto a favor. §2.4 reserva el oxblood para el disenso y §P2
 * exige que un voto en contra se encuentre antes que uno a favor.
 */

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, layout, variants, whileHover, whileTap, whileFocus, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

vi.mock('../../src/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));

const conVoto = (vote: BoardVote): Message => ({
    id: 'm1', role: 'CFO', content: 'La caja no aguanta.', agentId: 'cfo-1', timestamp: new Date(), vote,
});

const chip = (texto: RegExp) => screen.getByText(texto).closest('span') as HTMLElement;

const pintar = (vote: BoardVote) =>
    render(<MessageBubble message={conVoto(vote)} agentColor="#D7A94F" />);

describe('F6 — el chip de voto distingue el disenso', () => {
    it('el voto en contra va en oxblood (§2.4), no en el color de la burbuja', () => {
        pintar({ decision: 'NO', confidence: 91 });

        const c = chip(/EN CONTRA/);
        expect(c.className).toContain('text-dissent');
        expect(c.className).toContain('bg-dissent/12');
        // Nada de color de sesión clavado en el estilo del chip.
        expect(c.getAttribute('style')).toBeNull();
    });

    it('el voto a favor se apaga: es el fondo contra el que destaca el disenso', () => {
        pintar({ decision: 'SI', confidence: 78 });

        const c = chip(/A FAVOR/);
        expect(c.className).toContain('text-content-muted');
        expect(c.className).not.toContain('text-dissent');
    });

    it('el condicional tiene su propio tratamiento, ni disenso ni conformidad', () => {
        pintar({ decision: 'CONDICIONAL', confidence: 64 });

        const c = chip(/CONDICIONAL/);
        expect(c.className).toContain('text-warning');
    });

    it('los tres votos no comparten tratamiento (§P2)', () => {
        const clases = (['NO', 'SI', 'CONDICIONAL'] as const).map((decision) => {
            const { unmount } = pintar({ decision, confidence: 80 });
            const texto = decision === 'NO' ? /EN CONTRA/ : decision === 'SI' ? /A FAVOR/ : /CONDICIONAL/;
            const clase = chip(texto).className;
            unmount();
            return clase;
        });
        expect(new Set(clases).size).toBe(3);
    });

    it('el color no es el único canal: glifo, palabra y confianza siguen ahí (§P5)', () => {
        pintar({ decision: 'NO', confidence: 91 });

        expect(screen.getByText(/✗ EN CONTRA · 91%/)).toBeInTheDocument();
    });
});
