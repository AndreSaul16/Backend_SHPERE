import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatPanel } from '../../src/components/chat/ChatPanel';
import { useChatStore } from '../../src/store/useChatStore';
import { useBillingStore } from '../../src/store/useBillingStore';

/**
 * Tarea 5.6 · Q10 / B4 — el coste y el saldo se declaran ANTES de gastarse.
 *
 * El fallo que cierra: con tres créditos, el usuario escribía sus seis líneas
 * de contexto, pulsaba «convocar» y sólo entonces el 402 le abría el paywall
 * encima de una junta a medias. El upsell llegaba tarde y castigaba el trabajo
 * ya hecho.
 *
 * Lo que se fija:
 *  · el aviso aparece SIN haber escrito nada;
 *  · el botón lleva coste y saldo en su nombre accesible (el número solo, al
 *    lado de un avión de papel, no dice qué es);
 *  · con saldo corto, pulsar abre el paywall y NO gasta ni envía;
 *  · con saldo desconocido no se inventa un cero — sería un aviso en falso.
 */

vi.mock('../../src/services/api', () => ({
    chatService: {
        streamChat: vi.fn().mockImplementation(() => new Promise(() => {})),
        getSessions: vi.fn().mockResolvedValue([]),
        getSessionHistory: vi.fn().mockResolvedValue({ messages: [] }),
        getPins: vi.fn().mockResolvedValue([]),
        loadSession: vi.fn(),
    },
}));

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const {
            initial, animate, exit, transition, layoutId, layout, variants,
            whileHover, whileTap, whileFocus, ...domProps
        } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const abrirPaywall = vi.fn();

function montarJunta(saldo: { pro: number; topup?: number; loaded?: boolean }) {
    useBillingStore.setState({
        plan_id: 'free',
        pro_messages_balance: saldo.pro,
        topup_messages_balance: saldo.topup ?? 0,
        loaded: saldo.loaded ?? true,
        refresh: vi.fn().mockResolvedValue(undefined),
        openPaywall: abrirPaywall,
    });
    useChatStore.setState({
        currentSessionId: 'junta',
        selectedAgentId: 'group-chat',
    });
    return render(
        <MemoryRouter initialEntries={['/chat/junta']}>
            <Routes>
                <Route path="/chat/:sessionId" element={<ChatPanel />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    useChatStore.getState().resetState();
    localStorage.clear();
    abrirPaywall.mockReset();
    mockNavigate.mockReset();
});

describe('el coste y el saldo viajan juntos', () => {
    it('el botón dice qué cuesta y qué queda, con saldo suficiente', () => {
        montarJunta({ pro: 25 });
        expect(
            screen.getByRole('button', { name: /convocar junta · 5 créditos · te quedan 25/i }),
        ).toBeInTheDocument();
    });

    it('a 390px el saldo lo lleva la línea bajo el compositor, que sí cabe', () => {
        montarJunta({ pro: 25 });
        // El botón sólo tiene sitio para el coste en móvil; el saldo se lee
        // aquí, y esta línea existe en todos los anchos.
        expect(screen.getByText(/te quedan 25/i)).toBeInTheDocument();
    });

    it('con el saldo aún sin cargar no se inventa un cero', () => {
        montarJunta({ pro: 0, loaded: false });
        expect(screen.queryByTestId('aviso-saldo-corto')).toBeNull();
        expect(
            screen.getByRole('button', { name: /convocar junta · 5 créditos$/i }),
        ).toBeInTheDocument();
    });
});

describe('el aviso llega antes de escribir', () => {
    it('con 3 créditos y un debate de 5, el aviso ya está sin teclear nada', () => {
        montarJunta({ pro: 3 });
        const aviso = screen.getByTestId('aviso-saldo-corto');
        expect(aviso).toHaveTextContent(/te quedan 3 créditos y un debate cuesta 5/i);
        expect(
            screen.getByRole('button', { name: /recargar créditos/i }),
        ).toBeInTheDocument();
        // Y el compositor sigue vacío: el aviso no ha esperado a que se escriba.
        expect(screen.getByLabelText(/tu consulta a la junta/i)).toHaveValue('');
    });

    it('«Recargar créditos» lleva a facturación', () => {
        montarJunta({ pro: 3 });
        fireEvent.click(screen.getByRole('button', { name: /recargar créditos/i }));
        expect(mockNavigate).toHaveBeenCalledWith('/billing');
    });

    it('cuando el envío entra pero es el último, se dice el saldo proyectado', () => {
        montarJunta({ pro: 6 });
        expect(screen.getByTestId('aviso-ultimo-envio')).toHaveTextContent(
            /te quedan 6: después de este debate te quedarán 1/i,
        );
    });

    it('con saldo de sobra no hay ningún aviso que estorbe', () => {
        montarJunta({ pro: 40 });
        expect(screen.queryByTestId('aviso-saldo-corto')).toBeNull();
        expect(screen.queryByTestId('aviso-ultimo-envio')).toBeNull();
    });
});

describe('pulsar con saldo corto no gasta trabajo', () => {
    it('abre el paywall, no envía, y el borrador se queda donde estaba', () => {
        montarJunta({ pro: 3 });
        const compositor = screen.getByLabelText(/tu consulta a la junta/i);
        fireEvent.change(compositor, { target: { value: 'Deberíamos subir precios?' } });

        fireEvent.click(screen.getByTestId('boton-enviar'));

        expect(abrirPaywall).toHaveBeenCalledWith('upgrade_cta');
        // Ni un mensaje en el hilo: no se ha gastado nada.
        expect(useChatStore.getState().messagesBySession['junta'] ?? []).toHaveLength(0);
        // Y el texto sigue ahí: lo escrito no se paga con un paywall.
        expect(compositor).toHaveValue('Deberíamos subir precios?');
    });

    it('⏎ tampoco se cuela por detrás del aviso', () => {
        montarJunta({ pro: 3 });
        const compositor = screen.getByLabelText(/tu consulta a la junta/i);
        fireEvent.change(compositor, { target: { value: 'Consulta' } });
        fireEvent.keyDown(compositor, { key: 'Enter' });

        expect(abrirPaywall).toHaveBeenCalledWith('upgrade_cta');
        expect(useChatStore.getState().messagesBySession['junta'] ?? []).toHaveLength(0);
    });

    it('el botón sigue pulsable: un botón muerto no explica nada', () => {
        montarJunta({ pro: 3 });
        const compositor = screen.getByLabelText(/tu consulta a la junta/i);
        fireEvent.change(compositor, { target: { value: 'Consulta' } });
        expect(screen.getByTestId('boton-enviar')).not.toBeDisabled();
        expect(screen.getByTestId('boton-enviar')).toHaveAccessibleName(
            /sin saldo para convocar/i,
        );
    });
});
