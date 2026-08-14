import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import type { Message } from '../../src/types';

/**
 * §7.4 — el presupuesto de bucles de la superficie 4, «transcript en
 * streaming»: **1 bucle** (el cursor de bloque) más el pulso de 4px de «está
 * hablando». Es el techo más estrecho de todo el sistema, y por un motivo que
 * la tabla explica: «el hilo principal está saturado recibiendo tokens — y en
 * el móvil de referencia ese hilo es la mitad de rápido».
 *
 * Lo que este fichero defiende es la parte del presupuesto que se puede
 * verificar sin un navegador: que **la espera y el cursor son excluyentes**. Un
 * turno que todavía no ha dicho nada enseña la espera; en cuanto dice algo, la
 * espera se va y el relevo lo toma el cursor. Nunca los dos, porque dos bucles
 * ya son el doble del techo.
 *
 * Antes de esto había, sólo en la última burbuja, tres puntos animados de
 * `framer` con `repeat: Infinity`, un glifo con `animate-pulse` y el cursor,
 * todos a la vez: cinco bucles donde caben uno.
 */

const base: Message = {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: new Date('2026-08-14T10:00:00Z'),
    agentId: 'cto',
};

describe('Presupuesto de bucles del transcript — §7.4', () => {
    it('sin nada dicho todavía: espera sí, cursor no', () => {
        render(<MessageBubble message={base} isTyping isLast />);

        expect(screen.getAllByTestId('espera-transcript')).toHaveLength(1);
        expect(screen.queryByTestId('fantasma-del-turno')).toBeNull();
    });

    it('en cuanto el turno dice algo: cursor sí, espera no', () => {
        render(
            <MessageBubble
                message={{ ...base, content: 'La propuesta se sostiene.' }}
                isTyping
                isLast
            />,
        );

        expect(screen.getByTestId('fantasma-del-turno')).toBeInTheDocument();
        expect(screen.queryByTestId('espera-transcript')).toBeNull();
        // Y lo dicho se lee, que es de lo que va la superficie.
        expect(screen.getByText('La propuesta se sostiene.')).toBeInTheDocument();
    });

    it('terminado el turno no queda ningún bucle en la burbuja', () => {
        render(
            <MessageBubble
                message={{ ...base, content: 'La propuesta se sostiene.' }}
                isLast
            />,
        );

        expect(screen.queryByTestId('fantasma-del-turno')).toBeNull();
        expect(screen.queryByTestId('espera-transcript')).toBeNull();
        expect(screen.getByText('La propuesta se sostiene.')).toBeInTheDocument();
    });
});
