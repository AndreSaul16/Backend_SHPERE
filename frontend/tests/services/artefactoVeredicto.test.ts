/**
 * El veredicto del artefacto tiene que sobrevivir al lector SSE.
 *
 * `type_status`, `declared_type`, `truncated`, `reason` y `content_status` son
 * campos nuevos de eventos que ya existían. Si `api.ts` los deja fuera al
 * reconstruir el objeto campo a campo, el backend habría dicho «este documento
 * no es lo que dice ser» y el panel no enseñaría nada. Se comprueba por el
 * mismo camino que recorre el navegador (`response.body.getReader()`).
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
    onArtifactOpen: vi.fn(),
    onArtifactChunk: vi.fn(),
    onArtifactClose: vi.fn(),
});

describe('los veredictos del artefacto llegan al cliente', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('la apertura lleva el tipo declarado y su veredicto', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'artifact_open',
                title: 'Plan',
                artifact_type: 'code',
                language: '',
                declared_type: 'markdwon',
                type_status: 'unknown',
            }),
            '[DONE]',
        );

        await chatService.streamChat('hazme un plan', 's1', cb);

        expect(cb.onArtifactOpen).toHaveBeenCalledWith(
            expect.objectContaining({ type_status: 'unknown', declared_type: 'markdwon' }),
        );
    });

    it('una apertura correcta llega con veredicto `ok`', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'artifact_open',
                title: 'Diagrama',
                artifact_type: 'mermaid',
                language: '',
                type_status: 'ok',
            }),
            '[DONE]',
        );

        await chatService.streamChat('hazme un diagrama', 's1', cb);

        expect(cb.onArtifactOpen).toHaveBeenCalledWith(
            expect.objectContaining({ artifact_type: 'mermaid', type_status: 'ok' }),
        );
    });

    it('el cierre lleva el corte y su motivo', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({
                type: 'artifact_close',
                truncated: true,
                reason: 'size_limit',
                limit_bytes: 262144,
                content_status: 'unchecked',
            }),
            '[DONE]',
        );

        await chatService.streamChat('escribe mucho', 's1', cb);

        expect(cb.onArtifactClose).toHaveBeenCalledWith(
            expect.objectContaining({ truncated: true, reason: 'size_limit' }),
        );
    });

    it('el cierre lleva el juicio sobre el contenido', async () => {
        const cb = espias();
        servirSSE(
            JSON.stringify({ type: 'artifact_close', content_status: 'mismatch' }),
            '[DONE]',
        );

        await chatService.streamChat('hazme una tabla', 's1', cb);

        expect(cb.onArtifactClose).toHaveBeenCalledWith(
            expect.objectContaining({ content_status: 'mismatch' }),
        );
    });

    it('un backend viejo, sin campos de veredicto, no rompe el cierre', async () => {
        // El rollback de A2 es un revert de backend sin tocar frontend: un
        // `artifact_close` pelado tiene que seguir cerrando el artefacto.
        const cb = espias();
        servirSSE(JSON.stringify({ type: 'artifact_close' }), '[DONE]');

        await chatService.streamChat('cualquier cosa', 's1', cb);

        expect(cb.onArtifactClose).toHaveBeenCalledTimes(1);
    });
});
