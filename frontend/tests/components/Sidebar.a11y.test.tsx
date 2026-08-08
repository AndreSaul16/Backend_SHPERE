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
 * Y Q5, que cambia la defensa de sitio: el diálogo de «¿seguro?» se pulsa sin
 * leer, así que ya no lo hay. La junta desaparece al instante y se puede
 * recuperar entera durante ocho segundos, porque hasta entonces no se ha
 * borrado nada de verdad.
 *
 * Este fichero NO simula framer-motion a propósito: la trampa de foco y el
 * retorno del foco al disparador dependen de refs reales.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../../src/components/sidebar/Sidebar';
import { useChatStore } from '../../src/store/useChatStore';
import { useAuth } from '../../src/contexts/AuthContext';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';
import { chatService } from '../../src/services/api';
import {
    VENTANA_DESHACER_MS,
    olvidarBorradosPendientes,
} from '../../src/store/chat/sessionsSlice';

vi.mock('../../src/services/api', async () => {
    const actual = await vi.importActual<typeof import('../../src/services/api')>(
        '../../src/services/api',
    );
    return {
        ...actual,
        chatService: { ...actual.chatService, deleteSession: vi.fn(() => Promise.resolve()) },
        adminService: { ...actual.adminService, isAdmin: vi.fn(() => Promise.resolve(false)) },
    };
});

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
            messagesBySession: {},
        });
        olvidarBorradosPendientes();
    });

    afterEach(() => {
        // Un plazo vivo entre casos borraría una sesión del caso siguiente.
        olvidarBorradosPendientes();
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

    // ── Q5: borrar con deshacer ───────────────────────────────────────────
    it('Eliminar quita la junta de la vista y ofrece deshacerlo, nombrándola', async () => {
        const user = userEvent.setup();
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));

        // Ya no hay diálogo: la defensa es el deshacer, que actúa después.
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('link', { name: /Precios 2026/ })).toBeNull();

        expect(seen).toHaveLength(1);
        expect(seen[0].title).toBe('Junta «Precios 2026» eliminada');
        expect(seen[0].action?.label).toBe('Deshacer');
        unsubscribe();
    });

    it('no se llama al backend dentro de la ventana para deshacer', async () => {
        const user = userEvent.setup();
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));

        // Lo importante de Q5: durante la ventana NO se ha borrado nada. Si el
        // usuario deshace, no hay nada que revertir en el servidor.
        expect(vi.mocked(chatService.deleteSession)).not.toHaveBeenCalled();
    });

    it('«Deshacer» devuelve la junta a su sitio, con su hilo', async () => {
        const user = userEvent.setup();
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        useChatStore.setState({
            messagesBySession: { s1: [{ id: 'm1', role: 'user', content: 'hola', timestamp: new Date() }] },
        } as never);
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));
        seen[0].action!.onClick();

        const estado = useChatStore.getState();
        // A su hueco original, no arriba del todo: reaparecer en otro sitio
        // también es perder algo.
        expect(estado.sessions.map((s) => s.session_id)).toEqual(['s1', 's2', 's3']);
        expect(estado.messagesBySession.s1).toHaveLength(1);
        expect(vi.mocked(chatService.deleteSession)).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('si el borrado real falla, la junta vuelve sola y se dice por qué', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        vi.mocked(chatService.deleteSession).mockRejectedValueOnce(new Error('502 upstream'));
        renderSidebar();

        await user.click(screen.getByRole('button', { name: 'Acciones de Precios 2026' }));
        await user.click(screen.getByRole('menuitem', { name: 'Eliminar' }));

        await act(async () => {
            vi.advanceTimersByTime(VENTANA_DESHACER_MS + 50);
            await Promise.resolve();
            await Promise.resolve();
        });

        // Reversión visible y explicada (§11): vuelve a la lista y se dice que
        // no se ha perdido nada.
        expect(useChatStore.getState().sessions.map((s) => s.session_id)).toContain('s1');
        const fallo = seen.find((t) => t.variant === 'error');
        expect(fallo?.title).toBe('«Precios 2026» no se ha podido eliminar');
        expect(fallo?.detail).toMatch(/intactos/);
        unsubscribe();
        vi.useRealTimers();
    });
});
