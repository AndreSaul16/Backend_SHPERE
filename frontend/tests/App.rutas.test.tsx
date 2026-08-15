import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { RUTA_DE_INICIO } from '../src/lib/rutas';

/**
 * El árbol de rutas de `App.tsx`, que hasta este ciclo no tenía NI UN test.
 *
 * Se escribe ahora porque la casa del producto se ha mudado: la landing de
 * marketing ocupa la raíz exacta del dominio (`location = /` en nginx) y la
 * primera pantalla del producto pasa a `/chat`. Esa mudanza se puede hacer mal
 * de una forma muy silenciosa —dejando `/` como ruta viva de la SPA— porque en
 * desarrollo y en los tests `/` seguiría funcionando: el único sitio donde
 * falla es producción, que es el único sitio donde nginx existe.
 *
 * Lo que se defiende aquí es el contrato de navegación, no el chat:
 * `ChatPanel` y el resto de páginas se sustituyen por marcas de una línea. Sus
 * propios ficheros ya los prueban, y montarlos de verdad convertiría un test de
 * enrutado en un test de todo.
 */

// ── La sesión que la aplicación cree tener ──────────────────────────────────
//
// `useAuth` se lee desde `RequireAuth` en CADA render del enrutador, así que
// basta con mover esta variable: la propia navegación que dispara el login
// vuelve a evaluarlo y la guarda ve ya la sesión abierta. Es exactamente la
// secuencia real (Firebase resuelve, el contexto se actualiza, la ruta pasa).
type UsuarioFalso = { providerId: string; emailVerified: boolean } | null;
let usuario: UsuarioFalso = null;

const signInWithEmail = vi.fn(async () => {
    usuario = { providerId: 'google.com', emailVerified: true };
});

vi.mock('@/contexts/AuthContext', () => ({
    AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/contexts/auth', () => ({
    useAuth: () => ({
        user: usuario,
        loading: false,
        signInWithEmail,
        signUpWithEmail: vi.fn(),
        signInWithGoogle: vi.fn(),
        signInWithGithub: vi.fn(),
        signInWithMicrosoft: vi.fn(),
        continuarConRedireccion: vi.fn(),
    }),
}));

// El catálogo de módulos perezosos, con marcas en vez de páginas. `entrar` es
// la excepción y carga la página REAL: el destino por defecto tras
// identificarse vive dentro de `LoginPage`, y es justo lo que se prueba.
vi.mock('@/lib/rutasPerezosas', () => ({
    MODULOS_DE_RUTA: {
        chat: () => Promise.resolve({ ChatPanel: () => <div data-testid="chat-panel">el chat</div> }),
        panelDeArtefactos: () => Promise.resolve({ ArtifactPanel: () => null }),
        entrar: () => import('@/pages/LoginPage'),
        perfil: () => Promise.resolve({ ProfilePage: () => <div>perfil</div> }),
        ajustesDeConversacion: () => Promise.resolve({ ChatSettingsPage: () => <div>ajustes de conversación</div> }),
        detalleDeAgente: () => Promise.resolve({ AgentDetailPage: () => <div>agente</div> }),
        ajustes: () => Promise.resolve({ SettingsPage: () => <div>ajustes</div> }),
        facturacion: () => Promise.resolve({ BillingPage: () => <div>facturación</div> }),
        admin: () => Promise.resolve({ AdminPage: () => <div>admin</div> }),
        registro: () => Promise.resolve({ RegisterPage: () => <div>registro</div> }),
        verificarEmail: () => Promise.resolve({ VerifyEmailPage: () => <div>verificar</div> }),
        recuperarContrasena: () => Promise.resolve({ ResetPasswordPage: () => <div>recuperar</div> }),
        conversacionCompartida: () => Promise.resolve({ SharedSessionPage: () => <div>compartida</div> }),
    },
    precargarRuta: vi.fn(),
    precargaAlApuntar: () => ({}),
    __resetPrecarga: vi.fn(),
}));

// El chrome de las rutas protegidas. `MainLayout` deja pasar su hueco central,
// que es lo único que este fichero mira; el rail y los cuatro elementos de raíz
// hablan con el backend y no tienen nada que decir sobre a qué ruta se va.
vi.mock('@/components/layout/MainLayout', () => ({
    MainLayout: ({ chat }: { chat: ReactNode }) => <div data-testid="shell">{chat}</div>,
}));
vi.mock('@/components/sidebar/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/common/ErrorOverlay', () => ({ ErrorOverlay: () => null }));
vi.mock('@/components/common/ConnectionBanner', () => ({ ConnectionBanner: () => null }));
vi.mock('@/components/modals/PaywallModal', () => ({ PaywallModal: () => null }));
vi.mock('@/components/modals/AgentSelectorModal', () => ({ AgentSelectorModal: () => null }));
vi.mock('@/components/ui/Toast', () => ({ ToastProvider: () => null }));
vi.mock('@/components/ui/CommandPalette', () => ({ CommandPalette: () => null }));

// El store sólo se toca desde `AuthenticatedApp` para dos cargas iniciales que
// aquí no interesan; sin este doble saldrían a la red y `onUnhandledRequest:
// 'error'` tumbaría el fichero por un motivo que no es el suyo.
vi.mock('@/store/useChatStore', () => {
    const estado = { fetchSessions: vi.fn(), fetchCustomAgents: vi.fn() };
    const useChatStore = (selector: (s: typeof estado) => unknown) => selector(estado);
    useChatStore.getState = () => estado;
    return { useChatStore };
});

// Dinámico y después de los dobles: los `vi.fn()` de arriba tienen que existir
// antes de que `App` arrastre el grafo entero. Mismo motivo (y misma forma) que
// en `AccesoSocialConRedireccion.test.tsx`.
const { default: App } = await import('../src/App');

/** Dice en qué ruta ha acabado el enrutador. */
function SondaDeRuta() {
    const { pathname } = useLocation();
    return <span data-testid="ruta">{pathname}</span>;
}

const montar = (entrada: string) =>
    render(
        <MemoryRouter initialEntries={[entrada]}>
            <App />
            <SondaDeRuta />
        </MemoryRouter>,
    );

const rutaActual = () => screen.getByTestId('ruta').textContent;

beforeEach(() => {
    usuario = null;
    signInWithEmail.mockClear();
});

describe('la casa del producto es /chat', () => {
    it('con sesión, /chat pinta el chat', async () => {
        usuario = { providerId: 'google.com', emailVerified: true };
        montar(RUTA_DE_INICIO);

        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe('/chat');
    });

    it('/chat/:sessionId pinta el mismo chat', async () => {
        usuario = { providerId: 'google.com', emailVerified: true };
        montar('/chat/una-junta');

        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe('/chat/una-junta');
    });
});

describe('una navegación de cliente a / acaba en el chat', () => {
    /**
     * Este es el caso que nginx NO cubre. Un `<Link to="/">` viejo, un
     * `history.push` de una librería o el botón de atrás sobre una entrada
     * anterior a la mudanza no salen al servidor: los resuelve el enrutador,
     * dentro de la aplicación ya cargada. Sin la ruta `/` → `/chat` en
     * `App.tsx` eso caería en el `*`, que hace lo mismo pero sin querer.
     */
    it('/ redirige a /chat y pinta el chat, con sesión', async () => {
        usuario = { providerId: 'google.com', emailVerified: true };
        montar('/');

        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe(RUTA_DE_INICIO);
    });

    it('/ redirige a /chat también sin sesión, y de ahí a /login', async () => {
        // El orden importa: primero la mudanza (`/` → `/chat`), después la
        // guarda de sesión. Si fuese al revés, el destino que se guarda para
        // volver sería `/` — o sea la landing — y quien se identificase
        // acabaría en la portada comercial.
        montar('/');

        await waitFor(() => expect(rutaActual()).toBe('/login'));
    });
});

describe('una ruta desconocida acaba en el chat', () => {
    it('/status (retirada) redirige a /chat', async () => {
        usuario = { providerId: 'google.com', emailVerified: true };
        montar('/status');

        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe(RUTA_DE_INICIO);
    });

    it('una ruta inventada y profunda también', async () => {
        usuario = { providerId: 'google.com', emailVerified: true };
        montar('/esto/no/existe');

        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe(RUTA_DE_INICIO);
    });
});

describe('el flujo de identificarse acaba en el chat', () => {
    it('sin destino guardado, entrar lleva a /chat y no a la raíz', async () => {
        const user = userEvent.setup();
        montar('/login');

        await user.type(await screen.findByLabelText(/Correo electrónico/), 'ana@ejemplo.test');
        await user.type(screen.getByLabelText(/Contraseña/), 'secreta-de-verdad');
        await user.click(screen.getByRole('button', { name: /Entrar|Iniciar sesión|Acceder/i }));

        await waitFor(() => expect(signInWithEmail).toHaveBeenCalled());
        expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
        expect(rutaActual()).toBe(RUTA_DE_INICIO);
    });

    it('con destino guardado, entrar respeta el destino y NO va al chat', async () => {
        // La mudanza no puede haberse llevado por delante 6.2: quien pedía
        // `/billing` sin sesión sigue volviendo a `/billing`.
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[{ pathname: '/login', state: { destino: '/billing' } }]}>
                <App />
                <SondaDeRuta />
            </MemoryRouter>,
        );

        await user.type(await screen.findByLabelText(/Correo electrónico/), 'ana@ejemplo.test');
        await user.type(screen.getByLabelText(/Contraseña/), 'secreta-de-verdad');
        await user.click(screen.getByRole('button', { name: /Entrar|Iniciar sesión|Acceder/i }));

        await waitFor(() => expect(rutaActual()).toBe('/billing'));
    });
});
