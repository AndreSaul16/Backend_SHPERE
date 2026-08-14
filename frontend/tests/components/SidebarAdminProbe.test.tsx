import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { Sidebar } from '../../src/components/sidebar/Sidebar';
import { useChatStore } from '../../src/store/useChatStore';
import { useBillingStore } from '../../src/store/useBillingStore';
import { useAuth } from '../../src/contexts/auth';
import { adminService } from '../../src/services/api';

/**
 * F1 (P0) — la sonda de administración no puede abrir el paywall.
 *
 * `Sidebar` pregunta al backend si esta cuenta tiene panel de administración.
 * Para casi todo el mundo la respuesta es 403, y ese 403 es el RESULTADO
 * ESPERADO. Antes la pregunta se hacía con `adminService.users()`, que pasa por
 * `handleError` → `inferCodeFromStatus(403)` → `perm.plan_not_allowed` →
 * `openPaywall('upgrade_cta')`: cada usuario no administrador veía el modal
 * «Has agotado tus créditos» en cada carga de la aplicación.
 *
 * Verificado en las dos direcciones: con `adminService.users()` en la sidebar
 * este archivo falla (`paywall.open === true`); con `adminService.isAdmin()`
 * pasa.
 */

vi.mock('../../src/contexts/auth', () => ({
    useAuth: vi.fn(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../src/hooks/useUserAvatar', () => ({
    useUserAvatar: () => null,
}));

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, layout, variants, whileHover, whileTap, whileFocus, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: { div: Component, span: Component, h3: Component, p: Component, header: Component, nav: Component, button: Component },
    };
});

const ADMIN_USERS = 'http://localhost:8000/api/v1/admin/users';
const ME = 'http://localhost:8000/api/v1/me';

/** Un perfil de GET /me; `is_admin` se decide en cada caso. */
const perfil = (extra: Record<string, unknown> = {}) => ({
    firebase_uid: 'u1',
    email: 'a@b.es',
    display_name: 'Ana',
    ...extra,
});

describe('F1 — la sonda de administración no abre el paywall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({
            user: { uid: 'u1', email: 'a@b.es', displayName: 'Ana', photoURL: null },
            loading: false,
        });
        useChatStore.setState({
            sessions: [], currentSessionId: null, streamingSessionIds: [],
            coreAgents: [], customAgents: [],
        });
        useBillingStore.setState({ paywall: { open: false, reason: null } });
    });

    it('un 403 en /admin/users deja el paywall cerrado y esconde el enlace', async () => {
        let sondeado = false;
        server.use(http.get(ADMIN_USERS, () => {
            sondeado = true;
            return HttpResponse.json({ detail: 'Not enough permissions' }, { status: 403 });
        }));

        render(<MemoryRouter><Sidebar /></MemoryRouter>);

        // La sonda es asíncrona: se espera a que el backend la haya contestado
        // y a que la cadena de promesas del manejador termine. Sin esto el test
        // pasaría por llegar antes que el fallo, no por estar arreglado.
        await waitFor(() => expect(sondeado).toBe(true));
        await new Promise((r) => setTimeout(r, 20));

        expect(useBillingStore.getState().paywall.open).toBe(false);
        expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });

    it('con acceso concedido aparece el enlace de administración', async () => {
        server.use(http.get(ADMIN_USERS, () => HttpResponse.json([])));

        render(<MemoryRouter><Sidebar /></MemoryRouter>);

        expect(await screen.findByRole('link', { name: 'Admin' })).toBeInTheDocument();
        expect(useBillingStore.getState().paywall.open).toBe(false);
    });

    /**
     * QA-4 — el arreglo de raíz: si el perfil ya trae `is_admin`, la sonda no
     * llega a existir. Es lo que borra los ~11 `403` de la consola, porque el
     * shell se remonta al navegar y antes cada remontaje sondeaba de nuevo.
     */
    it('con is_admin en el perfil el enlace sale sin sondear /admin/users', async () => {
        let sondeado = false;
        server.use(
            http.get(ME, () => HttpResponse.json(perfil({ is_admin: true }))),
            http.get(ADMIN_USERS, () => {
                sondeado = true;
                return HttpResponse.json([]);
            }),
        );

        render(<MemoryRouter><Sidebar /></MemoryRouter>);

        expect(await screen.findByRole('link', { name: 'Admin' })).toBeInTheDocument();
        expect(sondeado).toBe(false);
        expect(useBillingStore.getState().paywall.open).toBe(false);
    });

    it('y con is_admin false tampoco se sondea: ni enlace ni 403', async () => {
        let sondeado = false;
        let perfilPedido = false;
        server.use(
            http.get(ME, () => {
                perfilPedido = true;
                return HttpResponse.json(perfil({ is_admin: false }));
            }),
            http.get(ADMIN_USERS, () => {
                sondeado = true;
                return HttpResponse.json([]);
            }),
        );

        render(<MemoryRouter><Sidebar /></MemoryRouter>);

        // Se espera a que el perfil esté contestado y a que la cadena de
        // promesas termine: sin esto el test pasaría por llegar antes que la
        // sonda, no por que la sonda ya no exista.
        await waitFor(() => expect(perfilPedido).toBe(true));
        await new Promise((r) => setTimeout(r, 20));

        expect(sondeado).toBe(false);
        expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });

    it('adminService.isAdmin() devuelve false ante un 403 sin efectos globales', async () => {
        server.use(http.get(ADMIN_USERS, () => HttpResponse.json({ detail: 'Not enough permissions' }, { status: 403 })));

        await expect(adminService.isAdmin()).resolves.toBe(false);
        expect(useBillingStore.getState().paywall.open).toBe(false);
    });

    it('adminService.users() (acción real, no sonda) sigue avisando al manejador global', async () => {
        server.use(http.get(ADMIN_USERS, () => HttpResponse.json({ detail: 'Not enough permissions' }, { status: 403 })));

        await expect(adminService.users()).rejects.toThrow();
        // El 403 de una acción DELIBERADA sí es un incidente: el contrato de
        // `handleError` no cambia, solo deja de aplicarse a la sonda.
        expect(useBillingStore.getState().paywall.open).toBe(true);
    });
});
