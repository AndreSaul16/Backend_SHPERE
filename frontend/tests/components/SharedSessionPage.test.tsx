import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { SharedSessionPage } from '../../src/pages/SharedSessionPage';

const ENDPOINT = 'http://localhost:8000/api/v1/sessions/share/:token';

function renderAt(token: string) {
    return render(
        <MemoryRouter initialEntries={[`/share/${token}`]}>
            <Routes>
                <Route path="/share/:token" element={<SharedSessionPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('SharedSessionPage (F1 — vista pública read-only)', () => {
    it('renderiza el título, mensajes y el banner de SPHERE', async () => {
        server.use(
            http.get(ENDPOINT, () =>
                HttpResponse.json({
                    title: 'Estrategia de Pricing',
                    messages: [
                        { role: 'user', content: '¿Subimos precios?' },
                        { role: 'assistant', content: 'Recomiendo **subir un 15%**.', agent_role: 'CEO' },
                    ],
                })
            )
        );

        renderAt('tok-abc');

        expect(await screen.findByText('Estrategia de Pricing')).toBeInTheDocument();
        expect(screen.getByText('¿Subimos precios?')).toBeInTheDocument();
        expect(screen.getByText('CEO')).toBeInTheDocument();
        expect(screen.getByText(/subir un 15%/i)).toBeInTheDocument();
        // Banner de origen y CTA a registro.
        expect(screen.getByText(/Conversación compartida desde/i)).toBeInTheDocument();
        expect(screen.getAllByText(/gratis/i).length).toBeGreaterThan(0);
    });

    it('un enlace muerto (404) lo dice y NO ofrece reintentar', async () => {
        server.use(
            http.get(ENDPOINT, () => HttpResponse.json({ detail: 'not found' }, { status: 404 }))
        );

        renderAt('tok-missing');

        await waitFor(() =>
            expect(screen.getByText(/ya no está disponible/i)).toBeInTheDocument()
        );
        // Reintentar un 404 sólo gastaría el tiempo del visitante.
        expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    });

    describe('el backend no responde — el fallo que dejaba la página colgada', () => {
        it('sale del «Cargando…» con un error que se puede leer', async () => {
            server.use(http.get(ENDPOINT, () => HttpResponse.error()));

            renderAt('tok-red-caida');

            await waitFor(() =>
                expect(screen.getByText(/No hemos podido cargar la conversación/i)).toBeInTheDocument()
            );
            // Lo que había antes: el esqueleto para siempre y ni una palabra.
            expect(screen.queryByText(/Cargando la conversación/i)).not.toBeInTheDocument();
        });

        it('ofrece una salida: «Reintentar» vuelve a pedirlo y pinta la conversación', async () => {
            let intentos = 0;
            server.use(
                http.get(ENDPOINT, () => {
                    intentos += 1;
                    if (intentos === 1) return HttpResponse.error();
                    return HttpResponse.json({
                        title: 'Estrategia de Pricing',
                        messages: [{ role: 'user', content: '¿Subimos precios?' }],
                    });
                })
            );

            renderAt('tok-flaky');

            const reintentar = await screen.findByRole('button', { name: /reintentar/i });
            await userEvent.click(reintentar);

            expect(await screen.findByText('Estrategia de Pricing')).toBeInTheDocument();
            expect(intentos).toBe(2);
        });

        it('un 500 también se reintenta: no es un enlace muerto', async () => {
            server.use(
                http.get(ENDPOINT, () => HttpResponse.json({ detail: 'boom' }, { status: 500 }))
            );

            renderAt('tok-500');

            expect(await screen.findByRole('button', { name: /reintentar/i })).toBeInTheDocument();
        });
    });
});
