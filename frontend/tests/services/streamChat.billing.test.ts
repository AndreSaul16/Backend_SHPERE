/**
 * Contrato de billing optimista de chatService.streamChat (A4).
 *
 * El decremento vive DENTRO de streamChat (tras response.ok), no en ChatPanel:
 * solo se descuenta si el stream llegó a abrirse, y con el coste real del envío
 * (1 chat normal, 5 board meeting). Al [DONE] se reconcilia contra el backend.
 * El endpoint POST /stream/ está mockeado en tests/mocks/handlers.ts (MSW).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatService } from '../../src/services/api';
import { useBillingStore } from '../../src/store/useBillingStore';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

describe('streamChat — decremento optimista de créditos (A4)', () => {
    beforeEach(() => {
        useBillingStore.setState({
            decrementOptimistic: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('decrementa 1 crédito por defecto al abrir el stream', async () => {
        await chatService.streamChat('hola', 's1', {});
        await vi.waitFor(() => {
            expect(useBillingStore.getState().decrementOptimistic).toHaveBeenCalledExactlyOnceWith(1);
        });
    });

    it('decrementa el coste real del board (5) cuando se pasa estimatedCost', async () => {
        await chatService.streamChat('hola', 's1', {}, undefined, undefined, false, 5);
        await vi.waitFor(() => {
            expect(useBillingStore.getState().decrementOptimistic).toHaveBeenCalledExactlyOnceWith(5);
        });
    });

    it('reconcilia el balance con refresh al recibir [DONE]', async () => {
        await chatService.streamChat('hola', 's1', {});
        await vi.waitFor(() => {
            expect(useBillingStore.getState().refresh).toHaveBeenCalled();
        });
    });
});
