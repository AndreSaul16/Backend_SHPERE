import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreditsIndicator } from '../../src/components/CreditsIndicator';
import { useBillingStore } from '../../src/store/useBillingStore';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('CreditsIndicator Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useBillingStore.setState({
            plan_id: 'free',
            pro_messages_balance: 5,
            topup_messages_balance: 0,
        });
    });

    it('renders balances correctly', () => {
        useBillingStore.setState({
            pro_messages_balance: 100,
            topup_messages_balance: 50,
        });
        render(<CreditsIndicator />);
        expect(screen.getByText('100')).toBeDefined();
        expect(screen.getByText('+50')).toBeDefined();
    });

    it('navigates to billing on click', () => {
        render(<CreditsIndicator />);
        const indicator = screen.getByTestId('credits-indicator');
        fireEvent.click(indicator);
        expect(mockNavigate).toHaveBeenCalledWith('/billing');
    });

    it('hides topup balance if zero', () => {
        useBillingStore.setState({
            pro_messages_balance: 100,
            topup_messages_balance: 0,
        });
        render(<CreditsIndicator />);
        expect(screen.getByText('100')).toBeDefined();
        expect(screen.queryByText('+0')).toBeNull();
    });

    describe('Plan tier display', () => {
        // El plan aparece dos veces a propósito: en el rótulo visual y en el
        // resumen `sr-only` que anuncia la región viva (§12.6). `getAllByText`
        // en vez de `getByText` porque las dos son legítimas.
        it('shows "Free" tier for free users', () => {
            useBillingStore.setState({
                plan_id: 'free',
                pro_messages_balance: 3,
                topup_messages_balance: 0,
            });
            render(<CreditsIndicator />);
            expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
        });

        it('shows "Starter" tier for starter users', () => {
            useBillingStore.setState({
                plan_id: 'starter',
                pro_messages_balance: 42,
                topup_messages_balance: 0,
            });
            render(<CreditsIndicator />);
            expect(screen.getAllByText(/Starter/i).length).toBeGreaterThan(0);
        });

        it('shows "Premium" tier for premium users', () => {
            useBillingStore.setState({
                plan_id: 'premium',
                pro_messages_balance: 99,
                topup_messages_balance: 0,
            });
            render(<CreditsIndicator />);
            expect(screen.getAllByText(/Premium/i).length).toBeGreaterThan(0);
        });

        it('shows call-to-action when balance is zero', () => {
            useBillingStore.setState({
                plan_id: 'free',
                pro_messages_balance: 0,
                topup_messages_balance: 0,
            });
            render(<CreditsIndicator />);
            expect(screen.getByText(/0 — Recargar/i)).toBeDefined();
        });

        it('shows remaining count with plan tier (free user format)', () => {
            useBillingStore.setState({
                plan_id: 'free',
                pro_messages_balance: 3,
                topup_messages_balance: 0,
            });
            render(<CreditsIndicator />);
            expect(screen.getByText('3')).toBeDefined();
            expect(screen.getAllByText(/Free/i).length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // D09 / §12.6 — el saldo se anuncia, y se llega a él con teclado
    // -----------------------------------------------------------------------

    describe('accesibilidad (tarea 1.12)', () => {
        it('el indicador es un botón, no un <div onClick>', () => {
            render(<CreditsIndicator />);
            // Antes era un `<div onClick>`: ir a recargar créditos no existía
            // como camino de teclado.
            const boton = screen.getByRole('button');
            expect(boton).toBe(screen.getByTestId('credits-indicator'));
        });

        it('el saldo vive en una región viva que se anuncia sola (§12.6)', () => {
            useBillingStore.setState({
                plan_id: 'free',
                pro_messages_balance: 7,
                topup_messages_balance: 2,
            });
            const { container } = render(<CreditsIndicator />);

            const region = container.querySelector('[aria-live="polite"]');
            expect(region).not.toBeNull();
            // Anuncia una FRASE, no dígitos sueltos: «7» y «+2» no dicen nada.
            expect(region!.textContent).toContain('7 créditos del plan');
            expect(region!.textContent).toContain('2 comprados');
        });

        it('el desglose deja de depender del `title` (§9.6)', () => {
            render(<CreditsIndicator />);
            const boton = screen.getByTestId('credits-indicator');
            // El `title` era la única fuente del desglose y en táctil no aparece
            // nunca. Ahora el dato es texto real dentro del propio botón.
            expect(boton).not.toHaveAttribute('title');
            expect(boton.textContent).toMatch(/créditos del plan/);
        });

        it('avisa de que no quedan créditos, no sólo con el color', () => {
            useBillingStore.setState({
                plan_id: 'free',
                pro_messages_balance: 0,
                topup_messages_balance: 0,
            });
            const { container } = render(<CreditsIndicator />);
            expect(container.querySelector('[aria-live="polite"]')!.textContent).toContain(
                'Sin créditos',
            );
        });
    });
});
