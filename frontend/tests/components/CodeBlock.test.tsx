import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CodeBlock } from '../../src/components/artifacts/CodeBlock';
import type { Artifact } from '../../src/types/artifact';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';

const makeArtifact = (overrides: Partial<Artifact>): Artifact => ({
    id: 'code-1',
    type: 'code',
    title: 'Snippet',
    content: '',
    createdAt: new Date(),
    ...overrides,
});

describe('CodeBlock Component', () => {
    it('renders the code content', () => {
        const code = `function test() { return true; }`;
        // CodeBlock now takes a single `artifact` prop and renders the code through
        // react-syntax-highlighter, which tokenizes the source across many spans.
        // Assert against the combined text content rather than a single text node.
        const { container } = render(
            <CodeBlock artifact={makeArtifact({ content: code, language: 'javascript' })} />
        );
        expect(container.textContent).toContain('function');
        expect(container.textContent).toContain('test');
    });

    it('handles copy button (basic render check)', () => {
        render(<CodeBlock artifact={makeArtifact({ content: 'const a = 1;', language: 'typescript' })} />);
        // The toolbar exposes copy and download buttons.
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
    });
});

/**
 * Regresión D36 — copiar podía fallar en silencio absoluto.
 *
 * `await navigator.clipboard.writeText(...)` + `setCopied(true)` sin
 * `try/catch`. El portapapeles falla más de lo que parece: contexto no seguro,
 * permiso denegado, documento sin foco, o `navigator.clipboard` ausente.
 *
 * NOTA sobre el enunciado original del hallazgo («muestra ✓ aunque falle»): el
 * `await` va ANTES del `setCopied(true)`, así que con la promesa rechazada el ✓
 * no se pinta. Lo que pasaba era **nada**: ni cambio en el botón, ni aviso, y
 * el rechazo quedaba como promesa sin dueño. Ver la nota larga en
 * `MessageBubble.test.tsx`.
 */
describe('CodeBlock — copiar al portapapeles (D36)', () => {
    const artifact = makeArtifact({ content: 'const a = 1;', language: 'typescript' });
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
    const copiar = (container: HTMLElement) =>
        fireEvent.click(container.querySelector('[title="Copiar código"]')!);

    it('con la copia hecha, el ✓ aparece', async () => {
        writeText.mockResolvedValue(undefined);
        const { container } = render(<CodeBlock artifact={artifact} />);

        copiar(container);

        await waitFor(() => expect(container.querySelector('.text-success')).not.toBeNull());
        expect(writeText).toHaveBeenCalledWith('const a = 1;');
    });

    it('si la copia falla, NO aparece el ✓', async () => {
        writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
        const { container } = render(<CodeBlock artifact={artifact} />);

        copiar(container);

        // Guardia: el arreglo no puede introducir el ✓ mentiroso que el
        // enunciado del hallazgo daba por hecho.
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(container.querySelector('.text-success')).toBeNull();
    });

    it('si la copia falla, lo dice (§11: qué pasó, qué hacer, qué se conservó)', async () => {
        writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        const { container } = render(<CodeBlock artifact={artifact} />);

        copiar(container);

        await waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0].variant).toBe('error');
        expect(seen[0].title).toBe('No se pudo copiar el código');
        unsubscribe();
    });

    it('el fallo no deja una promesa rechazada sin dueño', async () => {
        writeText.mockRejectedValue(new Error('boom'));
        const onUnhandled = vi.fn();
        process.on('unhandledRejection', onUnhandled);
        const { container } = render(<CodeBlock artifact={artifact} />);

        copiar(container);
        await new Promise((r) => setTimeout(r, 0));

        process.off('unhandledRejection', onUnhandled);
        expect(onUnhandled).not.toHaveBeenCalled();
    });
});
