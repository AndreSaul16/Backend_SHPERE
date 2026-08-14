import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA-4 · defecto 3 — el falso «Ventana cerrada» del acceso social.
 *
 * Con la COOP cortando el grupo de contextos de navegación, el sondeo interno
 * del SDK de Firebase puede leer `window.closed === true` antes de tiempo y
 * rechazar el acceso con `auth/popup-closed-by-user` a los ~8 segundos aunque
 * el acceso esté yendo bien. La pantalla lo traducía a «Ventana cerrada.
 * Inténtalo de nuevo.» y ahí se acababa el camino: no había ninguna salida.
 *
 * La corrección de raíz es la COOP correcta llegando al documento (defecto 2).
 * Esto es la red por debajo, y la decisión de producto que la gobierna:
 *
 *   NO se redirige solo. Cerrar el popup a propósito es «he cambiado de
 *   idea», y secuestrar la página hacia Google por nuestra cuenta sería
 *   hostil. Se OFRECE la redirección; la pulsa quien quiera.
 *
 * Por eso el test central no es que el botón funcione, sino que NADIE llame a
 * la redirección sin que el usuario la haya pedido.
 */

const signInWithEmail = vi.fn();
const signUpWithEmail = vi.fn();
const signInWithGoogle = vi.fn();
const signInWithGithub = vi.fn();
const signInWithMicrosoft = vi.fn();
const continuarConRedireccion = vi.fn();

vi.mock('@/contexts/auth', () => ({
    useAuth: () => ({
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGithub,
        signInWithMicrosoft,
        continuarConRedireccion,
    }),
}));

const { LoginPage } = await import('../../src/pages/LoginPage');
const { RegisterPage } = await import('../../src/pages/RegisterPage');

/** El fallo que Firebase lanza —de verdad o por culpa de la COOP—. */
const ventanaCerrada = () =>
    Object.assign(new Error('popup closed'), { code: 'auth/popup-closed-by-user' });

const REDIRIGIR = /continuar con redirección/i;

const montar = (Pagina: () => React.ReactElement) =>
    render(
        <MemoryRouter>
            <Pagina />
        </MemoryRouter>,
    );

beforeEach(() => {
    for (const fn of [
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGithub,
        signInWithMicrosoft,
        continuarConRedireccion,
    ]) {
        fn.mockReset().mockResolvedValue(undefined);
    }
});

describe('iniciar sesión', () => {
    it('ofrece la redirección tras un «ventana cerrada», pero no redirige sola', async () => {
        const user = userEvent.setup();
        signInWithGoogle.mockRejectedValue(ventanaCerrada());

        montar(LoginPage);
        await user.click(screen.getByRole('button', { name: 'Google' }));

        expect(await screen.findByRole('button', { name: REDIRIGIR })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent(/ventana cerrada/i);
        // Lo importante: NADIE ha redirigido por su cuenta.
        expect(continuarConRedireccion).not.toHaveBeenCalled();
    });

    it('al pulsarlo redirige con el MISMO proveedor que falló', async () => {
        const user = userEvent.setup();
        signInWithMicrosoft.mockRejectedValue(ventanaCerrada());

        montar(LoginPage);
        await user.click(screen.getByRole('button', { name: 'Microsoft' }));
        await user.click(await screen.findByRole('button', { name: REDIRIGIR }));

        expect(continuarConRedireccion).toHaveBeenCalledWith('microsoft');
    });

    it('los demás fallos del popup no ofrecen redirección', async () => {
        const user = userEvent.setup();
        signInWithGoogle.mockRejectedValue(
            Object.assign(new Error('bloqueado'), { code: 'auth/popup-blocked' }),
        );

        montar(LoginPage);
        await user.click(screen.getByRole('button', { name: 'Google' }));

        // El aviso sí sale; la redirección no se ofrece: para un popup
        // bloqueado o un fallo de red, redirigir no es la salida.
        expect(await screen.findByRole('alert')).toHaveTextContent(/acceso social/i);
        expect(screen.queryByRole('button', { name: REDIRIGIR })).not.toBeInTheDocument();
    });

    it('un fallo del formulario de correo tampoco la ofrece', async () => {
        const user = userEvent.setup();
        signInWithEmail.mockRejectedValue(
            Object.assign(new Error('mal'), { code: 'auth/wrong-password' }),
        );

        montar(LoginPage);
        await user.type(screen.getByLabelText(/correo electrónico/i), 'socia@ejemplo.com');
        await user.type(screen.getByLabelText(/^contraseña/i), 'secreta1');
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/contraseña incorrecta/i);
        expect(screen.queryByRole('button', { name: REDIRIGIR })).not.toBeInTheDocument();
    });
});

describe('crear cuenta', () => {
    it('tiene la misma salida, con su propio proveedor', async () => {
        const user = userEvent.setup();
        signInWithGithub.mockRejectedValue(ventanaCerrada());

        montar(RegisterPage);
        await user.click(screen.getByRole('button', { name: 'GitHub' }));

        expect(await screen.findByRole('button', { name: REDIRIGIR })).toBeInTheDocument();
        expect(continuarConRedireccion).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: REDIRIGIR }));
        expect(continuarConRedireccion).toHaveBeenCalledWith('github');
    });

    it('y tampoco la ofrece ante otros fallos', async () => {
        const user = userEvent.setup();
        signInWithGithub.mockRejectedValue(
            Object.assign(new Error('cancelado'), { code: 'auth/cancelled-popup-request' }),
        );

        montar(RegisterPage);
        await user.click(screen.getByRole('button', { name: 'GitHub' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/registro social/i);
        expect(screen.queryByRole('button', { name: REDIRIGIR })).not.toBeInTheDocument();
    });
});
