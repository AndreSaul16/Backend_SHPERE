/**
 * El tercer estado tiene que sobrevivir al lector SSE.
 *
 * `tool_confirmation` es un tipo de evento nuevo. Si `api.ts` no lo reconoce,
 * cae en el `else` final y se descarta en silencio: el backend habría dicho
 * «pendiente de confirmación» y el hilo no enseñaría nada. Se comprueba por el
 * mismo camino que recorre el navegador (`response.body.getReader()`), con MSW.
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

describe('el evento tool_confirmation llega al cliente', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('se reparte a `onToolConfirmation` con su nombre y su resumen', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'tool_confirmation',
                tool_name: 'whatsapp_send_message',
                summary: 'Enviar «llego tarde» a +34600111222',
            }),
            '[DONE]',
        );

        await chatService.streamChat('avisa que llego tarde', 's1', cb);

        expect(cb.onToolConfirmation).toHaveBeenCalledWith({
            tool_name: 'whatsapp_send_message',
            summary: 'Enviar «llego tarde» a +34600111222',
        });
    });

    it('no se confunde con un fallo ni con un resultado', async () => {
        // TRI-001: ningún par de estados comparte evento. Si alguien reutiliza
        // `tool_error` para la confirmación, esta prueba lo caza.
        const cb = espias();
        servirSSE(
            JSON.stringify({ type: 'tool_confirmation', tool_name: 'calendar_delete_event', summary: 'Borrar «Comité»' }),
            '[DONE]',
        );

        await chatService.streamChat('borra el comité', 's1', cb);

        expect(cb.onToolError).not.toHaveBeenCalled();
        expect(cb.onToolResult).not.toHaveBeenCalled();
    });

    it('un evento sin resumen no deja la tarjeta muda', async () => {
        const cb = espias();
        servirSSE(JSON.stringify({ type: 'tool_confirmation', tool_name: 'schedule_post' }), '[DONE]');

        await chatService.streamChat('programa el post', 's1', cb);

        expect(cb.onToolConfirmation).toHaveBeenCalledWith({
            tool_name: 'schedule_post',
            summary: 'Esta acción necesita tu confirmación.',
        });
    });
});
