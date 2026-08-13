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

/**
 * Tarea 2.4 — la conversación compartida es la única superficie pública del
 * producto, y hasta ahora enseñaba cinco párrafos iguales sobre paño: sin
 * identidad de director, sin votos y con el mismo `<title>` para todas las
 * conversaciones del mundo.
 */
describe('SharedSessionPage — la constancia, en público', () => {
    const CONVERSACION = {
        title: 'Lanzamiento en Q4',
        messages: [
            { role: 'user', content: '¿Lanzamos en Q4?' },
            {
                role: 'assistant', content: 'La caja no aguanta.',
                agent_role: 'CFO', board_vote: { decision: 'NO', confidence: 91 },
            },
            {
                role: 'assistant', content: 'La plataforma llega.',
                agent_role: 'CTO', board_vote: { decision: 'SI', confidence: 78 },
            },
        ],
    };

    it('se lee sobre papel y cada director trae su identidad y su voto', async () => {
        server.use(http.get(ENDPOINT, () => HttpResponse.json(CONVERSACION)));
        const { container } = renderAt('tok-junta');

        expect(await screen.findByText('Lanzamiento en Q4')).toBeInTheDocument();
        expect(container.querySelector('.acta-sheet')).not.toBeNull();

        // §P2: el disenso se encuentra antes que la conformidad.
        expect(screen.getByText(/EN CONTRA/)).toBeInTheDocument();
        expect(screen.getByText(/91%/)).toBeInTheDocument();
        expect(screen.getByText(/A FAVOR/)).toBeInTheDocument();

        // Cada turno lleva el filete de su director, y no todos el mismo.
        const filetes = [...container.querySelectorAll<HTMLElement>('[style*="border-inline-start-color"]')]
            .map((e) => e.style.borderInlineStartColor);
        expect(filetes.length).toBe(3);
        expect(new Set(filetes).size).toBe(3);
    });

    it('el `<title>` nombra la junta, y se devuelve al salir', async () => {
        const original = document.title;
        server.use(http.get(ENDPOINT, () => HttpResponse.json(CONVERSACION)));
        const { unmount } = renderAt('tok-junta');
        await waitFor(() => expect(document.title).toBe('Lanzamiento en Q4 · SPHERE'));
        unmount();
        expect(document.title).toBe(original);
    });

    it('un enlace muerto también lo dice en la pestaña', async () => {
        server.use(http.get(ENDPOINT, () => HttpResponse.json({ detail: 'not found' }, { status: 404 })));
        renderAt('tok-muerto');
        await waitFor(() => expect(document.title).toBe('Enlace no disponible · SPHERE'));
    });
});
