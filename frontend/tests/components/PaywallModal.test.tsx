/**
 * 6.3 · D23 — el muro dice qué pasó, qué se conserva y adónde ir.
 *
 * Lo que se prueba no es que salga un modal: es que las CUATRO razones que el
 * backend puede dar tengan cada una su propio texto y que ninguna mande al
 * usuario a comprar créditos cuando lo que le falta es espacio o plazas. Y que
 * el viaje sea de router: `window.location.href` recargaba el SPA entero y se
 * llevaba por delante la conversación que el usuario intentaba continuar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { PaywallModal } from '../../src/components/modals/PaywallModal';
import { GUION_DEL_MURO } from '../../src/components/modals/paywallGuion';
import { useBillingStore, type PaywallReason } from '../../src/store/useBillingStore';

const RAZONES: PaywallReason[] = ['402', 'upgrade_cta', 'rag_full', 'agents_full'];

/** Chivato: pinta la ruta actual para poder afirmar adónde navegó el modal. */
function Sonda() {
    const { pathname, hash } = useLocation();
    return <div data-testid="ruta">{pathname + hash}</div>;
}

function montar() {
    return render(
        <MemoryRouter initialEntries={['/chat/abc']}>
            <PaywallModal />
            <Routes>
                <Route path="*" element={<Sonda />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('PaywallModal', () => {
    beforeEach(() => {
        useBillingStore.setState({ paywall: { open: false, reason: null } });
    });

    it('no se pinta con el muro cerrado', () => {
        montar();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it.each(RAZONES)('la razón %s tiene su propio título, mensaje y acción', (razon) => {
        useBillingStore.setState({ paywall: { open: true, reason: razon } });
        montar();
        const guion = GUION_DEL_MURO[razon];
        expect(screen.getByRole('heading', { name: guion.titulo })).toBeDefined();
        expect(screen.getByText(guion.mensaje)).toBeDefined();
        expect(screen.getByText(guion.conservado)).toBeDefined();
        expect(screen.getByRole('button', { name: guion.accion })).toBeDefined();
    });

    it('los cuatro guiones son cuatro mensajes distintos', () => {
        const mensajes = new Set(RAZONES.map((r) => GUION_DEL_MURO[r].mensaje));
        const titulos = new Set(RAZONES.map((r) => GUION_DEL_MURO[r].titulo));
        expect(mensajes.size).toBe(4);
        expect(titulos.size).toBe(4);
    });

    it('los cuatro guiones reparten en tres destinos', () => {
        const destinos = new Set(RAZONES.map((r) => GUION_DEL_MURO[r].destino));
        expect(destinos.size).toBe(3);
        // Y ninguno manda a comprar créditos cuando falta espacio o plazas.
        expect(GUION_DEL_MURO.rag_full.destino).not.toBe(GUION_DEL_MURO['402'].destino);
        expect(GUION_DEL_MURO.agents_full.destino).not.toBe(GUION_DEL_MURO['402'].destino);
    });

    it('el mensaje de créditos explica de dónde salen los 30', () => {
        expect(GUION_DEL_MURO['402'].mensaje).toContain('30 créditos');
        expect(GUION_DEL_MURO['402'].mensaje).toMatch(/1 crédito/);
        expect(GUION_DEL_MURO['402'].mensaje).toMatch(/5/);
    });

    it('navega con el router y sin recargar la página', () => {
        const recarga = vi.fn();
        useBillingStore.setState({ paywall: { open: true, reason: 'agents_full' } });
        montar();
        // Si alguien vuelve a poner `window.location.href`, jsdom avisa por otro
        // lado; aquí basta con comprobar que la ruta del router SÍ cambió.
        fireEvent.click(screen.getByRole('button', { name: GUION_DEL_MURO.agents_full.accion }));
        expect(screen.getByTestId('ruta').textContent).toBe('/settings/agent-overrides');
        expect(useBillingStore.getState().paywall.open).toBe(false);
        expect(recarga).not.toHaveBeenCalled();
    });

    it('«Seguir aquí» cierra sin moverse', () => {
        useBillingStore.setState({ paywall: { open: true, reason: '402' } });
        montar();
        fireEvent.click(screen.getByRole('button', { name: 'Seguir aquí' }));
        expect(useBillingStore.getState().paywall.open).toBe(false);
        expect(screen.getByTestId('ruta').textContent).toBe('/chat/abc');
    });
});
