/**
 * SFS-001..003 — cuando el stream falla, la app tiene que decirlo.
 *
 * El `throw` del evento `{"type":"error"}` caía DENTRO del `try` cuyo `catch`
 * lo registra como error de parseo, así que el bucle seguía y el `[DONE]`
 * posterior ejecutaba `onDone`: el turno fallido se contaba como terminado. Y
 * si el cuerpo se cerraba sin `[DONE]`, `if (done) break` salía del bucle sin
 * llamar a nada: spinner infinito.
 *
 * El lector SSE se simula con un `ReadableStream` servido por MSW: es el mismo
 * camino que recorre el navegador (`response.body.getReader()`), sin red.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { chatService } from '../../src/services/api';
import { useBillingStore } from '../../src/store/useBillingStore';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

/** Sirve los eventos dados y CIERRA el cuerpo. Sin `[DONE]` salvo que se pida. */
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
});

const token = (texto: string) => JSON.stringify({ type: 'token', content: texto });

describe('SFS-001 — el evento error se ve', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('un evento error seguido de [DONE] avisa del fallo', async () => {
        const cb = espias();
        servirSSE(JSON.stringify({ type: 'error', message: 'El modelo no respondió' }), '[DONE]');

        await chatService.streamChat('hola', 's1', cb);

        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect(cb.onDone).toHaveBeenCalledTimes(0);
        expect(String((cb.onError.mock.calls[0][0] as Error).message)).toContain('El modelo no respondió');
    });

    it('un error a mitad de generación conserva el texto y deja el turno fallido', async () => {
        const cb = espias();
        servirSSE(
            token('La caja aguanta '),
            token('hasta Q3.'),
            JSON.stringify({ type: 'error', message: 'El modelo se cayó' }),
            '[DONE]',
        );

        await chatService.streamChat('hola', 's1', cb);

        expect(cb.onToken).toHaveBeenCalledTimes(2);
        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect(cb.onDone).toHaveBeenCalledTimes(0);
    });
});

describe('SFS-002 — fin de stream sin [DONE]', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('un corte de conexión limpio avisa en vez de dejar el spinner colgado', async () => {
        const cb = espias();
        servirSSE(token('La caja aguanta '), token('hasta Q3.'));

        await chatService.streamChat('hola', 's1', cb);

        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect(cb.onDone).toHaveBeenCalledTimes(0);
    });

    it('la terminación normal sigue siendo terminación normal', async () => {
        const cb = espias();
        servirSSE(token('Todo bien.'), '[DONE]');

        await chatService.streamChat('hola', 's1', cb);

        expect(cb.onDone).toHaveBeenCalledTimes(1);
        expect(cb.onError).toHaveBeenCalledTimes(0);
        expect(cb.onToken).toHaveBeenCalledWith('Todo bien.', null);
    });

    it('la cancelación del usuario no es un fallo', async () => {
        const cb = espias();
        servirSSE(token('a medias'));
        const control = new AbortController();
        control.abort();

        await chatService.streamChat('hola', 's1', cb, undefined, control.signal);

        expect(cb.onError).toHaveBeenCalledTimes(0);
        expect(cb.onDone).toHaveBeenCalledTimes(0);
    });
});

describe('SFS-003 — el JSON corrupto se sigue tolerando', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('un chunk ilegible entre chunks buenos no aborta el turno', async () => {
        const cb = espias();
        servirSSE(token('antes '), '{no-es-json', token('después'), '[DONE]');

        await chatService.streamChat('hola', 's1', cb);

        expect(cb.onToken).toHaveBeenCalledTimes(2);
        expect(cb.onToken).toHaveBeenNthCalledWith(1, 'antes ', null);
        expect(cb.onToken).toHaveBeenNthCalledWith(2, 'después', null);
        expect(cb.onDone).toHaveBeenCalledTimes(1);
        expect(cb.onError).toHaveBeenCalledTimes(0);
    });
});
