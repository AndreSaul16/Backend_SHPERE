/**
 * Regresión de D38 (tarea 1.3).
 *
 * La sección llamaba a `fetch` contra una ruta absoluta de la API escrita a
 * mano, con dos consecuencias:
 *
 *  1. Ignoraba `VITE_API_URL`. En cualquier despliegue donde el frontend y la
 *     API no comparten origen — que es el despliegue real, Railway sirve el
 *     frontend aparte — las cuatro llamadas iban al host del frontend y
 *     devolvían el `index.html`, así que `resp.json()` petaba y la sección
 *     mostraba «Error cargando credenciales» sin más.
 *  2. Se fabricaba su propio `getAuthToken`, con lo que ni pasaba por
 *     `authHeaders()` ni por `errorHandler`: un 402 no abría el paywall.
 *
 * El test que faltaba es el del origen: verifica que la petición sale al
 * `API_URL` del servicio y con la cabecera `Authorization`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { ServiceCredentialsSettings } from '../../src/pages/settings/ServiceCredentialsSettings';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: {
            getIdToken: vi.fn(() => Promise.resolve('mock-token')),
        },
    })),
}));

const LIST_URL = 'http://localhost:8000/api/v1/me/service-credentials';

const service = (overrides: Record<string, unknown> = {}) => ({
    service: 'whatsapp',
    label: 'WhatsApp',
    description: 'Enviar mensajes por WhatsApp',
    credential_type: 'api_key',
    connected: false,
    metadata: {},
    created_at: null,
    tools: ['whatsapp_send_message'],
    ...overrides,
});

describe('ServiceCredentialsSettings — D38', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lista contra el API_URL del servicio y con cabecera Authorization', async () => {
        let authHeader: string | null = null;
        server.use(
            http.get(LIST_URL, ({ request }) => {
                authHeader = request.headers.get('Authorization');
                return HttpResponse.json({ services: [service()], available: ['whatsapp'] });
            }),
        );

        render(<ServiceCredentialsSettings />);

        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());
        expect(authHeader).toBe('Bearer mock-token');
    });

    it('guarda por POST al mismo origen, con el cuerpo que espera el backend', async () => {
        let body: unknown = null;
        server.use(
            http.get(LIST_URL, () =>
                HttpResponse.json({ services: [service()], available: ['whatsapp'] }),
            ),
            http.post(LIST_URL, async ({ request }) => {
                body = await request.json();
                return HttpResponse.json({ status: 'ok' });
            }),
        );

        const user = userEvent.setup();
        render(<ServiceCredentialsSettings />);
        await waitFor(() => expect(screen.getByText('WhatsApp')).toBeInTheDocument());

        await user.type(screen.getByLabelText('API Key'), 'secreto');
        await user.click(screen.getByRole('button', { name: /Guardar/ }));

        await waitFor(() => expect(body).not.toBeNull());
        expect(body).toMatchObject({ service: 'whatsapp', api_key: 'secreto' });
    });

    it('un fallo del backend se cuenta con su motivo, no con un String(e) crudo', async () => {
        server.use(
            http.get(LIST_URL, () =>
                HttpResponse.json(
                    { detail: { error: 'common.internal_error', message: 'La API está caída' } },
                    { status: 500 },
                ),
            ),
        );

        render(<ServiceCredentialsSettings />);
        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent(/La API está caída/),
        );
    });
});
