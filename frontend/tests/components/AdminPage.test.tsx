import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
        expect(screen.getByText(/plan: free/)).toBeInTheDocument();
    });
});
