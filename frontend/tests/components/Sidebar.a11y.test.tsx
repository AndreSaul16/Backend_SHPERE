/**
 * Sidebar: D10 (1.4), D13 (1.5) y D18 (1.9).
 *
 * Los tres eran fallos que no se ven en una captura de pantalla:
 *
 *  D10 — El buscador estaba pintado pero era un `<input>` sin `value` ni
 *        `onChange`. Escribir no filtraba nada.
 *  D13 — El botón del menú de cada sesión vivía DENTRO del `<Link>`: HTML
 *        inválido (§12.8), y el menú no se podía cerrar con teclado.
 *  D18 — El borrado se confirmaba con «¿Confirmar borrado?» + Sí/No dentro del
 *        propio menú, sin nombrar la sesión ni decir qué se pierde (§11).
 *
 * Este fichero NO simula framer-motion a propósito: la trampa de foco y el
 * retorno del foco al disparador dependen de refs reales.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../../src/components/sidebar/Sidebar';
import { useChatStore } from '../../src/store/useChatStore';
import { useAuth } from '../../src/contexts/AuthContext';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';

vi.mock('../../src/contexts/AuthContext', () => ({
    useAuth: vi.fn(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));

const session = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    session_id: id,
    title,
    created_at: '2026-07-01T10:00:00Z',
    base_agent_id: 'ceo-1',
    ...extra,
});

function renderSidebar() {
    return render(
        <MemoryRouter>
            <Sidebar />
        </MemoryRouter>,
    );
}

describe('Sidebar — buscador, menú y confirmación', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetToastBus();
        (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            user: { uid: 'u', email: 'a@b.c', displayName: 'Ana', photoURL: null },
            loading: false,
        });
        useChatStore.setState({
            sessions: [
                session('s1', 'Precios 2026'),
                session('s2', 'Análisis de mercado'),
                session('s3', 'Contratación'),
            ],
            currentSessionId: 's1',
            streamingSessionIds: [],
            coreAgents: [],
            customAgents: [],
        });
    });

    // ── D10 ───────────────────────────────────────────────────────────────
    it('el buscador está etiquetado y filtra la lista al teclear', async () => {
        const user = userEvent.setup();
        renderSidebar();

        const search = screen.getByLabelText('Buscar juntas');
        expect(screen.getByText('Precios 2026')).toBeInTheDocument();

        await user.type(search, 'contrat');
        expect(screen.getByText('Contratación')).toBeInTheDocument();
        expect(screen.queryByText('Precios 2026')).toBeNull();
        expect(screen.queryByText('Análisis de mercado')).toBeNull();
    });

    it('el filtro ignora acentos: «analisis» encuentra «Análisis de mercado»', async () => {
        const user = userEvent.setup();
        renderSidebar();
        await user.type(screen.getByLabelText('Buscar juntas'), 'analisis');
        expect(screen.getByText('Análisis de mercado')).toBeInTheDocument();
    });

    it('una búsqueda sin resultados dice qué hacer, no deja el hueco en blanco', async () => {
        const user = userEvent.setup();
        renderSidebar();
        await user.type(screen.getByLabelText('Buscar juntas'), 'zzzz');
        expect(screen.getByText(/Ninguna junta se llama así/)).toBeInTheDocument();
    });

    // ── D13 ───────────────────────────────────────────────────────────────
    it('el disparador del menú NO está dentro del enlace de la sesión', () => {
        renderSidebar();
        const trigger = screen.getByRole('button', { name: 'Acciones de Precios 2026' });
        expect(trigger.closest('a')).toBeNull();
    });

    it('el disparador declara aria-haspopup y aria-expanded', async () => {
        const user = userEvent.setup();
        renderSidebar();
        const trigger = screen.getByRole('button', { name: 'Acciones de Precios 2026' });
        expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await user.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menu', { name: 'Acciones de Precios 2026' })).toBeInTheDocument();
    });

    it('el menú se abre con teclado y el foco entra en su primera opción', async () => {
        const user = userEvent.setup();
        renderSidebar();
        const trigger = screen.getByRole('button', { name: 'Acciones de Precios 2026' });
        trigger.focus();
        await user.keyboard('{Enter}');

        const menu = screen.getByRole('menu');
        const items = within(menu).getAllByRole('menuitem');
        expect(items[0]).toHaveFocus();
    });

    it('las flechas recorren el menú en círculo', async () => {
        const user = userEvent.setup();
        renderSidebar();
        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));

        const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
        expect(items[0]).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(items[1]).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(items[0]).toHaveFocus();
        await user.keyboard('{ArrowUp}');
        expect(items[1]).toHaveFocus();
    });

    it('Escape cierra el menú y devuelve el foco al disparador', async () => {
        const user = userEvent.setup();
        renderSidebar();
        const trigger = screen.getByRole('button', { name: 'Acciones de Precios 2026' });
        await user.click(trigger);
        expect(screen.getByRole('menu')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull();
        expect(trigger).toHaveFocus();
    });

    it('las acciones de fila son alcanzables con Tab', async () => {
        const user = userEvent.setup();
        renderSidebar();
        const link = screen.getByRole('link', { name: /Precios 2026/ });
        link.focus();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Acciones de Precios 2026' })).toHaveFocus();
    });

    it('la sesión activa se marca con aria-current, no sólo con color', () => {
        renderSidebar();
        expect(screen.getByRole('link', { name: /Precios 2026/ })).toHaveAttribute(
            'aria-current',
            'page',
        );
        expect(screen.getByRole('link', { name: /Contratación/ })).not.toHaveAttribute(
            'aria-current',
        );
    });

    // ── D18 ───────────────────────────────────────────────────────────────
    it('Eliminar abre un diálogo que nombra la sesión y su consecuencia', async () => {
        const user = userEvent.setup();
        renderSidebar();
        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAccessibleName(/Precios 2026/);
        expect(within(dialog).getByText(/No se puede deshacer/)).toBeInTheDocument();
        // §9.4: el foco arranca en Cancelar.
        expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    });

    it('el diálogo de borrado no llama a deleteSession hasta que se confirma', async () => {
        const user = userEvent.setup();
        const deleteSession = vi.fn(() => Promise.resolve());
        useChatStore.setState({ deleteSession } as never);
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
        expect(deleteSession).not.toHaveBeenCalled();

        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
        );
        expect(deleteSession).toHaveBeenCalledWith('s1');
    });

    it('un fallo al borrar emite un aviso de error con su motivo', async () => {
        const user = userEvent.setup();
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        useChatStore.setState({
            deleteSession: vi.fn(() => Promise.reject(new Error('502 upstream'))),
        } as never);
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
        );

        // Antes esto era un `console.error`: un fallo invisible para el usuario.
        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe('error');
        expect(seen[0].title).toBe('No se pudo eliminar la junta');
        expect(seen[0].detail).toBe('502 upstream');
        unsubscribe();
    });
});
