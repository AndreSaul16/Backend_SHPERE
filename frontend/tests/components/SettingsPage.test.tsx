import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

// Mock all settings sub-components to avoid pulling in their dependencies
vi.mock('@/pages/settings/ProfileSettings', () => ({
    ProfileSettings: () => <div data-testid="profile-settings">Profile</div>,
}));
vi.mock('@/pages/settings/IntegrationsSettings', () => ({
    IntegrationsSettings: () => <div data-testid="integrations-settings">Integrations</div>,
}));
vi.mock('@/pages/settings/AgentOverridesSettings', () => ({
    AgentOverridesSettings: () => <div data-testid="agent-overrides-settings">Agents</div>,
}));
vi.mock('@/pages/settings/ContactsSettings', () => ({
    ContactsSettings: () => <div data-testid="contacts-settings">Contacts</div>,
}));
vi.mock('@/pages/settings/StorageSettings', () => ({
    StorageSettings: () => <div data-testid="storage-settings">Storage</div>,
}));
vi.mock('@/pages/settings/ServiceCredentialsSettings', () => ({
    ServiceCredentialsSettings: () => <div data-testid="service-credentials-settings">API Keys</div>,
}));
vi.mock('@/pages/settings/BoardMeetingSettings', () => ({
    BoardMeetingSettings: () => <div data-testid="board-meeting-settings">Board Meeting</div>,
}));

describe('SettingsPage — Scroll Fix (Task 2.4, SP-001)', () => {
    const renderSettingsPage = (section = 'profile') => {
        return render(
            <MemoryRouter initialEntries={[`/settings/${section}`]}>
                <SettingsPage />
            </MemoryRouter>
        );
    };

    it('root container allows vertical scroll (not overflow-hidden) — SP-001', () => {
        renderSettingsPage('profile');

        // The root div: <div className="flex flex-col h-full ... overflow-hidden">
        // After fix: overflow-hidden → overflow-y-auto
        const rootContainer = document.querySelector('.flex.flex-col.h-full');
        expect(rootContainer).not.toBeNull();

        const classes = rootContainer!.className;
        // Should allow vertical scrolling
        expect(classes).toContain('overflow-y-auto');
        // Should NOT clip overflow
        expect(classes).not.toContain('overflow-hidden');
    });

    it('renders scrollable content area when page loads — SP-001', () => {
        renderSettingsPage('profile');

        // The main content area should allow overflow scrolling
        const mainElement = screen.getByRole('main');
        expect(mainElement).toBeDefined();
        expect(mainElement.className).toContain('overflow-y-auto');
    });

    it('renders the header with back link', () => {
        renderSettingsPage('profile');

        expect(screen.getByText('Configuración')).toBeInTheDocument();
        // The back arrow link should exist
        const links = screen.getAllByRole('link');
        const backLink = links.find(link => link.getAttribute('href') === '/');
        expect(backLink).toBeDefined();
    });

    it('renders ProfileSettings for default /settings/profile route', () => {
        renderSettingsPage('profile');
        expect(screen.getByTestId('profile-settings')).toBeInTheDocument();
    });
});

/**
 * 6.4 — la navegación del shell de ajustes.
 *
 * Los tres defectos que esto vigila: la pestaña activa se distinguía sólo por
 * color y sin `aria-current`; la barra de móvil se desplazaba sin ninguna pista
 * visual (a 320px «Contactos» era indescubrible); y Facturación y el panel de
 * administración vivían fuera de esta navegación aunque son ajustes de cuenta.
 */
describe('SettingsPage — navegación (6.4)', () => {
    const montar = (section = 'profile') =>
        render(
            <MemoryRouter initialEntries={[`/settings/${section}`]}>
                <SettingsPage />
            </MemoryRouter>
        );

    it('la sección activa se anuncia con aria-current, no sólo con color', () => {
        montar('contacts');
        const activos = screen
            .getAllByRole('link')
            .filter((a) => a.getAttribute('aria-current') === 'page');
        // Una por forma de la navegación (lateral y desplazable): las dos se
        // pintan siempre y el breakpoint decide cuál se ve.
        expect(activos.length).toBeGreaterThan(0);
        activos.forEach((a) => expect(a.getAttribute('href')).toBe('/settings/contacts'));
    });

    it('todas las secciones son alcanzables desde la navegación', () => {
        montar('profile');
        const destinos = new Set(
            screen.getAllByRole('link').map((a) => a.getAttribute('href'))
        );
        ['profile', 'integrations', 'board-meeting', 'agent-overrides', 'contacts'].forEach((id) =>
            expect(destinos.has(`/settings/${id}`)).toBe(true)
        );
    });

    it('Facturación entra en la navegación de la cuenta', () => {
        montar('profile');
        const destinos = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
        expect(destinos).toContain('/billing');
    });

    it('el panel de administración NO se ofrece sin permiso', () => {
        montar('profile');
        const destinos = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
        expect(destinos).not.toContain('/admin');
    });

    it('la barra desplazable lleva sus dos pistas de desvanecimiento', () => {
        const { container } = montar('profile');
        // Dos cantos, ocultos mientras no haya nada que revelar: la pista es su
        // aparición, no su presencia.
        const pistas = container.querySelectorAll('span[aria-hidden="true"].pointer-events-none');
        expect(pistas.length).toBe(2);
    });
});
