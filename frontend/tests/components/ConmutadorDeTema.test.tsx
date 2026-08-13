/**
 * 6.11 — el conmutador de tres estados.
 *
 * Tres radios y no tres botones: son opciones excluyentes del mismo ajuste, y
 * el grupo de radios es lo que da el «2 de 3» y el recorrido con flechas. Y se
 * aplica al elegir: un tema que hay que confirmar aparte se queda sin confirmar
 * y el usuario cree que la opción está rota — que es exactamente D61.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConmutadorDeTema } from '../../src/components/ui/ConmutadorDeTema';
import { CLAVE_TEMA } from '../../src/lib/tema';

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
});

afterEach(() => vi.unstubAllGlobals());

describe('ConmutadorDeTema (6.11)', () => {
    it('son tres radios de un mismo grupo, no tres botones', () => {
        render(<ConmutadorDeTema />);
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(3);
        radios.forEach((r) => expect(r.getAttribute('name')).toBe('tema'));
        // De partida, «Sistema»: la decisión ya la tomó el usuario en su S.O.
        expect(screen.getByRole('radio', { name: /Sistema/ })).toBeChecked();
    });

    it('elegir aplica el tema en el acto, sin botón de guardar', async () => {
        const user = userEvent.setup();
        render(<ConmutadorDeTema />);
        expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();

        await user.click(screen.getByRole('radio', { name: /Papel/ }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(localStorage.getItem(CLAVE_TEMA)).toBe('light');

        await user.click(screen.getByRole('radio', { name: /Paño/ }));
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('avisa a quien lo compone para que escriba también el perfil', async () => {
        const user = userEvent.setup();
        const alElegir = vi.fn();
        render(<ConmutadorDeTema onElegir={alElegir} />);
        await user.click(screen.getByRole('radio', { name: /Papel/ }));
        expect(alElegir).toHaveBeenCalledWith('light');
    });

    it('bajo «Sistema» se dice cuál está siguiendo: es la única opción cuyo resultado no se lee', () => {
        render(<ConmutadorDeTema />);
        expect(screen.getByText(/tu aparato pide el tema/)).toBeInTheDocument();
        expect(screen.getByText('oscuro')).toBeInTheDocument();
    });

    it('con una elección explícita, esa frase sobra y desaparece', async () => {
        const user = userEvent.setup();
        render(<ConmutadorDeTema />);
        await user.click(screen.getByRole('radio', { name: /Papel/ }));
        expect(screen.queryByText(/tu aparato pide el tema/)).toBeNull();
    });
});
