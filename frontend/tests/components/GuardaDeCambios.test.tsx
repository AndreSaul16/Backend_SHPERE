import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { UnsavedGuardDialog } from '../../src/components/ui/UnsavedGuardDialog';

/**
 * Tarea 5.15 · D63 — guarda de cambios sin guardar.
 *
 * Cuatro formularios largos dejaban salir sin decir nada. El de agente era el
 * más sangrante: calculaba `isDirty` y sólo lo usaba para atenuar el botón de
 * guardar, así que un clic en el rail se llevaba por delante un prompt de
 * sistema reescrito entero.
 *
 * Lo que NO se prueba aquí porque NO se implementa, y está dicho en el hook: el
 * botón atrás del navegador. `useBlocker` de Router 7 exige un router de datos
 * y esta aplicación monta `<BrowserRouter>`; el truco de la entrada centinela
 * en el historial rompe el gesto de deslizar de iOS.
 */

function Pantalla({ sucio }: { sucio: boolean }) {
    return (
        <MemoryRouter initialEntries={['/formulario']}>
            <Routes>
                <Route
                    path="/formulario"
                    element={
                        <>
                            <UnsavedGuardDialog sucio={sucio} objeto="Nexus (CTO)" />
                            <Link to="/otra">Ir a otra pantalla</Link>
                            <a href="https://ejemplo.com">Un enlace de fuera</a>
                        </>
                    }
                />
                <Route path="/otra" element={<p>Otra pantalla</p>} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('navegar dentro de la aplicación', () => {
    it('con cambios, pulsar un enlace pregunta antes de irse', async () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        // Y no se ha ido: la pantalla de destino no está.
        expect(screen.queryByText('Otra pantalla')).toBeNull();
    });

    it('la confirmación nombra el objeto y su consecuencia (§11)', async () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }));
        const dialogo = await screen.findByRole('dialog');
        expect(dialogo).toHaveTextContent('Nexus (CTO)');
        expect(dialogo).toHaveTextContent(/se pierde lo que has cambiado/i);
    });

    it('«Seguir editando» se queda donde estaba', async () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }));
        fireEvent.click(await screen.findByRole('button', { name: /seguir editando/i }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.queryByText('Otra pantalla')).toBeNull();
    });

    it('«Salir sin guardar» completa la navegación que se frenó', async () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }));
        fireEvent.click(await screen.findByRole('button', { name: /salir sin guardar/i }));

        expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
    });

    it('sin cambios no estorba: el enlace navega directo', async () => {
        render(<Pantalla sucio={false} />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }));

        expect(await screen.findByText('Otra pantalla')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('⌘+clic abre en otra pestaña: ahí no se pierde nada, y no se pregunta', () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /ir a otra pantalla/i }), {
            metaKey: true,
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('un enlace externo lo cubre el navegador, no este diálogo', () => {
        render(<Pantalla sucio />);
        fireEvent.click(screen.getByRole('link', { name: /un enlace de fuera/i }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('cerrar o recargar la pestaña', () => {
    it('con cambios, `beforeunload` frena la salida', () => {
        render(<Pantalla sucio />);
        const evento = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(evento);
        expect(evento.defaultPrevented).toBe(true);
    });

    it('sin cambios no se registra el freno', () => {
        render(<Pantalla sucio={false} />);
        const evento = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(evento);
        expect(evento.defaultPrevented).toBe(false);
    });

    it('el freno se retira al limpiar el formulario, no se queda pegado', () => {
        const { rerender } = render(<Pantalla sucio />);
        rerender(<Pantalla sucio={false} />);
        const evento = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(evento);
        expect(evento.defaultPrevented).toBe(false);
    });
});
