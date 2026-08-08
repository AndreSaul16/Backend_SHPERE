import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { AdminPage } from '../../src/pages/AdminPage';

const USERS = 'http://localhost:8000/api/v1/admin/users';

describe('AdminPage (F4/F5)', () => {
    it('muestra "Sin acceso" si el backend devuelve 403', async () => {
        server.use(
            http.get(USERS, () => HttpResponse.json({ detail: 'Sin acceso' }, { status: 403 }))
        );
        render(<MemoryRouter><AdminPage /></MemoryRouter>);
        await waitFor(() => expect(screen.getByText('Sin acceso')).toBeInTheDocument());
    });

    it('lista usuarios cuando el acceso es admin', async () => {
        server.use(
            http.get(USERS, () =>
                HttpResponse.json([
                    { uid: 'u1', email: 'a@b.com', plan: 'free', pro_messages_balance: 10, topup_messages_balance: 5 },
                ])
            )
        );
        render(<MemoryRouter><AdminPage /></MemoryRouter>);
        expect(await screen.findByText('a@b.com')).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'free' })).toBeInTheDocument();
    });
});

/**
 * 6.9 — la lista de usuarios es una tabla, mover créditos se confirma y la
 * negativa tiene salida.
 */
const USUARIOS = [
    { uid: 'u1', email: 'zoe@b.com', plan: 'free', pro_messages_balance: 3, topup_messages_balance: 40 },
    { uid: 'u2', email: 'ana@b.com', plan: 'free', pro_messages_balance: 30, topup_messages_balance: 0 },
];

describe('AdminPage — tabla accesible y guardas (6.9)', () => {
    const montar = () => {
        server.use(http.get(USERS, () => HttpResponse.json(USUARIOS)));
        return render(<MemoryRouter><AdminPage /></MemoryRouter>);
    };

    it('la tabla se explica sola: caption, cabeceras de columna y de fila', async () => {
        montar();
        const tabla = await screen.findByRole('table');
        // El `<caption>` dice cuántos hay y qué hacer con la tabla.
        expect(within(tabla).getByText(/2 usuarios/)).toBeInTheDocument();
        // Cuatro cabeceras de columna…
        expect(within(tabla).getAllByRole('columnheader')).toHaveLength(4);
        // …y una cabecera por fila: el correo es lo que da nombre a los números.
        expect(within(tabla).getAllByRole('rowheader')).toHaveLength(2);
    });

    it('la columna por la que se ordena lo declara con aria-sort, y alterna', async () => {
        const user = userEvent.setup();
        montar();
        await screen.findByRole('table');

        const usuario = screen.getByRole('columnheader', { name: /Usuario/ });
        expect(usuario.getAttribute('aria-sort')).toBe('ascending');
        // Las demás dicen «none», no se callan.
        expect(screen.getByRole('columnheader', { name: /Comprados/ }).getAttribute('aria-sort')).toBe('none');

        await user.click(within(usuario).getByRole('button'));
        expect(usuario.getAttribute('aria-sort')).toBe('descending');

        await user.click(within(screen.getByRole('columnheader', { name: /Comprados/ })).getByRole('button'));
        expect(screen.getByRole('columnheader', { name: /Comprados/ }).getAttribute('aria-sort')).toBe('ascending');
        expect(usuario.getAttribute('aria-sort')).toBe('none');
    });

    it('mover créditos exige confirmación, y la confirmación dice de cuánto a cuánto', async () => {
        const user = userEvent.setup();
        let ajustado = false;
        server.use(
            http.get(USERS, () => HttpResponse.json(USUARIOS)),
            http.get(/\/admin\/users\/.+\/transactions/, () => HttpResponse.json({ transactions: [] })),
            http.post(/\/admin\/users\/.+\/adjust/, () => {
                ajustado = true;
                return HttpResponse.json({ uid: 'u1', delta: 15, topup_messages_balance: 55 });
            }),
        );
        render(<MemoryRouter><AdminPage /></MemoryRouter>);

        await user.click(await screen.findByRole('button', { name: 'zoe@b.com' }));
        await user.clear(screen.getByLabelText('Delta de créditos'));
        await user.type(screen.getByLabelText('Delta de créditos'), '15');
        await user.type(screen.getByLabelText('Motivo'), 'compensación');
        await user.click(screen.getByRole('button', { name: /Revisar y aplicar/ }));

        // Nada se ha movido todavía.
        expect(ajustado).toBe(false);
        const dialogo = await screen.findByRole('dialog');
        expect(within(dialogo).getByText(/de/)).toBeInTheDocument();
        expect(dialogo.textContent).toMatch(/40/);
        expect(dialogo.textContent).toMatch(/55/);

        await user.click(within(dialogo).getByRole('button', { name: /Añadir créditos/ }));
        await waitFor(() => expect(ajustado).toBe(true));
    });

    it('la negativa de acceso ofrece una salida, no un callejón', async () => {
        server.use(http.get(USERS, () => HttpResponse.json({ detail: 'nope' }, { status: 403 })));
        render(<MemoryRouter><AdminPage /></MemoryRouter>);
        await screen.findByText('Sin acceso');
        expect(screen.getByRole('link', { name: /Volver al chat/ }).getAttribute('href')).toBe('/');
    });
});
