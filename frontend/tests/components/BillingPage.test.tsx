import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BillingPage } from '../../src/pages/BillingPage';
import { useBillingStore } from '../../src/store/useBillingStore';

// BillingPage usa <Link> en su header → necesita un Router en el árbol.
const renderPage = () => render(<MemoryRouter><BillingPage /></MemoryRouter>);

// Mock firebase/auth to prevent dynamic import from failing
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: {
            getIdToken: vi.fn(() => Promise.resolve('mock-token')),
        },
    })),
}));

describe('BillingPage - Loading / Error / Stripe States (Task 2.3)', () => {
    beforeEach(() => {
        useBillingStore.setState({
            plan_id: 'free',
            status: 'active',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            current_period_end: null,
            cancel_at_period_end: false,
            loaded: false,
            isLoading: false,
            error: null,
            stripe_configured: true,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    it('shows loading skeleton when isLoading and not loaded (BF-002)', () => {
        useBillingStore.setState({ isLoading: true, loaded: false });

        renderPage();

        // The page should NOT show plan information while loading
        expect(screen.queryByText('Facturación y Planes')).not.toBeInTheDocument();
        // Should show a loading indicator
        expect(screen.getByTestId('billing-loading')).toBeInTheDocument();
    });

    it('shows error state with retry button when error is set (BF-001)', () => {
        useBillingStore.setState({
            error: 'Error al cargar la información de facturación',
            isLoading: false,
            loaded: false,
        });

        renderPage();

        // §11: el error dice qué pasó, qué hacer y qué se conservó — no el
        // volcado del código de error del store, que era lo que salía antes.
        expect(screen.getByText('No hemos podido cargar tus créditos')).toBeInTheDocument();
        expect(screen.getByText(/no han cambiado/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('retry button calls refresh when clicked (BF-001)', () => {
        const mockRefresh = vi.fn().mockResolvedValue(undefined);
        useBillingStore.setState({
            error: 'Error al cargar la información de facturación',
            isLoading: false,
            loaded: false,
            refresh: mockRefresh,
        });

        renderPage();

        screen.getByRole('button', { name: /reintentar/i }).click();
        expect(mockRefresh).toHaveBeenCalled();
    });

    it('shows "Pagos no disponibles" when stripe_configured is false (BF-004)', () => {
        useBillingStore.setState({
            stripe_configured: false,
            loaded: true,
            isLoading: false,
            plan_id: 'free',
            pro_messages_balance: 5,
        });

        renderPage();

        expect(screen.getByText(/Pagos no disponibles/i)).toBeInTheDocument();
        // Subscription buttons should be hidden
        expect(screen.queryByText('Suscribirse')).not.toBeInTheDocument();
    });

    it('shows plan content when loaded=true and no error (BF-002)', () => {
        useBillingStore.setState({
            loaded: true,
            isLoading: false,
            error: null,
            plan_id: 'free',
            pro_messages_balance: 100,
            topup_messages_balance: 50,
            stripe_configured: true,
        });

        renderPage();

        // Modelo mono-plan de créditos: cabecera + balance + catálogo de packs.
        expect(screen.getByText('Créditos y Facturación')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('Packs de recarga')).toBeInTheDocument();
        // 6.10: el total es LA cifra de la tarjeta, con su unidad al lado, y
        // los dos sumandos quedan debajo en letra de detalle.
        expect(screen.getByText('150')).toBeInTheDocument();
        expect(screen.getByText('créditos disponibles')).toBeInTheDocument();
        expect(screen.getByText('Del plan gratuito (30/mes)')).toBeInTheDocument();
    });

    it('checkout buttons stay disabled until EU consent is accepted', () => {
        useBillingStore.setState({
            loaded: true,
            isLoading: false,
            stripe_configured: true,
            plan_id: 'free',
        });

        renderPage();

        // QA-3 · el recuento pasó de 3 a 5: los dos top-ups rápidos llevaban el
        // PRECIO como etiqueta del botón, así que este selector —el mismo de
        // siempre— sólo veía los 3 packs y dejó el defecto pasar entero.
        const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
        expect(buyButtons).toHaveLength(5);
        buyButtons.forEach((b) => expect(b).toBeDisabled());

        screen.getByRole('checkbox').click();

        screen.getAllByRole('button', { name: /comprar/i }).forEach((b) => expect(b).toBeEnabled());
    });

    it('un checkout que falla dice que no se ha cobrado nada, y no vuelca el cuerpo del 500', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
            json: () => Promise.reject(new Error('no es JSON')),
        }) as any;

        useBillingStore.setState({
            loaded: true,
            isLoading: false,
            stripe_configured: true,
            plan_id: 'free',
        });

        renderPage();

        // Aceptar el consentimiento UE y comprar el primer pack.
        // QA-3 · los packs siguen pintándose antes que los top-ups, así que el
        // índice 0 sigue siendo el Executive Pack aunque ahora haya 5 botones.
        screen.getByRole('checkbox').click();
        const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
        buyButtons[0].click();

        // En vez de un alert(), un aviso en línea con lo que §11 exige en una
        // pantalla de pagos: qué pasó y —lo primero que importa— que no se ha
        // cobrado nada.
        await vi.waitFor(() => {
            expect(screen.getByText('No se ha podido iniciar el pago')).toBeInTheDocument();
        });
        expect(screen.getByText(/No se te ha cobrado nada/i)).toBeInTheDocument();
        // El cuerpo crudo del 500 NO se pinta: §11 prohíbe volcarlo, y un proxy
        // caído devolvería HTML entero en la pantalla de pagos.
        expect(screen.queryByText(/Internal Server Error/)).not.toBeInTheDocument();
        // Y se puede apartar: un cobro que no ha salido no bloquea la pantalla.
        expect(screen.getByRole('button', { name: /Cerrar aviso/ })).toBeInTheDocument();
    });
});

/**
 * QA-3 — los top-ups rápidos no parecían comprables.
 *
 * Tres cosas a la vez, y ninguna se veía desde los tests viejos porque los dos
 * selectores de esta suite buscaban `/comprar/i`, que sólo casaba con los packs:
 *
 * 1. La etiqueta del CTA era EL PRECIO («€7,99»), no un verbo. Un precio no es
 *    una acción: nadie sabe que eso se pulsa.
 * 2. El botón no tenía borde y su relleno era `surface-highlight` sobre una
 *    `.glass-panel`; en tema claro los dos tokens resuelven a `--paper-50`, o
 *    sea contraste 0 contra el fondo de su propia tarjeta (WCAG 1.4.11 pide 3:1).
 * 3. Nacía deshabilitado por el consentimiento UE, cuya casilla vive 50 líneas
 *    más arriba, en la sección de packs, y el motivo sólo estaba en un `title`
 *    —que los botones deshabilitados no muestran.
 */
describe('BillingPage — top-ups comprables (QA-3)', () => {
    beforeEach(() => {
        useBillingStore.setState({
            plan_id: 'free',
            status: 'active',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            current_period_end: null,
            cancel_at_period_end: false,
            loaded: true,
            isLoading: false,
            error: null,
            stripe_configured: true,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    it('cada top-up tiene un CTA con verbo, y el precio deja de ser la etiqueta del botón', () => {
        renderPage();

        // 3 packs + 2 top-ups. El nombre del producto va en el nombre accesible
        // para que cinco botones «Comprar» no suenen iguales en un lector.
        expect(screen.getAllByRole('button', { name: /comprar/i })).toHaveLength(5);
        expect(screen.getByRole('button', { name: 'Comprar Quick Meeting' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Comprar Deep Dive' })).toBeInTheDocument();

        // El precio sigue estando —es dato, no adorno— pero fuera del control:
        // en su propio elemento, como en los packs.
        expect(screen.getByText('€7,99').closest('button')).toBeNull();
        expect(screen.getByText('€14,99').closest('button')).toBeNull();
        expect(screen.queryByRole('button', { name: '€7,99' })).not.toBeInTheDocument();
    });

    it('sin consentimiento, la sección de top-ups dice POR QUÉ no se puede comprar', () => {
        renderPage();

        expect(screen.getByRole('button', { name: 'Comprar Quick Meeting' })).toBeDisabled();
        // El motivo, en texto visible dentro de la propia sección. Antes vivía
        // en un `title`, que en un botón deshabilitado no lo lee nadie.
        expect(screen.getByText(/marca las condiciones de compra/i)).toBeInTheDocument();
    });

    it('el enlace del aviso lleva el foco a la casilla de consentimiento', () => {
        renderPage();

        screen.getByRole('button', { name: /ir a la casilla/i }).click();

        expect(screen.getByRole('checkbox')).toHaveFocus();
    });

    it('con el consentimiento marcado, el aviso desaparece y los top-ups se activan', () => {
        renderPage();

        screen.getByRole('checkbox').click();

        expect(screen.queryByText(/marca las condiciones de compra/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Comprar Deep Dive' })).toBeEnabled();
    });
});

/**
 * QA-3 — la elegibilidad de compra, dicha antes del clic y no después del 400.
 *
 * `stripe_configured` sólo mira `STRIPE_SECRET_KEY`. Con la clave puesta y los
 * `STRIPE_PRICE_*` sin poner —que es literalmente el Railway de hoy— la página
 * pintaba cinco compras y las cinco morían en un 400 BILLING_INVALID_PLAN. El
 * backend ahora dice qué SKUs tienen precio detrás; la página deja de prometer
 * lo que no puede cumplir.
 */
describe('BillingPage — sólo promete lo que el backend puede cobrar (QA-3)', () => {
    const TODO_COMPRABLE = ['executive', 'director', 'boardroom', 'quick_meeting', 'deep_dive'];

    beforeEach(() => {
        useBillingStore.setState({
            plan_id: 'free',
            status: 'active',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
            current_period_end: null,
            cancel_at_period_end: false,
            loaded: true,
            isLoading: false,
            error: null,
            stripe_configured: true,
            purchasable_skus: TODO_COMPRABLE,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    it('con consentimiento y SKU comprable, el clic pide el checkout de ESE SKU', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ url: 'https://checkout.stripe.com/c/pay/test_quick' }),
        });
        global.fetch = fetchMock as any;

        renderPage();
        screen.getByRole('checkbox').click();
        screen.getByRole('button', { name: 'Comprar Quick Meeting' }).click();

        // La página también consulta el almacenamiento al montar, así que el
        // checkout se busca por su ruta, no por el orden de las llamadas.
        const checkout = () =>
            fetchMock.mock.calls.find(([u]) => String(u).includes('/billing/checkout'));
        await vi.waitFor(() => expect(checkout()).toBeDefined());
        const [, init] = checkout()!;
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toEqual({ plan_id: 'quick_meeting' });
    });

    it('un top-up sin price ID se dice deshabilitado y con su motivo a la vista', () => {
        useBillingStore.setState({
            purchasable_skus: ['executive', 'director', 'boardroom', 'quick_meeting'],
        });

        renderPage();
        screen.getByRole('checkbox').click();

        expect(screen.getByRole('button', { name: 'Comprar Deep Dive' })).toBeDisabled();
        expect(screen.getByText('Pago no disponible temporalmente')).toBeInTheDocument();
        // Triangulación: el que SÍ tiene precio detrás sigue comprándose.
        expect(screen.getByRole('button', { name: 'Comprar Quick Meeting' })).toBeEnabled();
    });

    it('lo mismo vale para un pack: sin price ID no se promete la compra', () => {
        useBillingStore.setState({ purchasable_skus: ['executive', 'quick_meeting', 'deep_dive'] });

        renderPage();
        screen.getByRole('checkbox').click();

        expect(screen.getByRole('button', { name: 'Comprar Director Pack' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Comprar Boardroom Pack' })).toBeDisabled();
        expect(screen.getAllByText('Pago no disponible temporalmente')).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'Comprar Executive Pack' })).toBeEnabled();
    });

    it('sin un solo price ID configurado, ninguna compra se ofrece', () => {
        useBillingStore.setState({ purchasable_skus: [] });

        renderPage();
        screen.getByRole('checkbox').click();

        screen.getAllByRole('button', { name: /comprar/i }).forEach((b) => expect(b).toBeDisabled());
        expect(screen.getAllByText('Pago no disponible temporalmente')).toHaveLength(5);
    });

    it('un backend que no manda purchasable_skus no apaga la tienda', () => {
        // Desfase de despliegue entre los dos repos: `null` es «no lo ha dicho».
        useBillingStore.setState({ purchasable_skus: null });

        renderPage();
        screen.getByRole('checkbox').click();

        screen.getAllByRole('button', { name: /comprar/i }).forEach((b) => expect(b).toBeEnabled());
        expect(screen.queryByText('Pago no disponible temporalmente')).not.toBeInTheDocument();
    });
});
