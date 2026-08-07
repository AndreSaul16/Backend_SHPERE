import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatPanel } from '../../src/components/chat/ChatPanel';
import { useChatStore } from '../../src/store/useChatStore';
import { useBillingStore } from '../../src/store/useBillingStore';
import { chatService } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
    chatService: {
        loadSession: vi.fn(),
        streamChat: vi.fn().mockImplementation(() => new Promise(() => { })),
        getSessions: vi.fn().mockResolvedValue([]),
        getSessionHistory: vi.fn().mockResolvedValue({ messages: [] }),
        getPins: vi.fn().mockResolvedValue([]),
        pinMessage: vi.fn().mockResolvedValue(undefined),
        unpinMessage: vi.fn().mockResolvedValue(undefined),
        rateMessage: vi.fn().mockResolvedValue(undefined),
    }
}));

// Mock de framer-motion simplificado para tests
vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const {
            initial, animate, exit, transition,
            layoutId, layout, variants,
            whileHover, whileTap, whileFocus,
            ...domProps
        } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        AnimatePresence: ({ children }: any) => children,
        motion: {
            div: Component,
            span: Component,
            h3: Component,
            p: Component,
            header: Component,
            nav: Component,
            button: Component,
            textarea: Component,
        },
        layoutId: 'test-layout-id'
    };
});

// Mock useNavigate for all tests
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock localStorage for jsdom
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
    };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('ChatPanel - Comportamiento de UI', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        // Mock billing store to prevent network calls from CreditsIndicator refresh()
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    const renderChatPanel = (id = 'test-session') => {
        return render(
            <MemoryRouter initialEntries={[`/chat/${id}`]}>
                <Routes>
                    <Route path="/chat/:sessionId" element={<ChatPanel />} />
                </Routes>
            </MemoryRouter>
        );
    };

    it('debe mostrar el mensaje del usuario inmediatamente al enviar (UI Optimista)', async () => {
        useChatStore.setState({ currentSessionId: 'test-session' });
        renderChatPanel('test-session');

        const input = screen.getByPlaceholderText(/Transmite tu consulta/i);

        fireEvent.change(input, { target: { value: 'Hola SPHERE' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

        await waitFor(() => {
            const state = useChatStore.getState();
            const messages = state.messagesBySession['test-session'] || [];
            expect(messages.some(m => m.content === 'Hola SPHERE')).toBe(true);
        });

        expect((input as HTMLTextAreaElement).value).toBe('');
    });

    it('debe bloquear el input mientras hay una respuesta en curso (Streaming)', async () => {
        useChatStore.setState({
            streamingSessionIds: ['test-session'],
            currentSessionId: 'test-session'
        });

        renderChatPanel('test-session');

        const input = await screen.findByPlaceholderText(/Sistema ocupado/i);
        expect(input).toBeDisabled();
    });

    it('debe activar scrollIntoView cuando llegan nuevos mensajes', async () => {
        const scrollSpy = vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView');

        useChatStore.setState({ currentSessionId: 'scroll-test' });
        renderChatPanel('scroll-test');

        useChatStore.setState({
            messagesBySession: {
                'scroll-test': [{ id: '1', role: 'user', content: 'Prueba scroll', timestamp: new Date() }]
            }
        });

        await waitFor(() => {
            expect(scrollSpy).toHaveBeenCalled();
        });
    });
});

describe('ChatPanel — CreditsIndicator Integration (Task 4.2)', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 3,
            topup_messages_balance: 1,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    const renderChatPanel = (id = 'credits-test') => {
        return render(
            <MemoryRouter initialEntries={[`/chat/${id}`]}>
                <Routes>
                    <Route path="/chat/:sessionId" element={<ChatPanel />} />
                </Routes>
            </MemoryRouter>
        );
    };

    it('renders CreditsIndicator in the header', () => {
        useChatStore.setState({ currentSessionId: 'credits-test' });
        renderChatPanel('credits-test');

        // CreditsIndicator should be rendered with data-testid="credits-indicator"
        const indicator = screen.getByTestId('credits-indicator');
        expect(indicator).toBeDefined();
    });

    it('CreditsIndicator shows free tier label', () => {
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 3,
            topup_messages_balance: 0,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        useChatStore.setState({ currentSessionId: 'credits-test' });
        renderChatPanel('credits-test');

        // Dos nodos legítimos desde 1.12: el rótulo visual y el resumen
        // `sr-only` que anuncia el saldo (§12.6).
        expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
    });

    it('CreditsIndicator click navigates to billing', () => {
        useChatStore.setState({ currentSessionId: 'credits-test' });
        renderChatPanel('credits-test');

        const indicator = screen.getByTestId('credits-indicator');
        fireEvent.click(indicator);
        expect(mockNavigate).toHaveBeenCalledWith('/billing');
    });
});

describe('ChatPanel — Billing Integration (Task 2.2)', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            refresh: vi.fn().mockResolvedValue(undefined),
            decrementOptimistic: vi.fn(),
        });
        vi.clearAllMocks();
    });

    const renderChatPanel = (id = 'billing-test') => {
        return render(
            <MemoryRouter initialEntries={[`/chat/${id}`]}>
                <Routes>
                    <Route path="/chat/:sessionId" element={<ChatPanel />} />
                </Routes>
            </MemoryRouter>
        );
    };

    // El decremento optimista vive en chatService.streamChat (tras response.ok),
    // que aquí está mockeado — su contrato se cubre en
    // tests/services/streamChat.billing.test.ts contra el endpoint MSW real.

    it('calls refresh after streaming stops (isTyping: true → false)', async () => {
        useChatStore.setState({
            currentSessionId: 'billing-test',
            streamingSessionIds: ['billing-test'],
        });
        renderChatPanel('billing-test');

        // Clear calls from CreditsIndicator mount refresh
        vi.mocked(useBillingStore.getState().refresh).mockClear();

        // Stop streaming
        useChatStore.setState({
            streamingSessionIds: [],
        });

        // refresh should be called AFTER streaming completes (not from CreditsIndicator)
        await waitFor(() => {
            expect(useBillingStore.getState().refresh).toHaveBeenCalled();
        });
    });

    it('does NOT call decrementOptimistic when input is empty', () => {
        useChatStore.setState({ currentSessionId: 'billing-test' });
        renderChatPanel('billing-test');
        vi.mocked(useBillingStore.getState().decrementOptimistic).mockClear();

        const input = screen.getByPlaceholderText(/Transmite tu consulta/i);
        // Press Enter with empty input
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

        expect(useBillingStore.getState().decrementOptimistic).not.toHaveBeenCalled();
    });

    it('does NOT call refresh when streaming starts (isTyping: false → true)', () => {
        useChatStore.setState({
            currentSessionId: 'billing-test',
            streamingSessionIds: [], // not streaming
        });
        renderChatPanel('billing-test');
        vi.mocked(useBillingStore.getState().refresh).mockClear();

        // Start streaming — should NOT trigger refresh
        useChatStore.setState({
            streamingSessionIds: ['billing-test'],
        });

        expect(useBillingStore.getState().refresh).not.toHaveBeenCalled();
    });
});
