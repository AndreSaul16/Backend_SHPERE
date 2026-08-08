import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Tarea 5.14 · D26/D27 — recuperación de contraseña.
 *
 * Antes de esta tarea la aplicación NO tenía ninguna: ni ruta, ni enlace, ni
 * llamada a Firebase. Lo que se fija aquí:
 *
 * 1. Desde `/login` se puede LLEGAR (si el enlace no está, la ruta no existe
 *    para nadie).
 * 2. Pedir el enlace no confirma si la cuenta existe — ni siquiera cuando
 *    Firebase responde `auth/user-not-found`. Un formulario que distingue es un
 *    comprobador de cuentas.
 * 3. El código del enlace se valida ANTES de enseñar los campos.
 * 4. La validación en vivo no es impaciente y bloquea el envío mientras falla.
 * 5. Los campos llevan `autoComplete`, que es lo que hace que el gestor de
 *    contraseñas rellene y guarde en la cuenta correcta.
 */

const sendPasswordReset = vi.fn<(email: string) => Promise<void>>();
const verifyPasswordReset = vi.fn<(code: string) => Promise<string>>();
const confirmPasswordResetWithCode =
    vi.fn<(code: string, password: string) => Promise<void>>();

vi.mock('@/contexts/auth', () => ({
    useAuth: () => ({
        sendPasswordReset,
        verifyPasswordReset,
        confirmPasswordResetWithCode,
    }),
}));

const { ResetPasswordPage } = await import('../../src/pages/ResetPasswordPage');
const { LoginPage } = await import('../../src/pages/LoginPage');

function montar(ruta: string) {
    return render(
        <MemoryRouter initialEntries={[ruta]}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    sendPasswordReset.mockReset().mockResolvedValue(undefined);
    verifyPasswordReset.mockReset().mockResolvedValue('socia@ejemplo.com');
    confirmPasswordResetWithCode.mockReset().mockResolvedValue(undefined);
});

describe('la salida existe desde donde se descubre el problema', () => {
    it('login enseña el enlace de recuperación y apunta a /reset-password', () => {
        montar('/login');
        const enlace = screen.getByRole('link', { name: /has olvidado tu contraseña/i });
        expect(enlace).toHaveAttribute('href', '/reset-password');
    });

    it('los campos de login llevan autoComplete para el gestor de contraseñas', () => {
        montar('/login');
        expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute(
            'autocomplete',
            'email',
        );
        expect(screen.getByLabelText(/^contraseña/i)).toHaveAttribute(
            'autocomplete',
            'current-password',
        );
    });
});

describe('pedir el enlace', () => {
    it('envía el correo y no dice si la cuenta existe', async () => {
        const user = userEvent.setup();
        montar('/reset-password');

        await user.type(screen.getByLabelText(/correo electrónico/i), 'socia@ejemplo.com');
        await user.click(screen.getByRole('button', { name: /enviar enlace/i }));

        expect(sendPasswordReset).toHaveBeenCalledWith('socia@ejemplo.com');
        expect(await screen.findByRole('status')).toHaveTextContent(/si hay una cuenta/i);
    });

    it('una cuenta inexistente da EXACTAMENTE el mismo aviso', async () => {
        sendPasswordReset.mockRejectedValue({ code: 'auth/user-not-found' });
        const user = userEvent.setup();
        montar('/reset-password');

        await user.type(screen.getByLabelText(/correo electrónico/i), 'nadie@ejemplo.com');
        await user.click(screen.getByRole('button', { name: /enviar enlace/i }));

        expect(await screen.findByRole('status')).toHaveTextContent(/si hay una cuenta/i);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('el formato del correo se valida en vivo, sólo tras abandonar el campo', async () => {
        const user = userEvent.setup();
        montar('/reset-password');

        const campo = screen.getByLabelText(/correo electrónico/i);
        await user.type(campo, 'socia');
        // Todavía escribiendo: no se le grita a nadie a media palabra.
        expect(screen.queryByText(/falta el arroba/i)).toBeNull();

        await user.tab();
        expect(await screen.findByText(/falta el arroba/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /enviar enlace/i })).toBeDisabled();
        expect(campo).toHaveAttribute('aria-invalid', 'true');
    });

    it('un fallo real sí se cuenta, con lo que se puede hacer', async () => {
        sendPasswordReset.mockRejectedValue({ code: 'auth/too-many-requests' });
        const user = userEvent.setup();
        montar('/reset-password');

        await user.type(screen.getByLabelText(/correo electrónico/i), 'socia@ejemplo.com');
        await user.click(screen.getByRole('button', { name: /enviar enlace/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/espera unos minutos/i);
    });
});

describe('cambiar la contraseña con el código del correo', () => {
    it('valida el código antes de enseñar los campos y nombra la cuenta', async () => {
        montar('/reset-password?oobCode=CODIGO');

        expect(verifyPasswordReset).toHaveBeenCalledWith('CODIGO');
        expect(await screen.findByText('socia@ejemplo.com')).toBeInTheDocument();
        expect(screen.getByLabelText(/contraseña nueva/i, { selector: 'input' })).toHaveAttribute(
            'autocomplete',
            'new-password',
        );
    });

    it('un código caducado no enseña ningún campo y ofrece pedir otro', async () => {
        verifyPasswordReset.mockRejectedValue({ code: 'auth/expired-action-code' });
        montar('/reset-password?oobCode=VIEJO');

        expect(await screen.findByRole('alert')).toHaveTextContent(/ha caducado/i);
        expect(screen.queryByLabelText(/contraseña nueva/i)).toBeNull();
        expect(
            screen.getByRole('link', { name: /pedir un enlace nuevo/i }),
        ).toHaveAttribute('href', '/reset-password');
    });

    it('dos contraseñas distintas bloquean el envío y lo explican', async () => {
        const user = userEvent.setup();
        montar('/reset-password?oobCode=CODIGO');

        await user.type(await screen.findByLabelText(/contraseña nueva/i, { selector: 'input' }), 'secreta1');
        await user.type(screen.getByLabelText(/repite la contraseña/i), 'secreta2');
        await user.tab();

        // `PasswordField` duplica su error en un `<p class="sr-only">`, así que
        // el texto aparece dos veces a propósito: se comprueba que está, no
        // cuántas veces.
        expect((await screen.findAllByText(/no coinciden/i)).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /cambiar contraseña/i })).toBeDisabled();
        expect(confirmPasswordResetWithCode).not.toHaveBeenCalled();
    });

    it('con las dos iguales se cambia y se confirma', async () => {
        const user = userEvent.setup();
        montar('/reset-password?oobCode=CODIGO');

        await user.type(await screen.findByLabelText(/contraseña nueva/i, { selector: 'input' }), 'secreta1');
        await user.type(screen.getByLabelText(/repite la contraseña/i), 'secreta1');
        await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

        await waitFor(() =>
            expect(confirmPasswordResetWithCode).toHaveBeenCalledWith('CODIGO', 'secreta1'),
        );
        expect(await screen.findByRole('status')).toHaveTextContent(/contraseña cambiada/i);
    });
});
