import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { SharedSessionPage } from '../../src/pages/SharedSessionPage';

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
            http.get('http://localhost:8000/api/v1/sessions/share/:token', () =>
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

    it('muestra un mensaje de error si el token no existe', async () => {
        server.use(
            http.get('http://localhost:8000/api/v1/sessions/share/:token', () =>
                HttpResponse.json({ detail: 'not found' }, { status: 404 })
            )
        );

        renderAt('tok-missing');

        await waitFor(() =>
            expect(screen.getByText(/no está disponible o dejó de compartirse/i)).toBeInTheDocument()
        );
    });
});
