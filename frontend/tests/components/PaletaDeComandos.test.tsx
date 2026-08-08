import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../../src/components/ui/CommandPalette';
import { useChatStore } from '../../src/store/useChatStore';
import { abrirPaletaDeComandos } from '../../src/lib/atajosBus';
import { puntuar, filtrarDifuso, normalizar } from '../../src/lib/busquedaDifusa';

/**
 * Tarea 5.2 · Q4 — la paleta de comandos.
 *
 * Criterio del plan: «⌘K abre; navegable con teclado; Escape cierra; ≥ 5 tipos
 * de resultado». Y la regla de casa que va por encima: a 390px una paleta sin
 * salida es un fallo, y un atajo que sólo existe como combinación deja la
 * función inalcanzable en móvil — de ahí el bus que abre la paleta desde el
 * cajón.
 */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

function montar() {
    return render(
        <MemoryRouter>
            <CommandPalette />
        </MemoryRouter>,
    );
}

const abrirConTeclado = () =>
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

beforeEach(() => {
    useChatStore.getState().resetState();
    useChatStore.setState({
        sessions: [
            { session_id: 's1', title: 'Precios 2026' },
            { session_id: 's2', title: 'Análisis de runway' },
        ] as never,
    });
    mockNavigate.mockReset();
});

describe('la puntuación difusa', () => {
    it('ignora los acentos: «analisis» encuentra «Análisis»', () => {
        expect(normalizar('Análisis')).toBe('analisis');
        expect(puntuar('Análisis de runway', 'analisis')).not.toBeNull();
    });

    it('la coincidencia literal que abre la cadena gana a la desperdigada', () => {
        const literal = puntuar('Precios 2026', 'preci')!;
        const suelta = puntuar('Panel de recursos internos comparados', 'preci')!;
        expect(literal).toBeGreaterThan(suelta);
    });

    it('las iniciales encuentran: «gtm» sobre «Go-To-Market»', () => {
        expect(puntuar('Go-To-Market', 'gtm')).not.toBeNull();
    });

    it('lo que no casa se descarta, no se cuela con puntuación baja', () => {
        expect(puntuar('Precios 2026', 'zzz')).toBeNull();
    });

    it('sin consulta devuelve la lista tal cual: abrir y ver lo reciente', () => {
        const items = ['a', 'b', 'c'];
        expect(filtrarDifuso(items, '   ', (x) => x)).toEqual(items);
    });
});

describe('abrir y cerrar', () => {
    it('⌘K / Ctrl+K la abre', async () => {
        montar();
        expect(screen.queryByRole('dialog')).toBeNull();
        abrirConTeclado();
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('⌘K otra vez la cierra: es un conmutador, no un abridor', async () => {
        montar();
        abrirConTeclado();
        await screen.findByRole('dialog');
        abrirConTeclado();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('Escape cierra', async () => {
        montar();
        abrirConTeclado();
        await screen.findByRole('dialog');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('se puede abrir sin teclado — a 390px no hay ⌘K que pulsar', async () => {
        montar();
        abrirPaletaDeComandos();
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('el velo cierra: la salida táctil de la hoja en móvil', async () => {
        montar();
        abrirPaletaDeComandos();
        await screen.findByRole('dialog');
        fireEvent.click(screen.getByTestId('modal-backdrop'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});

describe('lo que encuentra', () => {
    it('los cinco tipos de resultado están al abrir', async () => {
        montar();
        abrirPaletaDeComandos();
        await screen.findByRole('dialog');
        for (const grupo of ['Acciones', 'Juntas', 'Directores', 'Ajustes', 'Plantillas']) {
            expect(screen.getByRole('group', { name: grupo })).toBeInTheDocument();
        }
    });

    it('filtra por lo tecleado, sin distinguir acentos', async () => {
        const user = userEvent.setup();
        montar();
        abrirPaletaDeComandos();
        await screen.findByRole('dialog');

        await user.type(screen.getByRole('combobox'), 'analisis de runway');
        const opciones = screen.getAllByRole('option');
        expect(opciones).toHaveLength(1);
        expect(opciones[0]).toHaveTextContent('Análisis de runway');
    });

    it('una consulta sin resultados lo dice y ofrece salida', async () => {
        const user = userEvent.setup();
        montar();
        abrirPaletaDeComandos();
        await screen.findByRole('dialog');

        await user.type(screen.getByRole('combobox'), 'zzzzz');
        expect(screen.getByText(/nada coincide/i)).toBeInTheDocument();
        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });
});

describe('se maneja entera con el teclado', () => {
    it('el foco NO se mueve de la caja: el activo se marca con aria-activedescendant', async () => {
        montar();
        abrirPaletaDeComandos();
        const caja = await screen.findByRole('combobox');
        await waitFor(() => expect(caja).toHaveFocus());

        const primero = caja.getAttribute('aria-activedescendant');
        expect(primero).toBeTruthy();

        fireEvent.keyDown(caja, { key: 'ArrowDown' });
        expect(caja.getAttribute('aria-activedescendant')).not.toBe(primero);
        // Y sigue siendo la caja la que tiene el foco: si saltara a la opción,
        // el lector leería opción y caja alternativamente.
        expect(caja).toHaveFocus();
    });

    it('la primera opción está activa desde el principio', async () => {
        montar();
        abrirPaletaDeComandos();
        const caja = await screen.findByRole('combobox');
        const activo = screen.getAllByRole('option')[0];
        expect(caja).toHaveAttribute('aria-activedescendant', activo.id);
        expect(activo).toHaveAttribute('aria-selected', 'true');
    });

    it('⏎ ejecuta el resultado activo', async () => {
        const user = userEvent.setup();
        montar();
        abrirPaletaDeComandos();
        const caja = await screen.findByRole('combobox');

        await user.type(caja, 'precios 2026');
        fireEvent.keyDown(caja, { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/chat/s1');
    });

    it('teclear devuelve el cursor arriba, para que ⏎ no ejecute un fantasma', async () => {
        const user = userEvent.setup();
        montar();
        abrirPaletaDeComandos();
        const caja = await screen.findByRole('combobox');

        fireEvent.keyDown(caja, { key: 'ArrowDown' });
        fireEvent.keyDown(caja, { key: 'ArrowDown' });
        await user.type(caja, 'runway');
        expect(caja).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    });

    it('las opciones quedan fuera del recorrido de tabulación', async () => {
        montar();
        abrirPaletaDeComandos();
        await screen.findByRole('combobox');
        for (const opcion of screen.getAllByRole('option')) {
            expect(opcion).toHaveAttribute('tabindex', '-1');
        }
    });
});
