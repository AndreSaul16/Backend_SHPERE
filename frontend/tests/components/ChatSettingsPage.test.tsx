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
import { http, HttpResponse } from 'msw';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../setup';
import { ChatSettingsPage } from '../../src/pages/ChatSettingsPage';
import { useChatStore } from '../../src/store/useChatStore';
import { useBoardSettingsStore } from '../../src/store/useBoardSettingsStore';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';
import type { ChatSession } from '../../src/types';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

// `useNavigate` espiado, pero conservando `MemoryRouter` y el resto del módulo:
// D28 necesita comprobar CUÁNDO se vuelve atrás, y sobre todo cuándo no.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return { ...actual, useNavigate: () => mockNavigate };
});

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

/**
 * Tarea 1.13 — la otra mitad del contrato «un error, un aviso».
 *
 * `updateSessionMetadata` relanza sin avisar (ver `tests/store/avisos.test.ts`)
 * precisamente para que avise esta página, que es la única que sabe si lo que
 * no se ha guardado era el nombre, el color o el avatar. El `toHaveLength(1)`
 * verifica que sólo avisa una de las dos capas: con las dos, este número sería
 * 2 y el usuario vería el mismo fallo repetido.
 */
describe('ChatSettingsPage — avisos de guardado (1.13)', () => {
    beforeEach(() => {
        __resetToastBus();
        const session = makeSession();
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
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

    it('un fallo al guardar el color emite un aviso de error con su motivo', async () => {
        useChatStore.setState({
            updateSessionMetadata: vi.fn(() => Promise.reject(new Error('502 upstream'))),
        } as never);
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));

        renderPage();
        fireEvent.change(screen.getByLabelText('Color de la sesión'), {
            target: { value: '#ff0000' },
        });

        await waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0].variant).toBe('error');
        expect(seen[0].title).toBe('No se pudo guardar el color');
        expect(seen[0].detail).toBe('502 upstream');

        unsubscribe();
    });

    it('el guardado con rebote no apila un aviso por pulsación', async () => {
        useChatStore.setState({
            updateSessionMetadata: vi.fn(() => Promise.reject(new Error('502 upstream'))),
        } as never);
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));

        renderPage();
        const picker = screen.getByLabelText('Color de la sesión');
        fireEvent.change(picker, { target: { value: '#ff0000' } });
        fireEvent.change(picker, { target: { value: '#00ff00' } });
        fireEvent.change(picker, { target: { value: '#0000ff' } });

        await waitFor(() => expect(seen.length).toBeGreaterThan(0));
        // Se emiten varios, pero todos con la misma `dedupeKey`: el
        // `<ToastProvider>` sustituye el anterior en vez de apilarlos, así que
        // en pantalla sólo hay uno. §9.5.
        expect(new Set(seen.map((t) => t.dedupeKey))).toEqual(new Set(['session-color']));
    });
});

/**
 * QA-2 (A) — la «Paleta de Grupo» era código muerto y su ayuda mentía.
 *
 * En una junta la paleta escribía `visual_config.color/theme` de la sesión…
 * y nadie los leía: `ChatPanel:1019` pinta cada burbuja con el `hexColor` del
 * DIRECTOR que habla (`agentColor={isGroupChat ? msgAgent?.hexColor : …}`),
 * decisión deliberada de F5 · §2.8 para que el debate se lea sabiendo quién
 * dice qué. Así que los cinco presets no cambiaban un solo píxel del
 * transcript mientras la ayuda afirmaba «La paleta define los colores de
 * burbujas de todos los miembros» — una promesa falsa sobre un control muerto.
 *
 * El dueño real del color por miembro es la sección «Miembros del Grupo»
 * (`renameAgent`/`updateAgentColor`), que se queda. En un chat 1-a-1 la paleta
 * SÍ manda —ahí `effectiveBubbleColor` gana en `MessageBubble`— y por eso
 * sobrevive, con la ayuda corregida a lo que hace de verdad.
 *
 * NO se implementa «aplicar el color a todos los miembros»: chocaría con la
 * identidad de color por director que §2.8 ya firma.
 */
describe('ChatSettingsPage — la paleta sólo manda en 1-a-1 (QA-2 A)', () => {
    const URL_AJUSTES = 'http://localhost:8000/api/v1/me/board-settings';

    /** La junta necesita su ajuste de debate; sin handler, MSW hace fallar el test. */
    const servidorDeJunta = () =>
        server.use(
            http.get(URL_AJUSTES, () =>
                HttpResponse.json({
                    board_meeting_enabled: false,
                    board_iterations: 1,
                    board_devils_advocate: false,
                }),
            ),
        );

    beforeEach(() => {
        useBoardSettingsStore.getState().reset();
    });

    afterEach(() => {
        useBoardSettingsStore.getState().reset();
        useChatStore.setState({
            sessions: [],
            currentSessionId: null,
            selectedAgentId: 'group-chat',
        });
    });

    it('en una junta no se ofrece ninguna paleta: el color lo manda cada director', async () => {
        servidorDeJunta();
        const session = makeSession({
            session_id: 'session-junta',
            title: 'Junta Directiva',
            base_agent_id: 'group-chat',
            type: 'group',
        });
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
            selectedAgentId: 'group-chat',
        });

        renderPage();
        // La sección de junta ya montada: sin esperarla, la ausencia de la
        // paleta sería cierta por render incompleto y no por el cambio.
        await waitFor(() => expect(screen.getByTestId('board-toggle-chat')).toBeInTheDocument());

        // Se va la sección entera: título, presets y la ayuda que mentía.
        expect(screen.queryByText('Paleta de Grupo')).not.toBeInTheDocument();
        expect(
            screen.queryByText('La paleta define los colores de burbujas de todos los miembros.'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Latón')).not.toBeInTheDocument();

        // Y lo que SÍ decide el color en una junta sigue en su sitio.
        expect(screen.getByText('Miembros del Grupo')).toBeInTheDocument();
        for (const director of ['Oberon', 'Nexus', 'Vortex', 'Ledger']) {
            expect(screen.getByText(director)).toBeInTheDocument();
        }
    });

    it('en un chat 1-a-1 la paleta se queda y su ayuda dice lo que hace de verdad', () => {
        const session = makeSession();
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
            selectedAgentId: 'cto-1',
        });

        renderPage();

        expect(screen.getByText('Frecuencia del Experto (Color)')).toBeInTheDocument();
        expect(screen.getByLabelText('Color de la sesión')).toBeInTheDocument();
        // El color de sesión tiñe las burbujas del AGENTE en ESTA conversación:
        // las del usuario van con `AGENT_HEX.user` fijo (`MessageBubble:349`) y
        // el ajuste no viaja a otros chats del mismo director.
        expect(
            screen.getByText(
                'Personaliza el color de las burbujas de este agente en esta conversación.',
            ),
        ).toBeInTheDocument();
        // Sin junta no hay miembros que personalizar.
        expect(screen.queryByText('Miembros del Grupo')).not.toBeInTheDocument();
    });
});

/**
 * Regresión D28 — el botón «Guardar» era decorativo.
 *
 * Era literalmente `onClick={() => navigate(-1)}`. La fila «El botón dice lo
 * que hace» de DESIGN §11 lo cita por su nombre y por su número de línea como
 * el ejemplo de lo que no se debe hacer.
 *
 * Y no era una queja teórica: el nombre se manda con un rebote de 500ms, así
 * que escribir y pulsar «Guardar» de seguido —que es exactamente lo que hace
 * quien acaba de renombrar la junta— dejaba el PATCH en el aire y salía de la
 * pantalla.
 */
describe('ChatSettingsPage — el botón «Guardar» guarda (D28)', () => {
    beforeEach(() => {
        __resetToastBus();
        mockNavigate.mockClear();
        const session = makeSession();
        useChatStore.setState({
            sessions: [session],
            currentSessionId: session.session_id,
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

    const boton = () => screen.getByTestId('guardar-cambios');

    it('§11: el rótulo es «Guardar cambios», no «Guardar»', () => {
        renderPage();
        expect(boton()).toHaveTextContent('Guardar cambios');
    });

    it('guarda el nombre pendiente del rebote antes de volver atrás', async () => {
        const guardar = vi.fn(() => Promise.resolve());
        useChatStore.setState({ updateSessionMetadata: guardar } as never);
        renderPage();

        // Escribir y pulsar de seguido: el rebote de 500ms sigue en el aire.
        fireEvent.change(screen.getByPlaceholderText('Ej: Oberon'), {
            target: { value: 'Junta de precios' },
        });
        fireEvent.click(boton());

        // Con el bug, `guardar` no se llamaba nunca desde el botón.
        await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
        expect(guardar.mock.calls[0][1]).toMatchObject({
            title: 'Junta de precios',
            visual_config: expect.objectContaining({ name: 'Junta de precios' }),
        });
    });

    it('vuelve atrás sólo cuando el guardado ha ido bien', async () => {
        useChatStore.setState({
            updateSessionMetadata: vi.fn(() => Promise.resolve()),
        } as never);
        renderPage();

        fireEvent.click(boton());

        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(-1));
    });

    it('si el guardado falla, se queda en la pantalla y lo dice', async () => {
        useChatStore.setState({
            updateSessionMetadata: vi.fn(() => Promise.reject(new Error('502 upstream'))),
        } as never);
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        renderPage();

        fireEvent.change(screen.getByPlaceholderText('Ej: Oberon'), {
            target: { value: 'Junta de precios' },
        });
        fireEvent.click(boton());

        await waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0].title).toBe('No se pudo guardar el nombre');
        // Lo peor que podía hacer: decir que guarda, fallar y salir igual.
        expect(mockNavigate).not.toHaveBeenCalledWith(-1);
        // §11 «qué se conservó»: el texto sigue en el campo.
        expect((screen.getByPlaceholderText('Ej: Oberon') as HTMLInputElement).value).toBe(
            'Junta de precios',
        );
        unsubscribe();
    });

    it('mientras guarda, el botón queda en su estado de carga (§9.1)', async () => {
        let resolver: (() => void) | undefined;
        useChatStore.setState({
            updateSessionMetadata: vi.fn(
                () => new Promise<void>((res) => { resolver = () => res(); }),
            ),
        } as never);
        renderPage();

        fireEvent.click(boton());

        await waitFor(() => expect(boton()).toHaveAttribute('aria-busy', 'true'));
        expect(boton()).toBeDisabled();
        // Ancho congelado: la etiqueta sigue en el flujo, sólo invisible.
        expect(boton().querySelector('.invisible')).not.toBeNull();

        await act(async () => { resolver?.(); });
    });
});
