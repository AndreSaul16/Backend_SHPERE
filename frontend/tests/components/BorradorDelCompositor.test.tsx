/**
 * El borrador no se pierde — PLAN §6 Q3.
 *
 * Se prueba el COMPORTAMIENTO que el usuario nota, no el hook: escribo, me voy,
 * vuelvo y sigue ahí; el envío falla y el texto no se ha ido; dos juntas no se
 * pisan el borrador; «Descartar» lo tira de verdad.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatPanel } from '../../src/components/chat/ChatPanel';
import { useChatStore } from '../../src/store/useChatStore';
import { useBillingStore } from '../../src/store/useBillingStore';
import { chatService } from '../../src/services/api';
import { DRAFT_DEBOUNCE_MS, draftKey } from '../../src/hooks/useDraft';

vi.mock('../../src/services/api', () => ({
    chatService: {
        streamChat: vi.fn().mockImplementation(() => new Promise(() => { })),
        getSessions: vi.fn().mockResolvedValue([]),
        getSessionHistory: vi.fn().mockResolvedValue({ messages: [] }),
        getPins: vi.fn().mockResolvedValue([]),
        intervene: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => vi.fn() };
});

const almacen: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (k: string) => almacen[k] ?? null,
        setItem: (k: string, v: string) => { almacen[k] = v; },
        removeItem: (k: string) => { delete almacen[k]; },
        clear: () => { for (const k of Object.keys(almacen)) delete almacen[k]; },
    },
});

const pintar = (id: string) =>
    render(
        <MemoryRouter initialEntries={[`/chat/${id}`]}>
            <Routes>
                <Route path="/chat/:sessionId" element={<ChatPanel />} />
            </Routes>
        </MemoryRouter>,
    );

/** Deja pasar el retardo de guardado sin esperas arbitrarias. */
const dejarGuardar = async () => {
    await act(async () => {
        vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS + 10);
    });
};

describe('el borrador del compositor', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        localStorage.clear();
        useChatStore.getState().resetState();
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.mocked(chatService.streamChat).mockImplementation(() => new Promise(() => { }));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sobrevive a una recarga: lo escrito vuelve al abrir la misma junta', async () => {
        useChatStore.setState({ currentSessionId: 'junta-1' });
        const primera = pintar('junta-1');

        fireEvent.change(screen.getByPlaceholderText(/Transmite tu consulta/i), {
            target: { value: 'Deberíamos subir el precio del plan Pro un 12%' },
        });
        await dejarGuardar();
        expect(almacen[draftKey('junta-1')]).toContain('12%');

        // Recarga = desmontar y volver a montar con el mismo almacenamiento.
        primera.unmount();
        pintar('junta-1');

        const campo = screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement;
        expect(campo.value).toBe('Deberíamos subir el precio del plan Pro un 12%');
        expect(screen.getByText('Borrador recuperado')).toBeInTheDocument();
    });

    it('«Descartar» tira el borrador recuperado y no vuelve', async () => {
        almacen[draftKey('junta-1')] = 'texto viejo que ya no quiero';
        useChatStore.setState({ currentSessionId: 'junta-1' });
        const vista = pintar('junta-1');

        fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

        expect((screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement).value).toBe('');
        expect(almacen[draftKey('junta-1')]).toBeUndefined();

        vista.unmount();
        pintar('junta-1');
        expect((screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement).value).toBe('');
    });

    it('un envío fallido conserva el texto en el campo y guardado', async () => {
        vi.mocked(chatService.streamChat).mockRejectedValue(new Error('red caída'));
        useChatStore.setState({ currentSessionId: 'junta-1' });
        pintar('junta-1');

        const campo = screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement;
        fireEvent.change(campo, { target: { value: 'Seis líneas de contexto que no quiero reescribir' } });
        fireEvent.keyDown(campo, { key: 'Enter' });

        await waitFor(() => {
            expect(campo.value).toBe('Seis líneas de contexto que no quiero reescribir');
        });
        expect(useChatStore.getState().errorStates.send_message).not.toBeNull();
        expect(almacen[draftKey('junta-1')]).toBe('Seis líneas de contexto que no quiero reescribir');
    });

    it('un envío que sale limpia el borrador guardado', async () => {
        useChatStore.setState({ currentSessionId: 'junta-1' });
        pintar('junta-1');

        const campo = screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement;
        fireEvent.change(campo, { target: { value: 'Convocad la junta' } });
        await dejarGuardar();
        fireEvent.keyDown(campo, { key: 'Enter' });

        await waitFor(() => {
            expect(useChatStore.getState().messagesBySession['junta-1']?.length).toBeGreaterThan(0);
        });
        await dejarGuardar();
        expect(almacen[draftKey('junta-1')]).toBeUndefined();
    });

    it('cada junta tiene su borrador: cambiar de junta no los mezcla', async () => {
        almacen[draftKey('junta-2')] = 'lo de la otra junta';
        useChatStore.setState({ currentSessionId: 'junta-1' });
        const vista = pintar('junta-1');

        fireEvent.change(screen.getByPlaceholderText(/Transmite tu consulta/i), {
            target: { value: 'lo de esta junta' },
        });
        await dejarGuardar();
        vista.unmount();

        useChatStore.setState({ currentSessionId: 'junta-2' });
        pintar('junta-2');

        expect((screen.getByPlaceholderText(/Transmite tu consulta/i) as HTMLTextAreaElement).value)
            .toBe('lo de la otra junta');
        expect(almacen[draftKey('junta-1')]).toBe('lo de esta junta');
    });
});
