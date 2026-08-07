/**
 * Regresión D36 — copiar podía fallar en silencio absoluto.
 *
 * `await navigator.clipboard.writeText(...)` + `setCopied(true)` sin
 * `try/catch`. El portapapeles falla más de lo que parece: contexto no seguro
 * (la app servida por http), permiso denegado, documento sin foco, o
 * `navigator.clipboard` directamente ausente.
 *
 * NOTA sobre el enunciado original del hallazgo («muestra ✓ aunque falle»): el
 * `await` está ANTES del `setCopied(true)`, así que cuando la promesa se
 * rechaza el ✓ no llega a pintarse. Lo que de verdad pasaba es peor de otra
 * manera: **no pasaba nada**. El botón no cambiaba, no salía ningún aviso, y el
 * rechazo quedaba como una promesa sin dueño. El usuario pulsa copiar, no ve
 * ninguna diferencia entre eso y una copia hecha, y pega lo que llevara antes.
 * Los dos casos que fallan contra el código con bug son precisamente ésos: el
 * aviso y la promesa sin dueño. Los otros dos son guardias de no-regresión.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';
import type { Message } from '../../src/types';

const mensaje: Message = {
    id: 'm1',
    role: 'assistant',
    content: 'La propuesta se sostiene.',
    timestamp: new Date('2026-08-07T10:00:00Z'),
    agentId: 'cto',
};

describe('MessageBubble — copiar al portapapeles (D36)', () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        __resetToastBus();
        writeText = vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
            writable: true,
        });
    });

    afterEach(() => {
        __resetToastBus();
    });

    // `userEvent.setup()` instala su PROPIO stub de `navigator.clipboard` y
    // pisaría el mock de este test, así que aquí se dispara con `fireEvent`.
    const copiar = () => fireEvent.click(screen.getByRole('button', { name: 'Copiar el mensaje' }));

    it('con la copia hecha, el botón pasa a «Copiado»', async () => {
        writeText.mockResolvedValue(undefined);
        render(<MessageBubble message={mensaje} />);

        copiar();

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument(),
        );
        expect(writeText).toHaveBeenCalledWith('La propuesta se sostiene.');
    });

    it('si la copia falla, el botón NO dice «Copiado»', async () => {
        writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
        render(<MessageBubble message={mensaje} />);

        copiar();

        await waitFor(() => expect(writeText).toHaveBeenCalled());
        // Guardia: el arreglo no puede introducir el ✓ mentiroso que el
        // enunciado del hallazgo daba por hecho.
        expect(screen.queryByRole('button', { name: 'Copiado' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Copiar el mensaje' })).toBeInTheDocument();
    });

    it('si la copia falla, lo dice (§11: qué pasó, qué hacer, qué se conservó)', async () => {
        writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        render(<MessageBubble message={mensaje} />);

        copiar();

        await waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0].variant).toBe('error');
        expect(seen[0].title).toBe('No se pudo copiar el mensaje');
        unsubscribe();
    });

    it('el fallo no deja una promesa rechazada sin dueño', async () => {
        writeText.mockRejectedValue(new Error('boom'));
        const onUnhandled = vi.fn();
        process.on('unhandledRejection', onUnhandled);
        render(<MessageBubble message={mensaje} />);

        copiar();
        await new Promise((r) => setTimeout(r, 0));

        process.off('unhandledRejection', onUnhandled);
        expect(onUnhandled).not.toHaveBeenCalled();
    });
});
