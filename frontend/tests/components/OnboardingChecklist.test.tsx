import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';

import { server } from '../setup';
import { OnboardingChecklist } from '../../src/components/OnboardingChecklist';
import { useChatStore } from '../../src/store/useChatStore';

/**
 * Defecto visto en la verificación de la fase 3, no inventariado: la pantalla
 * de bienvenida lanzaba un error de página real.
 *
 * ── El fallo, exacto ────────────────────────────────────────────────────────
 *
 *     const oauthConnected = oauth.status === "fulfilled" && oauth.value.connected.length > 0;
 *     const credConnected  = creds.status === "fulfilled" && creds.value.services.some(...)
 *
 * `Promise.allSettled` sólo garantiza que la promesa NO se rechazó — no dice
 * nada de la FORMA de lo que devolvió. `req()` entrega lo que el backend haya
 * mandado con estado 2xx: un `{}` de un endpoint aún no desplegado, un
 * `{detail: …}`, un cuerpo vacío. En cualquiera de esos casos `.connected` es
 * `undefined` y `.length` lanza un `TypeError` DENTRO de un `.then()` **sin
 * `.catch()`**, o sea un rechazo sin dueño que el navegador reporta como error
 * de página.
 *
 * Y lo hace en `/`, en el montaje, para todo usuario que aún no ha completado
 * el onboarding: la primera pantalla del producto.
 *
 * No es un artefacto del fixture: la guarda que falta es real, y estos tests
 * fallan contra el código anterior con exactamente ese `TypeError`.
 */

const API = 'http://localhost:8000/api/v1';

/** Recoge los rechazos sin dueño, que es la forma que tiene este bug. */
let sinDueno: unknown[] = [];
const anotar = (e: PromiseRejectionEvent | Error) => { sinDueno.push(e); };

beforeEach(() => {
    sinDueno = [];
    useChatStore.getState().resetState();
    process.on('unhandledRejection', anotar);
});
afterEach(() => {
    process.off('unhandledRejection', anotar);
});

const montar = () =>
    render(
        <MemoryRouter>
            <OnboardingChecklist onPrimaryAction={() => {}} />
        </MemoryRouter>
    );

/** El perfil, siempre igual: usuario nuevo que no ha terminado el onboarding. */
const perfilNuevo = () =>
    http.get(`${API}/me`, () => HttpResponse.json({ onboarding_completed: false }));

describe('OnboardingChecklist — respuestas con forma inesperada', () => {
    it('un `/integrations/` sin `connected` no tumba la pantalla de bienvenida', async () => {
        server.use(
            perfilNuevo(),
            // El caso real: el endpoint responde 200 con un cuerpo que no trae
            // la lista. Antes: `undefined.length` → TypeError sin dueño.
            http.get(`${API}/integrations/`, () => HttpResponse.json({})),
            http.get(`${API}/me/service-credentials`, () => HttpResponse.json({ services: [] })),
        );

        montar();

        expect(await screen.findByText('Primeros pasos')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Conecta tus herramientas')).toBeInTheDocument());
        expect(sinDueno).toHaveLength(0);
    });

    it('un `/me/service-credentials` sin `services` tampoco', async () => {
        server.use(
            perfilNuevo(),
            http.get(`${API}/integrations/`, () => HttpResponse.json({ connected: [], available: [], status: {} })),
            http.get(`${API}/me/service-credentials`, () => HttpResponse.json({})),
        );

        montar();

        expect(await screen.findByText('Primeros pasos')).toBeInTheDocument();
        expect(sinDueno).toHaveLength(0);
    });

    it('los dos endpoints caídos: la lista se pinta con «sin conexiones»', async () => {
        server.use(
            perfilNuevo(),
            http.get(`${API}/integrations/`, () => new HttpResponse(null, { status: 500 })),
            http.get(`${API}/me/service-credentials`, () => new HttpResponse(null, { status: 500 })),
        );

        montar();

        // El paso de conexiones sigue siendo un paso PENDIENTE, no completado:
        // no saber si hay conexión no es lo mismo que tenerla.
        const paso = await screen.findByText('Conecta tus herramientas');
        expect(paso.className).not.toMatch(/line-through/);
        expect(sinDueno).toHaveLength(0);
    });

    it('con una integración conectada de verdad, el paso se marca hecho', async () => {
        // La otra mitad: la guarda no puede tragarse el caso bueno.
        server.use(
            perfilNuevo(),
            http.get(`${API}/integrations/`, () => HttpResponse.json({
                connected: [{ provider: 'github' }], available: [], status: {},
            })),
            http.get(`${API}/me/service-credentials`, () => HttpResponse.json({ services: [] })),
        );

        montar();

        const paso = await screen.findByText('Conecta tus herramientas');
        await waitFor(() => expect(paso.className).toMatch(/line-through/));
    });

    it('con una credencial de servicio conectada, también', async () => {
        server.use(
            perfilNuevo(),
            http.get(`${API}/integrations/`, () => HttpResponse.json({ connected: [], available: [], status: {} })),
            http.get(`${API}/me/service-credentials`, () => HttpResponse.json({
                services: [{ service: 'calendar', connected: true }],
            })),
        );

        montar();

        const paso = await screen.findByText('Conecta tus herramientas');
        await waitFor(() => expect(paso.className).toMatch(/line-through/));
    });
});

describe('OnboardingChecklist — el desmontaje', () => {
    it('desmontar antes de que respondan no escribe estado ni avisa de nada', async () => {
        server.use(
            perfilNuevo(),
            http.get(`${API}/integrations/`, async () => {
                await new Promise((r) => setTimeout(r, 40));
                return HttpResponse.json({});
            }),
            http.get(`${API}/me/service-credentials`, async () => {
                await new Promise((r) => setTimeout(r, 40));
                return HttpResponse.json({});
            }),
        );

        const { unmount } = montar();
        unmount();
        await new Promise((r) => setTimeout(r, 120));

        expect(sinDueno).toHaveLength(0);
    });
});

describe('OnboardingChecklist — cuando ya no toca', () => {
    it('si el perfil dice que el onboarding está completado, no se pinta', async () => {
        server.use(
            http.get(`${API}/me`, () => HttpResponse.json({ onboarding_completed: true })),
            http.get(`${API}/integrations/`, () => HttpResponse.json({ connected: [], available: [], status: {} })),
            http.get(`${API}/me/service-credentials`, () => HttpResponse.json({ services: [] })),
        );

        montar();

        await waitFor(() => expect(screen.queryByText('Primeros pasos')).toBeNull());
        expect(sinDueno).toHaveLength(0);
    });
});

