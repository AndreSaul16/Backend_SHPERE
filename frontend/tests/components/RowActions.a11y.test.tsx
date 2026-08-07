/**
 * D16 (tarea 1.11) — las acciones de fila son alcanzables.
 *
 * DESIGN §9.11 («acciones»): «visibles con `group-hover` **y** `focus-within`
 * **y** siempre en `(hover: none)` — P5». Las cuatro filas de la app eran
 * `opacity-0 group-hover:opacity-100`: copiar, anclar, valorar, regenerar y
 * borrar quedaban inalcanzables por teclado (el hover no llega) e invisibles en
 * táctil (donde el hover no existe).
 *
 * Se prueban las dos mitades del arreglo, porque ninguna basta sola:
 *
 *  1. El COMPORTAMIENTO en el sitio de uso: los botones están en el orden de
 *     tabulación y tienen nombre accesible. jsdom no aplica CSS, así que medir
 *     `opacity` aquí no probaría nada.
 *  2. El CONTRATO en `index.css`, leído del fichero: que el estado por defecto
 *     sea visible y que ocultarlo esté condicionado a hover fino y siempre con
 *     `:focus-within`. Es lo único que puede comprobar mecánicamente «visible
 *     en `(hover: none)`».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import type { Message } from '../../src/types';

const agentMessage: Message = {
    id: 'm1',
    role: 'assistant',
    content: 'La propuesta se sostiene.',
    timestamp: new Date('2026-08-07T10:00:00Z'),
    agentId: 'cto',
};

const userMessage: Message = {
    id: 'm2',
    role: 'user',
    content: '¿Y el coste?',
    timestamp: new Date('2026-08-07T10:01:00Z'),
};

describe('D16 — acciones del turno alcanzables con Tab', () => {
    it('copiar, anclar, regenerar y valorar están en el orden de tabulación', async () => {
        const user = userEvent.setup();
        render(
            <MessageBubble
                message={agentMessage}
                onPin={() => {}}
                onRegenerate={() => {}}
                onRate={() => {}}
            />,
        );

        const acciones = [
            screen.getByRole('button', { name: 'Copiar el mensaje' }),
            screen.getByRole('button', { name: 'Anclar el mensaje' }),
            screen.getByRole('button', { name: 'Regenerar la respuesta' }),
            screen.getByRole('button', { name: 'Valorar como buena respuesta' }),
            screen.getByRole('button', { name: 'Valorar como mala respuesta' }),
        ];

        // Recorrer el orden de tabulación y anotar cuáles se alcanzan. Antes
        // esto era irrelevante —los botones existían— pero estaban a opacity 0
        // sin ninguna regla de foco que los devolviese, así que el usuario de
        // teclado enfocaba controles invisibles.
        const alcanzados = new Set<Element>();
        for (let i = 0; i < 20; i++) {
            await user.tab();
            if (document.activeElement) alcanzados.add(document.activeElement);
        }
        for (const accion of acciones) {
            expect(alcanzados.has(accion)).toBe(true);
        }
    });

    it('las acciones cuelgan de un contenedor [data-row-actions] dentro de un [data-row]', () => {
        render(<MessageBubble message={agentMessage} onPin={() => {}} />);

        const copiar = screen.getByRole('button', { name: 'Copiar el mensaje' });
        const acciones = copiar.closest('[data-row-actions]');
        expect(acciones).not.toBeNull();
        // La fila que hace de ámbito de :hover / :focus-within.
        expect(acciones!.closest('[data-row]')).not.toBeNull();
    });

    it('ninguna acción depende del `title` como única etiqueta (§9.6)', () => {
        render(<MessageBubble message={userMessage} onPin={() => {}} onDelete={() => {}} />);

        const acciones = document.querySelectorAll('[data-row-actions] button');
        expect(acciones.length).toBeGreaterThan(0);
        for (const boton of acciones) {
            expect(boton.getAttribute('aria-label')).toBeTruthy();
        }
    });

    it('los conmutadores declaran su estado, no sólo su color (§12.7)', () => {
        render(
            <MessageBubble message={agentMessage} isPinned onPin={() => {}} onRate={() => {}} rating="up" />,
        );

        expect(screen.getByRole('button', { name: 'Desanclar el mensaje' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(
            screen.getByRole('button', { name: 'Valorar como buena respuesta' }),
        ).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Valorar como mala respuesta' }),
        ).toHaveAttribute('aria-pressed', 'false');
    });
});

describe('D16 — el contrato de `index.css`', () => {
    const css = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8');

    it('el estado por defecto de una fila de acciones es VISIBLE', () => {
        // La declaración sin envolver en ninguna media query: es lo que hace que
        // en `(hover: none)` —móvil— las acciones se vean siempre.
        expect(css).toMatch(/\[data-row-actions\]\{\s*opacity:\s*1;?\s*\}/);
    });

    it('ocultarlas está condicionado a hover fino y devuelve el foco', () => {
        const bloque = css.match(
            /@media \(hover: hover\) and \(pointer: fine\)\{[\s\S]*?\n {2}\}/,
        );
        expect(bloque).not.toBeNull();
        const regla = bloque![0];
        expect(regla).toContain('opacity: 0');
        // Las tres puertas de vuelta: hover de la fila, foco dentro de la fila y
        // foco dentro del propio contenedor de acciones.
        expect(regla).toContain('[data-row]:hover [data-row-actions]');
        expect(regla).toContain('[data-row]:focus-within [data-row-actions]');
        expect(regla).toContain('[data-row-actions]:focus-within');
    });

    it('en puntero grueso el objetivo táctil llega a 44px (§12.11)', () => {
        const bloque = css.match(/@media \(pointer: coarse\)\{[\s\S]*?data-row-actions[\s\S]*?\n {2}\}/);
        expect(bloque).not.toBeNull();
        expect(bloque![0]).toContain('44px');
    });
});
