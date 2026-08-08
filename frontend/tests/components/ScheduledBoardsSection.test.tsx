import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { ScheduledBoardsSection } from '../../src/pages/settings/ScheduledBoardsSection';

const BASE = 'http://localhost:8000/api/v1/me/scheduled-boards';

describe('ScheduledBoardsSection (F3)', () => {
    beforeEach(() => {
        server.use(
            http.get(BASE, () =>
                HttpResponse.json([
                    {
                        id: 'b1',
                        query: 'Revisar métricas',
                        cadence: 'weekly',
                        hour_utc: 9,
                        weekday: 0,
                        channel: 'slack',
                        channel_target: '#board',
                        enabled: true,
                        next_run_at: null,
                        last_run_at: null,
                        last_status: 'ok',
                    },
                ])
            )
        );
    });

    it('lista las juntas existentes y muestra el coste de 5 créditos', async () => {
        render(<ScheduledBoardsSection />);
        expect(await screen.findByText('Revisar métricas')).toBeInTheDocument();
        expect(screen.getByText(/5 créditos/i)).toBeInTheDocument();
        /* D69/D70 — `weekday: 0` es DOMINGO (numeración de `cron` y de
           `Date.getDay()`), no lunes: ése era el desfase de un día. Y la hora
           se lee dos veces, la local y la de UTC, porque son la misma cosa
           dicha para dos lectores distintos. */
        expect(screen.getByText(/cada Domingo/i)).toBeInTheDocument();
        expect(screen.getByText(/09:00 UTC/i)).toBeInTheDocument();
    });

    it('crea una nueva junta vía POST', async () => {
        let posted: any = null;
        server.use(
            http.post(BASE, async ({ request }) => {
                posted = await request.json();
                return HttpResponse.json({ ...posted, id: 'b2', next_run_at: null });
            })
        );

        render(<ScheduledBoardsSection />);
        await screen.findByText('Revisar métricas');

        fireEvent.click(screen.getByText('Nueva'));
        fireEvent.change(screen.getByLabelText('Pregunta'), {
            target: { value: '¿Subimos precios?' },
        });
        fireEvent.click(screen.getByText('Crear'));

        await waitFor(() => expect(posted).not.toBeNull());
        expect(posted.query).toBe('¿Subimos precios?');
    });
});
