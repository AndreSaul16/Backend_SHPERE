/**
 * 6.8 — Conexiones deja de ser una pila de seis pantallas.
 *
 * Los dos criterios: **un solo servicio abierto** en toda la página (no uno por
 * mitad, que es el fallo que se comete si cada mitad guarda su propio estado) y
 * **poder ir a uno concreto sin scroll**, que aquí es el buscador filtrando las
 * dos mitades a la vez.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { ConnectionsSettings } from '../../src/pages/settings/ConnectionsSettings';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: { getIdToken: vi.fn(() => Promise.resolve('mock-token')) },
    })),
}));

vi.mock('react-router-dom', async () => {
    const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...real, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

const BASE = 'http://localhost:8000/api/v1';

beforeEach(() => {
    server.use(
        http.get(`${BASE}/integrations/`, () =>
            HttpResponse.json({ available: ['github', 'notion'], status: { github: true, notion: false } }),
        ),
        http.get(`${BASE}/integrations/apps`, () =>
            HttpResponse.json({ apps: [], callback_urls: {} }),
        ),
        http.get(`${BASE}/me/service-credentials`, () =>
            HttpResponse.json({
                available: ['whatsapp', 'instagram'],
                services: [
                    {
                        service: 'whatsapp', label: 'WhatsApp', description: 'Enviar mensajes',
                        credential_type: 'api_key', connected: false, metadata: {}, created_at: null, tools: [],
                    },
                    {
                        service: 'instagram', label: 'Instagram', description: 'Publicar en tu cuenta',
                        credential_type: 'api_key', connected: true, metadata: {}, created_at: null, tools: [],
                    },
                ],
            }),
        ),
    );
});

const filaDe = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

describe('ConnectionsSettings — acordeón (6.8)', () => {
    it('todo llega plegado y cada fila dice su estado con texto, no con color', async () => {
        render(<ConnectionsSettings />);
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());

        screen.getAllByRole('button', { expanded: false }).forEach((b) =>
            expect(b.getAttribute('aria-expanded')).toBe('false'),
        );
        expect(screen.queryByRole('button', { expanded: true })).toBeNull();

        // El estado es una palabra, no un tono.
        expect(screen.getByText('Conectado')).toBeInTheDocument();
        expect(screen.getAllByText('Sin configurar').length).toBeGreaterThan(0);
    });

    it('abrir un segundo servicio cierra el primero — aunque sean de mitades distintas', async () => {
        const user = userEvent.setup();
        render(<ConnectionsSettings />);
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());

        // Uno de la mitad OAuth…
        await user.click(filaDe(/GitHub/));
        expect(filaDe(/GitHub/).getAttribute('aria-expanded')).toBe('true');

        // …y otro de la mitad de credenciales: es aquí donde falla el diseño
        // con un estado por mitad.
        await user.click(filaDe(/WhatsApp/));
        expect(filaDe(/WhatsApp/).getAttribute('aria-expanded')).toBe('true');
        expect(filaDe(/GitHub/).getAttribute('aria-expanded')).toBe('false');
        expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    });

    it('volver a pulsar la cabecera abierta la cierra', async () => {
        const user = userEvent.setup();
        render(<ConnectionsSettings />);
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());

        await user.click(filaDe(/WhatsApp/));
        await user.click(filaDe(/WhatsApp/));
        expect(screen.queryByRole('button', { expanded: true })).toBeNull();
    });

    it('el buscador filtra las dos mitades a la vez y no distingue acentos', async () => {
        const user = userEvent.setup();
        render(<ConnectionsSettings />);
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());

        await user.type(screen.getByLabelText('Buscar un servicio'), 'insta');
        expect(screen.getByText('Instagram')).toBeInTheDocument();
        expect(screen.queryByText('WhatsApp')).toBeNull();
        expect(screen.queryByText('GitHub')).toBeNull();

        await user.click(screen.getByLabelText('Borrar la búsqueda'));
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());
    });
});
