import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { BillingPage } from '../../src/pages/BillingPage';
import { useBillingStore } from '../../src/store/useBillingStore';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: { getIdToken: vi.fn(() => Promise.resolve('mock-token')) },
    })),
}));

const renderPage = () => render(<MemoryRouter><BillingPage /></MemoryRouter>);

/**
 * 6.10 — el portal de Stripe y la barra de almacenamiento.
 *
 * `POST /billing/portal` existía en el backend desde el primer día y no lo
 * llamaba nadie: quien compraba no tenía dónde ver sus facturas ni cambiar su
 * tarjeta. Y la barra de almacenamiento era un `div` con un `width` en línea,
 * o sea información que sólo existe si la ves.
 */
describe('BillingPage — portal de Stripe y cuota (6.10)', () => {
    beforeEach(() => {
        useBillingStore.setState({
            plan_id: 'free',
            status: 'active',
            pro_messages_balance: 10,
            topup_messages_balance: 40,
            loaded: true,
            isLoading: false,
            error: null,
            stripe_configured: true,
            refresh: vi.fn().mockResolvedValue(undefined),
        });
        vi.clearAllMocks();
    });

    it('el botón del portal pide POST /billing/portal y usa la URL que devuelve', async () => {
        const user = userEvent.setup();
        let pedido: { url: string; method: string } | null = null;
        server.use(
            http.post('http://localhost:8000/api/v1/billing/portal', ({ request }) => {
                pedido = { url: request.url, method: request.method };
                return HttpResponse.json({ url: 'https://billing.stripe.com/p/session_test' });
            }),
        );

        renderPage();
        await user.click(screen.getByRole('button', { name: /Facturas y método de pago/ }));

        await waitFor(() => expect(pedido).not.toBeNull());
        expect(pedido!.method).toBe('POST');
        expect(pedido!.url).toContain('/billing/portal');
        // Con URL válida no hay aviso de fallo: el viaje sale hacia Stripe.
        // (jsdom no navega entre documentos; el salto real se comprobó en el
        // navegador, no aquí.)
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('sin compras (404) no se dice «ha fallado»: se dice que aún no hay nada que gestionar', async () => {
        const user = userEvent.setup();
        server.use(
            http.post('http://localhost:8000/api/v1/billing/portal', () =>
                HttpResponse.json({ detail: 'No stripe customer found' }, { status: 404 }),
            ),
        );
        renderPage();
        await user.click(screen.getByRole('button', { name: /Facturas y método de pago/ }));
        expect(
            await screen.findByText('Todavía no tienes facturación que gestionar'),
        ).toBeInTheDocument();
    });

    it('la cuota de almacenamiento es un progressbar con su valor dicho en palabras', async () => {
        server.use(
            http.get('http://localhost:8000/api/v1/me/storage', () =>
                HttpResponse.json({
                    used_bytes: 450 * 1024 * 1024,
                    quota_bytes: 1024 * 1024 * 1024,
                    percent_used: 43.9,
                    file_count: 7,
                }),
            ),
        );
        renderPage();
        const barra = await screen.findByRole('progressbar', { name: 'Almacenamiento usado' });
        expect(barra.getAttribute('aria-valuenow')).toBe('44');
        expect(barra.getAttribute('aria-valuemax')).toBe('100');
        expect(barra.getAttribute('aria-valuetext')).toMatch(/43\.9 % usado/);
        expect(barra.getAttribute('aria-valuetext')).toMatch(/de 1\.0 GB/);
    });
});
