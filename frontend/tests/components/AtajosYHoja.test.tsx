import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import {
    ATAJOS,
    coincide,
    comboDe,
    esCampoDeTexto,
    teclasDe,
    useAtajo,
} from '../../src/hooks/useShortcuts';
import { ShortcutSheet } from '../../src/components/ui/ShortcutSheet';
import { abrirHojaDeAtajos } from '../../src/lib/atajosBus';

/**
 * Tarea 5.3 · Q9 — atajos y su hoja.
 *
 * El criterio de calidad va por delante del criterio de la tarea: «un atajo que
 * atrape el foco, pise a un lector de pantalla o no se pueda descubrir es peor
 * que no tenerlo». Lo que se fija aquí:
 *
 *  1. Ningún atajo de una sola tecla se cuela dentro de un campo de texto.
 *  2. La hoja se genera del registro, no de una lista escrita a mano — o sea
 *     que no puede quedarse desfasada.
 *  3. La hoja se puede abrir sin saber que `?` existe (desde la paleta) y
 *     también sin teclado.
 */

function pulsar(init: KeyboardEventInit) {
    fireEvent.keyDown(document, init);
}

describe('el emparejamiento de combinaciones', () => {
    it('`mod` acepta ⌘ y Ctrl: un Mac con teclado de PC también tiene atajos', () => {
        expect(coincide(new KeyboardEvent('keydown', { key: 'k', metaKey: true }), 'mod+k')).toBe(true);
        expect(coincide(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), 'mod+k')).toBe(true);
        expect(coincide(new KeyboardEvent('keydown', { key: 'k' }), 'mod+k')).toBe(false);
    });

    it('`?` se compara por el carácter, no por shift+barra', () => {
        // En el teclado español `?` es ⇧+'; pedir `shift+/` dejaría fuera a
        // media Europa.
        expect(coincide(new KeyboardEvent('keydown', { key: '?', shiftKey: true }), '?')).toBe(true);
        expect(coincide(new KeyboardEvent('keydown', { key: '/', shiftKey: true }), '?')).toBe(false);
    });

    it('shift importa: ⌘⏎ y ⌘⇧⏎ no son el mismo atajo', () => {
        const conShift = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, shiftKey: true });
        expect(coincide(conShift, 'mod+shift+enter')).toBe(true);
        expect(coincide(conShift, 'mod+enter')).toBe(false);
    });

    it('reconoce dónde se escribe', () => {
        const input = document.createElement('input');
        const div = document.createElement('div');
        expect(esCampoDeTexto(input)).toBe(true);
        expect(esCampoDeTexto(document.createElement('textarea'))).toBe(true);
        expect(esCampoDeTexto(div)).toBe(false);
    });
});

describe('un atajo no secuestra la escritura', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('una sola tecla NO dispara con el foco en un campo', () => {
        const campo = document.createElement('textarea');
        document.body.appendChild(campo);
        campo.focus();

        const manejador = vi.fn();
        renderHook(() => useAtajo('j', manejador));

        fireEvent.keyDown(campo, { key: 'j' });
        expect(manejador).not.toHaveBeenCalled();

        // Fuera del campo sí.
        pulsar({ key: 'j' });
        expect(manejador).toHaveBeenCalledTimes(1);
    });

    it('con modificador sí dispara dentro del campo: es lo que se pide', () => {
        const campo = document.createElement('textarea');
        document.body.appendChild(campo);
        campo.focus();

        const manejador = vi.fn();
        renderHook(() => useAtajo('mod+b', manejador, { permitirEnCampos: true }));

        fireEvent.keyDown(campo, { key: 'b', ctrlKey: true });
        expect(manejador).toHaveBeenCalledTimes(1);
    });

    it('un atajo calla mientras hay un diálogo abierto', () => {
        const dialogo = document.createElement('div');
        dialogo.setAttribute('role', 'dialog');
        dialogo.setAttribute('aria-modal', 'true');
        document.body.appendChild(dialogo);

        const manejador = vi.fn();
        renderHook(() => useAtajo('j', manejador));
        pulsar({ key: 'j' });
        expect(manejador).not.toHaveBeenCalled();

        dialogo.remove();
        pulsar({ key: 'j' });
        expect(manejador).toHaveBeenCalledTimes(1);
    });

    it('`activo: false` lo apaga sin desmontar nada', () => {
        const manejador = vi.fn();
        renderHook(() => useAtajo('j', manejador, { activo: false }));
        pulsar({ key: 'j' });
        expect(manejador).not.toHaveBeenCalled();
    });
});

describe('cómo se dibujan las teclas', () => {
    it('`mod` es ⌘ en Apple y Ctrl fuera: una hoja que dice Ctrl en un Mac miente', () => {
        expect(teclasDe('mod+k', true)).toEqual(['⌘', 'K']);
        expect(teclasDe('mod+k', false)).toEqual(['Ctrl', 'K']);
        expect(teclasDe('mod+shift+enter', true)).toEqual(['⌘', '⇧', '⏎']);
        expect(teclasDe('escape')).toEqual(['Esc']);
    });
});

describe('la hoja de atajos', () => {
    it('`?` la abre', async () => {
        render(<ShortcutSheet />);
        pulsar({ key: '?', shiftKey: true });
        expect(await screen.findByRole('dialog', { name: /atajos de teclado/i })).toBeInTheDocument();
    });

    it('se puede abrir sin saber que `?` existe — y sin teclado', async () => {
        render(<ShortcutSheet />);
        abrirHojaDeAtajos();
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('Escape la cierra y no atrapa a nadie', async () => {
        render(<ShortcutSheet />);
        abrirHojaDeAtajos();
        await screen.findByRole('dialog');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('lista TODOS los atajos del registro: se genera, no se escribe a mano', async () => {
        render(<ShortcutSheet />);
        abrirHojaDeAtajos();
        await screen.findByRole('dialog');
        for (const atajo of ATAJOS) {
            expect(screen.getByText(atajo.que)).toBeInTheDocument();
        }
    });

    it('dice la regla que evita el secuestro de la escritura', async () => {
        render(<ShortcutSheet />);
        abrirHojaDeAtajos();
        await screen.findByRole('dialog');
        expect(screen.getByText(/ningún atajo de una sola tecla funciona mientras escribes/i))
            .toBeInTheDocument();
    });

    it('`?` no la abre desde un campo de texto: «¿lo hacemos?» no es una orden', async () => {
        const user = userEvent.setup();
        render(
            <>
                <textarea aria-label="compositor" />
                <ShortcutSheet />
            </>,
        );
        await user.click(screen.getByLabelText('compositor'));
        await user.keyboard('?');
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('el registro es coherente', () => {
    it('no hay dos atajos con la misma combinación', () => {
        const combos = ATAJOS.map((a) => a.combo);
        expect(new Set(combos).size).toBe(combos.length);
    });

    it('no hay dos atajos con el mismo id, y `comboDe` los encuentra', () => {
        const ids = ATAJOS.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const a of ATAJOS) expect(comboDe(a.id)).toBe(a.combo);
    });

    it('pedir un atajo que no existe revienta: es un fallo de programación', () => {
        expect(() => comboDe('inventado')).toThrow(/inventado/);
    });
});
