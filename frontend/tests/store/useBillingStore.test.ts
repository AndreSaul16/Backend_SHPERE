import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBillingStore, skuComprable } from '../../src/store/useBillingStore';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';

// Mock firebase/auth so dynamic import in authHeaders() doesn't throw
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: {
            getIdToken: vi.fn(() => Promise.resolve('mock-token')),
        },
    })),
}));

describe('useBillingStore', () => {
    beforeEach(() => {
        // Reset the store state before each test
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            current_period_end: '',
            rag_storage_used_mb: 0,
            custom_agents_count: 0,
            paywall: { open: false, reason: null },
            loaded: false,
            isLoading: false,
            error: null,
        });
    });

    it('should initialize with default free plan values', () => {
        const state = useBillingStore.getState();
        expect(state.plan_id).toBe('free');
        expect(state.pro_messages_balance).toBe(5);
        expect(state.topup_messages_balance).toBe(0);
        expect(state.paywall.open).toBe(false);
    });

    it('should open and close the paywall', () => {
        useBillingStore.getState().openPaywall('402');
        let state = useBillingStore.getState();
        expect(state.paywall.open).toBe(true);
        expect(state.paywall.reason).toBe('402');

        useBillingStore.getState().closePaywall();
        state = useBillingStore.getState();
        expect(state.paywall.open).toBe(false);
        expect(state.paywall.reason).toBe(null);
    });

    it('should decrement pro_messages_balance optimistically if > 0', () => {
        useBillingStore.getState().decrementOptimistic();
        expect(useBillingStore.getState().pro_messages_balance).toBe(4);
        expect(useBillingStore.getState().topup_messages_balance).toBe(0);
    });

    it('should decrement topup_messages_balance optimistically if pro is 0', () => {
        useBillingStore.setState({ pro_messages_balance: 0, topup_messages_balance: 10 });
        useBillingStore.getState().decrementOptimistic();
        expect(useBillingStore.getState().pro_messages_balance).toBe(0);
        expect(useBillingStore.getState().topup_messages_balance).toBe(9);
    });
});

describe('useBillingStore.refresh()', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        // La consulta de saldo comparte promesa entre llamantes solapados (F7);
        // `reset()` la suelta para que un caso no arrastre la del anterior —el
        // primer test deja una a propósito sin resolver—.
        useBillingStore.getState().reset();
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            current_period_end: null,
            cancel_at_period_end: false,
            rag_storage_bytes_used: 0,
            custom_agents_count: 0,
            loaded: false,
            isLoading: false,
            error: null,
        });
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('sets isLoading=true when refresh starts (BF-001, BF-002)', async () => {
        // fetch never resolves — isLoading should already be true
        (global.fetch as any).mockImplementation(() => new Promise(() => {}));

        const promise = useBillingStore.getState().refresh();
        // isLoading must be set synchronously before any await
        expect(useBillingStore.getState().isLoading).toBe(true);

        // Clean up hanging promise
        promise.catch(() => {});
    });

    it('sets loaded=true, isLoading=false, and stores billing data on success (BF-002)', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    plan_id: 'starter',
                    status: 'active',
                    pro_messages_balance: 100,
                    topup_messages_balance: 50,
                    stripe_configured: true,
                }),
        });

        await useBillingStore.getState().refresh();

        expect(useBillingStore.getState().loaded).toBe(true);
        expect(useBillingStore.getState().isLoading).toBe(false);
        expect(useBillingStore.getState().pro_messages_balance).toBe(100);
        expect(useBillingStore.getState().topup_messages_balance).toBe(50);
        expect(useBillingStore.getState().error).toBeNull();
        expect(useBillingStore.getState().plan_id).toBe('starter');
    });

    it('retries 3 times on failure with 1s/2s/4s backoff (BF-001)', async () => {
        (global.fetch as any).mockRejectedValue(new Error('Network error'));

        const refreshPromise = useBillingStore.getState().refresh();

        // Advance through each backoff delay
        await vi.advanceTimersByTimeAsync(1100); // 1s + wiggle
        await vi.advanceTimersByTimeAsync(2100); // 2s + wiggle
        await vi.advanceTimersByTimeAsync(4100); // 4s + wiggle
        await refreshPromise;

        // Initial call + 3 retries = 4 total
        expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('sets error state after all retries fail (BF-001)', async () => {
        (global.fetch as any).mockRejectedValue(new Error('Network error'));

        const refreshPromise = useBillingStore.getState().refresh();

        await vi.advanceTimersByTimeAsync(1100);
        await vi.advanceTimersByTimeAsync(2100);
        await vi.advanceTimersByTimeAsync(4100);
        await refreshPromise;

        expect(useBillingStore.getState().error).toBe('Error al cargar la información de facturación');
        expect(useBillingStore.getState().isLoading).toBe(false);
        expect(useBillingStore.getState().loaded).toBe(false);
    });

    /**
     * Tarea 1.13. El `error` de arriba sólo lo pinta `BillingPage`; desde la
     * sidebar o el indicador de créditos este fallo era invisible y dejaba el
     * saldo congelado en una cifra vieja — la cifra con la que se decide si
     * convocar una junta de 5 créditos.
     *
     * Es `warning`, no `error`: no ha fallado ninguna acción del usuario ni se
     * ha perdido nada, sólo la cifra puede estar desfasada. §9.5 reserva el
     * `error` (que además no se cierra solo) para lo que sí se ha perdido.
     */
    it('avisa una sola vez, como warning y con acción, cuando se agotan los reintentos (1.13)', async () => {
        __resetToastBus();
        const seen: ToastRecord[] = [];
        const unsubscribe = subscribeToasts((t) => seen.push(t));
        (global.fetch as any).mockRejectedValue(new Error('Network error'));

        const refreshPromise = useBillingStore.getState().refresh();
        await vi.advanceTimersByTimeAsync(1100);
        await vi.advanceTimersByTimeAsync(2100);
        await vi.advanceTimersByTimeAsync(4100);
        await refreshPromise;

        // Uno, no cuatro: se avisa al agotar los reintentos, no en cada uno.
        expect(seen).toHaveLength(1);
        expect(seen[0].variant).toBe('warning');
        expect(seen[0].title).toBe('Tu saldo de créditos puede no estar al día');
        expect(seen[0].action?.label).toBe('Reintentar');
        expect(seen[0].dedupeKey).toBe('billing-refresh');

        unsubscribe();
    });

    it('succeeds on retry after initial failure (BF-001)', async () => {
        let attempts = 0;
        (global.fetch as any).mockImplementation(() => {
            attempts++;
            if (attempts < 3) {
                return Promise.reject(new Error('Network error'));
            }
            return Promise.resolve({
                ok: true,
                json: () =>
                    Promise.resolve({
                        plan_id: 'free',
                        pro_messages_balance: 5,
                        topup_messages_balance: 0,
                        stripe_configured: true,
                    }),
            });
        });

        const refreshPromise = useBillingStore.getState().refresh();

        // First 2 attempts fail, third succeeds
        await vi.advanceTimersByTimeAsync(1100); // retry 1
        await vi.advanceTimersByTimeAsync(2100); // retry 2 (success)
        await refreshPromise;

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(useBillingStore.getState().loaded).toBe(true);
        expect(useBillingStore.getState().error).toBeNull();
        expect(useBillingStore.getState().isLoading).toBe(false);
    });

    it('stores stripe_configured from API response', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    plan_id: 'free',
                    pro_messages_balance: 5,
                    topup_messages_balance: 0,
                    stripe_configured: false,
                }),
        });

        await useBillingStore.getState().refresh();

        expect(useBillingStore.getState().stripe_configured).toBe(false);
    });

    // QA-3 · `stripe_configured` sólo mira la clave secreta de Stripe. Los
    // `STRIPE_PRICE_*` van por SKU y nunca se validaban, así que la página
    // pintaba cinco compras que el backend iba a rechazar con un 400.
    it('guarda purchasable_skus de la respuesta de /billing/me', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    plan_id: 'free',
                    pro_messages_balance: 5,
                    topup_messages_balance: 0,
                    stripe_configured: true,
                    purchasable_skus: ['executive', 'quick_meeting'],
                }),
        });

        await useBillingStore.getState().refresh();

        expect(useBillingStore.getState().purchasable_skus).toEqual(['executive', 'quick_meeting']);
    });

    it('un backend que no manda purchasable_skus deja el catálogo en «no lo ha dicho»', async () => {
        // Backend y frontend se despliegan desde repos distintos, así que el
        // frontend nuevo puede hablar un rato con un backend viejo. Ahí `null`
        // significa «no lo ha dicho», que NO es lo mismo que «nada es comprable»:
        // una lista vacía apagaría la tienda entera durante ese desfase.
        useBillingStore.setState({ purchasable_skus: ['executive'] });
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    plan_id: 'free',
                    pro_messages_balance: 5,
                    topup_messages_balance: 0,
                    stripe_configured: true,
                }),
        });

        await useBillingStore.getState().refresh();

        expect(useBillingStore.getState().purchasable_skus).toBeNull();
    });

    it('retries on HTTP error responses (401) with backoff (BF-001 triangulation)', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ detail: 'Unauthorized' }),
        });

        const refreshPromise = useBillingStore.getState().refresh();

        await vi.advanceTimersByTimeAsync(1100);
        await vi.advanceTimersByTimeAsync(2100);
        await vi.advanceTimersByTimeAsync(4100);
        await refreshPromise;

        expect(global.fetch).toHaveBeenCalledTimes(4);
        expect(useBillingStore.getState().error).toBe('Error al cargar la información de facturación');
        expect(useBillingStore.getState().loaded).toBe(false);
    });
});

/**
 * QA-3 — `skuComprable`: la regla de lectura del catálogo, aparte y pura.
 *
 * Se saca a función porque el matiz que carga no es obvio y hay que poder
 * probarlo sin montar una página: `null` es «el backend no lo ha dicho», no
 * «nada es comprable». Confundir los dos apagaría la tienda entera durante
 * cualquier desfase de despliegue entre los dos repos.
 */
describe('skuComprable', () => {
    it('un SKU que el backend lista es comprable', () => {
        expect(skuComprable('quick_meeting', ['executive', 'quick_meeting'])).toBe(true);
    });

    it('un SKU ausente de la lista no es comprable', () => {
        expect(skuComprable('deep_dive', ['executive', 'quick_meeting'])).toBe(false);
    });

    it('con la lista vacía no se puede comprar nada', () => {
        expect(skuComprable('quick_meeting', [])).toBe(false);
    });

    it('null es «no lo ha dicho» y no bloquea ninguna compra', () => {
        expect(skuComprable('quick_meeting', null)).toBe(true);
    });
});
