/**
 * TC-004 — el ajuste no puede prometer más de lo que cumple.
 *
 * El gate de confirmación cubre las herramientas con impacto externo, no las 23
 * del catálogo: consultar el calendario o listar tareas nunca pregunta, por
 * mucho que el nivel sea el más estricto. Un copy que diga «siempre» a secas
 * describe un producto que no existe, y el usuario sólo se entera el día que
 * una herramienta actúa sin preguntarle.
 *
 * Aviso, por honestidad: esto es una aserción sobre COPY. Es una guarda de
 * regresión legítima y nada más — no demuestra ningún comportamiento y no
 * sustituye a TC-002, que es quien prueba el gate de verdad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileSettings } from '../../src/pages/settings/ProfileSettings';
import { profileService } from '../../src/services/api';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({ currentUser: null })),
}));

const perfil = {
    firebase_uid: 'u1',
    email: 'usuaria@test.com',
    display_name: 'Usuaria',
    ui_preferences: { tool_confirmation_level: 'always' as const },
    professional_profile: {},
    communication_style: {},
    financial_preferences: {},
};

describe('el ajuste de confirmación declara su alcance real', () => {
    beforeEach(() => {
        vi.spyOn(profileService, 'getProfile').mockResolvedValue(
            perfil as unknown as Awaited<ReturnType<typeof profileService.getProfile>>,
        );
    });

    const pintar = () => render(<MemoryRouter><ProfileSettings /></MemoryRouter>);

    it('nombra las acciones con impacto externo', async () => {
        pintar();

        await waitFor(() =>
            expect(screen.getByText(/actúan fuera de SPHERE/i)).toBeInTheDocument(),
        );
        // Y dice también qué NO cubre, que es la mitad que se omitía.
        expect(screen.getByText(/nunca pide confirmación/i)).toBeInTheDocument();
        expect(screen.getAllByText(/impacto externo/i).length).toBeGreaterThan(0);
    });

    it('no promete cobertura de todo el catálogo', async () => {
        pintar();
        await waitFor(() =>
            expect(screen.getByRole('combobox', { name: /confirmaci/i })).toBeInTheDocument(),
        );

        expect(screen.queryByText(/todas las herramientas/i)).toBeNull();
        // «Siempre preguntar», a secas, es la promesa que no se cumple:
        // consultar el calendario o listar tareas no pregunta nunca.
        expect(screen.queryByText('Siempre preguntar')).toBeNull();
    });
});
