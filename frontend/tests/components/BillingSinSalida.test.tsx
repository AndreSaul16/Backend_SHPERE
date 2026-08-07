import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BillingPage } from '../../src/pages/BillingPage';
import { useBillingStore } from '../../src/store/useBillingStore';

/**
 * F7 (P1) — `/billing` no puede quedarse en esqueletos para siempre.
 *
 * Se veían tres bloques grises sin mensaje, sin reintento y sin timeout,
 * mientras el indicador de la cabecera SÍ pintaba el saldo. Dos causas:
 *
 * 1. `refresh()` no tenía guardia de petición en vuelo y, al fallar, ponía
 *    `loaded: false` aunque ya hubiera datos buenos cargados. Dos llamadas
 *    solapadas —hay cuatro sitios que la llaman— dejaban el estado en
 *    «cargando y sin datos» de forma indefinida.
 * 2. La página tapiaba todo detrás de `isLoading && !loaded`, sin salida.
 *
 * Un esqueleto que no termina es peor que un error: no dice nada y no ofrece
 * salida (§11).
 */

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: { getIdToken: vi.fn(() => Promise.resolve('t')) } })),
}));

const renderPage = () => render(<MemoryRouter><BillingPage /></MemoryRouter>);

/** La acción de verdad: los tests de página la sustituyen por un espía. */
const refreshReal = useBillingStore.getState().refresh;

describe('F7 — la facturación siempre tiene salida', () => {
    beforeEach(() => {
        useBillingStore.getState().reset();
        useBillingStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) as never });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('el esqueleto tiene cuenta atrás: acaba en mensaje y reintento', () => {
        vi.useFakeTimers();
        useBillingStore.setState({ isLoading: true, loaded: false, error: null });

        renderPage();
        expect(screen.getByTestId('billing-loading')).toBeInTheDocument();

        act(() => { vi.advanceTimersByTime(12_001); });

        expect(screen.queryByTestId('billing-loading')).not.toBeInTheDocument();
        expect(screen.getByText('No hemos podido cargar tus créditos')).toBeInTheDocument();
        expect(screen.getByText(/tu saldo y tus compras no han cambiado/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('con datos ya cargados, un refresco en curso no vuelve a tapiar la página', () => {
        useBillingStore.setState({
            isLoading: true, loaded: true, error: null,
            pro_messages_balance: 37, topup_messages_balance: 120, stripe_configured: false,
        });

        renderPage();

        expect(screen.queryByTestId('billing-loading')).not.toBeInTheDocument();
        expect(screen.getByText('157')).toBeInTheDocument();
    });

    it('con datos cargados, un fallo al refrescar se cuenta sin esconder el saldo', () => {
        useBillingStore.setState({
            isLoading: false, loaded: true, error: 'Error al cargar la información de facturación',
            pro_messages_balance: 37, topup_messages_balance: 120, stripe_configured: false,
        });

        renderPage();

        expect(screen.getByText(/pueden no estar al día/i)).toBeInTheDocument();
        expect(screen.getByText('157')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });
});

describe('F7 — el store no borra un saldo bueno ni abre consultas solapadas', () => {
    beforeEach(() => {
        useBillingStore.setState({ refresh: refreshReal });
        useBillingStore.getState().reset();
        global.fetch = vi.fn();
    });

    it('un refresco fallido no invalida lo ya cargado', async () => {
        (global.fetch as never as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ pro_messages_balance: 37, topup_messages_balance: 120 }),
        });
        await useBillingStore.getState().refresh();
        expect(useBillingStore.getState().loaded).toBe(true);

        // Ahora el backend se cae. Se agotan los reintentos.
        (global.fetch as never as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
        await useBillingStore.getState().refresh();

        expect(useBillingStore.getState().error).not.toBeNull();
        // Lo cargado envejece, no desaparece: si no, la página se tapia sola.
        expect(useBillingStore.getState().loaded).toBe(true);
        expect(useBillingStore.getState().pro_messages_balance).toBe(37);
    }, 20_000);

    it('dos llamantes solapados comparten una sola consulta', async () => {
        let responder!: (v: unknown) => void;
        const respuesta = new Promise((r) => { responder = r; });
        (global.fetch as never as ReturnType<typeof vi.fn>).mockReturnValue(respuesta);

        const a = useBillingStore.getState().refresh();
        const b = useBillingStore.getState().refresh();
        // Deja que la consulta llegue hasta el `fetch` antes de contestarle.
        await new Promise((r) => setTimeout(r, 0));
        responder({ ok: true, json: () => Promise.resolve({ pro_messages_balance: 1 }) });
        await Promise.all([a, b]);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(useBillingStore.getState().isLoading).toBe(false);
        expect(useBillingStore.getState().loaded).toBe(true);
    });
});
