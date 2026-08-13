/**
 * Regresión D47 — el mismo ajuste de junta, implementado dos veces.
 *
 * `board_meeting_enabled` de `/me/board-settings` tenía tres dueños, cada uno
 * con su propio estado y su propio `fetch`:
 *
 *   - `ChatSettingsPage`     → `useState(boardEnabled)`
 *   - `BoardMeetingSettings` → `useState(settings)`
 *   - `AgentSelectorModal`   → escritura directa por `chatService`, sin estado
 *
 * Nada las sincronizaba, así que las dos pantallas podían enseñar el mismo
 * interruptor en posiciones contrarias y el usuario no tenía forma de saber
 * cuál mandaba.
 *
 * El criterio de la tarea 6.7 es literal: «las dos vistas nunca muestran
 * valores distintos». Así que se montan LAS DOS a la vez y se comparan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../setup';
import { ChatSettingsPage } from '../../src/pages/ChatSettingsPage';
import { BoardMeetingSettings } from '../../src/pages/settings/BoardMeetingSettings';
import { useChatStore } from '../../src/store/useChatStore';
import { useBoardSettingsStore } from '../../src/store/useBoardSettingsStore';
import type { ChatSession } from '../../src/types';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

const URL_AJUSTES = 'http://localhost:8000/api/v1/me/board-settings';

/** El backend, con su valor guardado. */
function servidorConDebate(inicial: boolean) {
    const estado = { board_meeting_enabled: inicial, board_iterations: 1, board_devils_advocate: false };
    server.use(
        http.get(URL_AJUSTES, () => HttpResponse.json(estado)),
        http.patch(URL_AJUSTES, async ({ request }) => {
            const patch = (await request.json()) as Record<string, boolean>;
            Object.assign(estado, patch);
            return HttpResponse.json(estado);
        }),
    );
    return estado;
}

const sesionDeGrupo = (): ChatSession => ({
    session_id: 'session-junta',
    user_id: 'default_user',
    title: 'Junta Directiva',
    base_agent_id: 'group-chat',
    agent_ref_type: 'core',
    type: 'group',
    visual_config: {},
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: new Date().toISOString(),
});

/** Las dos pantallas del mismo ajuste, a la vez. */
const LasDosVistas = () => (
    <MemoryRouter>
        <ChatSettingsPage />
        <BoardMeetingSettings />
    </MemoryRouter>
);

// Por `data-testid` y no por rol: en la app estas dos pantallas nunca están a
// la vez, así que comparten `aria-label` a propósito; aquí sí conviven.
const interruptorChat = () => screen.getByTestId('board-toggle-chat');
const interruptorAjustes = () => screen.getByTestId('board-toggle-settings');

describe('D47 — un solo ajuste de debate para las dos vistas', () => {
    beforeEach(() => {
        useBoardSettingsStore.getState().reset();
        const session = sesionDeGrupo();
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
            selectedAgentId: 'group-chat',
        });
    });

    afterEach(() => {
        useBoardSettingsStore.getState().reset();
        useChatStore.setState({ sessions: [], currentSessionId: null, selectedAgentId: 'group-chat' });
    });

    it('las dos vistas arrancan mostrando lo mismo que el servidor', async () => {
        servidorConDebate(true);
        render(<LasDosVistas />);

        await waitFor(() => expect(interruptorAjustes()).toBeInTheDocument());
        expect(interruptorChat()).toHaveAttribute('aria-checked', 'true');
        expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'true');
    });

    it('apagarlo desde Configuración del chat lo apaga también en Ajustes', async () => {
        servidorConDebate(true);
        render(<LasDosVistas />);
        await waitFor(() => expect(interruptorChat()).toHaveAttribute('aria-checked', 'true'));

        fireEvent.click(interruptorChat());

        // Con dos `useState` independientes, esta segunda vista se quedaba en
        // «true» enseñando un ajuste que ya no existía.
        await waitFor(() => expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'false'));
        expect(interruptorChat()).toHaveAttribute('aria-checked', 'false');
    });

    it('apagarlo desde Ajustes lo apaga también en Configuración del chat', async () => {
        servidorConDebate(true);
        render(<LasDosVistas />);
        await waitFor(() => expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'true'));

        fireEvent.click(interruptorAjustes());

        await waitFor(() => expect(interruptorChat()).toHaveAttribute('aria-checked', 'false'));
        expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'false');
    });

    it('activarlo desde el modal de junta se ve en las dos vistas', async () => {
        servidorConDebate(false);
        render(<LasDosVistas />);
        await waitFor(() => expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'false'));

        // Es lo que hace `AgentSelectorModal.handleActivateBoard`: el TERCER
        // sitio que escribía este ajuste, y que antes no se veía en ninguna de
        // las dos pantallas hasta recargar.
        await act(async () => {
            await useBoardSettingsStore.getState().setEnabled(true, false);
        });

        expect(interruptorChat()).toHaveAttribute('aria-checked', 'true');
        expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'true');
    });

    it('si el guardado falla, ninguna de las dos vistas mueve el interruptor', async () => {
        servidorConDebate(true);
        render(<LasDosVistas />);
        await waitFor(() => expect(interruptorChat()).toHaveAttribute('aria-checked', 'true'));

        server.use(http.patch(URL_AJUSTES, () => new HttpResponse(null, { status: 500 })));
        fireEvent.click(interruptorChat());

        // Las tres comprobaciones van DENTRO del mismo `waitFor`: el aviso es
        // efímero —una recarga posterior de los ajustes lo limpia—, así que
        // comprobarlas en tiempos distintos las haría dependientes del reloj.
        // §11: qué pasó, qué se conservó, y una salida.
        await waitFor(() => {
            expect(screen.getAllByText(/No se ha podido guardar el cambio/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/El debate sigue como estaba/).length).toBeGreaterThan(0);
            expect(screen.getAllByRole('button', { name: /Volver a consultarlo/ }).length).toBeGreaterThan(0);
        });
        expect(interruptorChat()).toHaveAttribute('aria-checked', 'true');
        expect(interruptorAjustes()).toHaveAttribute('aria-checked', 'true');
    });
});

describe('D47 — el store de ajustes de junta', () => {
    beforeEach(() => useBoardSettingsStore.getState().reset());
    afterEach(() => useBoardSettingsStore.getState().reset());

    it('`load` trae el valor del servidor y marca `loaded`', async () => {
        servidorConDebate(true);

        await useBoardSettingsStore.getState().load();

        const s = useBoardSettingsStore.getState();
        expect(s.enabled).toBe(true);
        expect(s.loaded).toBe(true);
        expect(s.error).toBeNull();
    });

    it('un `load` que falla no inventa un valor', async () => {
        server.use(http.get(URL_AJUSTES, () => new HttpResponse(null, { status: 500 })));

        await useBoardSettingsStore.getState().load();

        const s = useBoardSettingsStore.getState();
        expect(s.loaded).toBe(false);
        // El fallo va partido en dos: qué pasó y qué se conserva. La pantalla
        // pinta el título como título y añade la salida.
        expect(s.error?.title).toMatch(/No se ha podido consultar/);
        expect(s.error?.detail).toMatch(/sigue guardada/);
    });

    it('`reset` deja el ajuste sin cargar (cambio de cuenta, A6)', async () => {
        servidorConDebate(true);
        await useBoardSettingsStore.getState().load();
        expect(useBoardSettingsStore.getState().enabled).toBe(true);

        useBoardSettingsStore.getState().reset();

        expect(useBoardSettingsStore.getState().enabled).toBe(false);
        expect(useBoardSettingsStore.getState().loaded).toBe(false);
    });
});
