/**
 * Regresión D03 — Rules of Hooks en ChatSettingsPage.
 *
 * El componente hacía un early return ("Sin chat activo") ANTES de declarar
 * `useState(baseName)` y su `useEffect` de sincronización. Al navegar a
 * /chat/settings con la sesión todavía cargando, el primer render ejecutaba
 * menos hooks; cuando la sesión llegaba, React veía más hooks que en el render
 * anterior y lanzaba "Rendered more hooks than during the previous render",
 * reventando la página.
 *
 * Este test reproduce esa secuencia exacta: render sin sesión → llega la
 * sesión → segundo render. Con el bug presente, el segundo render lanza.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatSettingsPage } from '../../src/pages/ChatSettingsPage';
import { useChatStore } from '../../src/store/useChatStore';
import type { ChatSession } from '../../src/types';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
    session_id: 'session-d03',
    user_id: 'default_user',
    title: 'Arquitectura Cloud',
    base_agent_id: 'cto-1',
    agent_ref_type: 'core',
    type: 'direct',
    visual_config: {},
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: new Date().toISOString(),
    ...overrides,
});

const renderPage = () =>
    render(
        <MemoryRouter>
            <ChatSettingsPage />
        </MemoryRouter>,
    );

describe('ChatSettingsPage — Rules of Hooks (D03)', () => {
    beforeEach(() => {
        // Estado "sesión aún cargando": sin sesión activa y con un agente
        // individual seleccionado (evita el fetch de board-settings del grupo).
        useChatStore.setState({
            sessions: [],
            currentSessionId: null,
            selectedAgentId: 'cto-1',
        });
    });

    afterEach(() => {
        useChatStore.setState({
            sessions: [],
            currentSessionId: null,
            selectedAgentId: 'group-chat',
        });
    });

    it('muestra el fallback "Sin chat activo" mientras no hay sesión', () => {
        renderPage();

        expect(screen.getByText('Sin chat activo')).toBeInTheDocument();
    });

    it('no lanza "Rendered more hooks" cuando la sesión llega después del primer render', () => {
        renderPage();
        expect(screen.getByText('Sin chat activo')).toBeInTheDocument();

        // La sesión llega en un render POSTERIOR: aquí es donde el bug rompía.
        expect(() => {
            act(() => {
                const session = makeSession();
                useChatStore.setState({
                    sessions: [session],
                    currentSessionId: session.session_id,
                });
            });
        }).not.toThrow();

        expect(screen.queryByText('Sin chat activo')).not.toBeInTheDocument();
        expect(screen.getByText('Configuración')).toBeInTheDocument();
    });

    it('sincroniza el input de nombre con la sesión que llega tarde', () => {
        renderPage();

        act(() => {
            const session = makeSession({ visual_config: { name: 'Nexus Renombrado' } });
            useChatStore.setState({
                sessions: [session],
                currentSessionId: session.session_id,
            });
        });

        // El estado local arrancó vacío (sin sesión) y el efecto de
        // sincronización lo rellena al llegar el dato.
        const input = screen.getByPlaceholderText('Ej: Oberon') as HTMLInputElement;
        expect(input.value).toBe('Nexus Renombrado');
    });

    // Dirección inversa: si algún hook quedara por debajo del early return,
    // pasar de "con sesión" a "sin sesión" lanzaría "Rendered fewer hooks".
    it('no lanza "Rendered fewer hooks" cuando la sesión desaparece', () => {
        const session = makeSession();
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
        });

        renderPage();
        expect(screen.getByText('Configuración')).toBeInTheDocument();

        expect(() => {
            act(() => {
                useChatStore.setState({ sessions: [], currentSessionId: null });
            });
        }).not.toThrow();

        expect(screen.getByText('Sin chat activo')).toBeInTheDocument();
    });
});
