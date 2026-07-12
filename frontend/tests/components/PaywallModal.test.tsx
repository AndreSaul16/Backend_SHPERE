import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaywallModal } from '../../src/components/modals/PaywallModal';
import { useBillingStore } from '../../src/store/useBillingStore';

describe('PaywallModal Component', () => {
    beforeEach(() => {
        useBillingStore.setState({
            paywall: { open: false, reason: null }
        });
    });

    it('does not render when paywall is closed', () => {
        render(<PaywallModal />);
        expect(screen.queryByText('Límite Alcanzado')).toBeNull();
    });

    it('renders with 402 reason', () => {
        useBillingStore.setState({ paywall: { open: true, reason: '402' } });
        render(<PaywallModal />);
        expect(screen.getByText('Límite Alcanzado')).toBeDefined();
        expect(screen.getByText('Has agotado tus créditos. Compra un pack de recarga para continuar.')).toBeDefined();
    });

    it('renders with rag_full reason', () => {
        useBillingStore.setState({ paywall: { open: true, reason: 'rag_full' } });
        render(<PaywallModal />);
        expect(screen.getByText('Has alcanzado el límite de almacenamiento de documentos.')).toBeDefined();
    });

    it('calls closePaywall when Cancelar is clicked', () => {
        useBillingStore.setState({ paywall: { open: true, reason: '402' } });
        render(<PaywallModal />);
        
        fireEvent.click(screen.getByText('Cancelar'));
        
        // After clicking, the store state should update
        expect(useBillingStore.getState().paywall.open).toBe(false);
    });
});
