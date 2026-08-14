import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * QA-4 · defecto 3 — el otro extremo del cable.
 *
 * `AccesoSocialConRedireccion.test.tsx` prueba que la pantalla OFRECE la
 * redirección y no la dispara sola. Esto prueba lo que hay al otro lado del
 * contexto: que `continuarConRedireccion` llama de verdad a
 * `signInWithRedirect` con el proveedor de Firebase que toca, y que al VOLVER
 * de la redirección alguien recoge el resultado.
 *
 * Sin `getRedirectResult` el ciclo se queda a medias: el usuario vuelve de
 * Google y la aplicación no se entera de que ya está identificado.
 */

const onAuthStateChanged = vi.fn();
const getRedirectResult = vi.fn();
const signInWithRedirect = vi.fn();

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: (...args: unknown[]) => onAuthStateChanged(...args),
    getRedirectResult: (...args: unknown[]) => getRedirectResult(...args),
    signInWithRedirect: (...args: unknown[]) => signInWithRedirect(...args),
    signInWithPopup: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    sendEmailVerification: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    verifyPasswordResetCode: vi.fn(),
    confirmPasswordReset: vi.fn(),
}));

const auth = { currentUser: null };
const googleProvider = { proveedor: 'google' };
const githubProvider = { proveedor: 'github' };
const microsoftProvider = { proveedor: 'microsoft' };

vi.mock('@/lib/firebase', () => ({
    auth,
    googleProvider,
    githubProvider,
    microsoftProvider,
}));

vi.mock('@/lib/analytics', () => ({
    initAnalytics: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
    resetAnalytics: vi.fn(),
    ANALYTICS_EVENTS: { SIGNUP_COMPLETED: 'signup_completed' },
}));

const { AuthProvider } = await import('../../src/contexts/AuthContext');
const { useAuth } = await import('../../src/contexts/auth');

/** Un consumidor mínimo: un botón por proveedor que pide la redirección. */
function Consumidor() {
    const { continuarConRedireccion } = useAuth();
    return (
        <>
            <p>sesión lista</p>
            {(['google', 'github', 'microsoft'] as const).map((p) => (
                <button key={p} onClick={() => void continuarConRedireccion(p)}>
                    {p}
                </button>
            ))}
        </>
    );
}

const montar = () =>
    render(
        <AuthProvider>
            <Consumidor />
        </AuthProvider>,
    );

beforeEach(() => {
    onAuthStateChanged.mockReset().mockImplementation(() => () => {});
    getRedirectResult.mockReset().mockResolvedValue(null);
    signInWithRedirect.mockReset().mockResolvedValue(undefined);
});

describe('el ciclo de la redirección', () => {
    it('recoge el resultado al montar, una sola vez, y no estorba al flujo normal', async () => {
        montar();

        await waitFor(() => expect(getRedirectResult).toHaveBeenCalledTimes(1));
        expect(getRedirectResult).toHaveBeenCalledWith(auth);
        // Sin resultado (la carga normal, nadie vuelve de ningún sitio) la
        // aplicación se pinta igual: recoger el resultado no bloquea nada.
        expect(screen.getByText('sesión lista')).toBeInTheDocument();
    });

    it('si recoger el resultado falla, la aplicación sigue en pie', async () => {
        getRedirectResult.mockRejectedValue(new Error('vuelta rota'));

        montar();

        await waitFor(() => expect(getRedirectResult).toHaveBeenCalledTimes(1));
        expect(screen.getByText('sesión lista')).toBeInTheDocument();
    });

    it.each([
        ['google', googleProvider],
        ['github', githubProvider],
        ['microsoft', microsoftProvider],
    ])('continuarConRedireccion(%s) redirige con su proveedor', async (nombre, proveedor) => {
        const user = userEvent.setup();
        montar();

        await user.click(screen.getByRole('button', { name: nombre as string }));

        expect(signInWithRedirect).toHaveBeenCalledWith(auth, proveedor);
    });
});
