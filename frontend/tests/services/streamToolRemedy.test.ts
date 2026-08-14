/**
 * TER-002 — el remedio tiene que sobrevivir al lector SSE.
 *
 * El backend decide qué puede hacer el usuario ante un fallo y lo manda en el campo
 * `remedy` del evento `tool_error`. Si `api.ts` no lo copia al callback, el campo se
 * pierde en el primero de los cuatro saltos y la tarjeta vuelve a ofrecer «Reintentar»
 * para todo — que es exactamente el estado que este cambio elimina.
 *
 * Se comprueba por el mismo camino que recorre el navegador (`response.body.getReader()`),
 * con MSW, igual que el test del tercer estado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { chatService } from '../../src/services/api';
import { useBillingStore } from '../../src/store/useBillingStore';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

const servirSSE = (...eventos: string[]) => {
    server.use(
        http.post('http://localhost:8000/api/v1/stream/', () => {
            const cuerpo = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    for (const evento of eventos) {
                        controller.enqueue(encoder.encode(`data: ${evento}\n\n`));
                    }
                    controller.close();
                },
            });
            return new HttpResponse(cuerpo, {
                headers: { 'Content-Type': 'text/event-stream' },
            });
        }),
    );
};

const espias = () => ({
    onToken: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onToolResult: vi.fn(),
    onToolError: vi.fn(),
    onToolConfirmation: vi.fn(),
});

describe('el remedio del evento tool_error llega al cliente', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('reparte `remedy: connect` tal cual lo mandó el backend', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'tool_error',
                tool_name: 'whatsapp_send_message',
                error: 'Conecta WhatsApp en Ajustes → Conexiones.',
                remedy: 'connect',
            }),
            '[DONE]',
        );

        await chatService.streamChat('avisa a Ana', 's1', cb);

        expect(cb.onToolError).toHaveBeenCalledWith(
            expect.objectContaining({ remedy: 'connect' }),
        );
    });

    it('reparte `remedy: none` sin convertirlo en otra cosa', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'tool_error',
                tool_name: 'whatsapp_send_message',
                error: 'Ese contacto no está en tu lista.',
                remedy: 'none',
            }),
            '[DONE]',
        );

        await chatService.streamChat('avisa a Ana', 's1', cb);

        expect(cb.onToolError).toHaveBeenCalledWith({
            tool_name: 'whatsapp_send_message',
            error: 'Ese contacto no está en tu lista.',
            remedy: 'none',
        });
    });

    it('un evento sin `remedy` conserva la conducta de hoy', async () => {
        // El defecto es `retry` en todos los saltos: sólo lo probadamente imposible
        // pierde el botón, y nunca por un campo que faltó en el transporte.
        const cb = espias();
        servirSSE(
            JSON.stringify({ type: 'tool_error', tool_name: 'buscar', error: 'n8n devolvió 502' }),
            '[DONE]',
        );

        await chatService.streamChat('busca', 's1', cb);

        expect(cb.onToolError).toHaveBeenCalledWith({
            tool_name: 'buscar',
            error: 'n8n devolvió 502',
            remedy: 'retry',
        });
    });
});
