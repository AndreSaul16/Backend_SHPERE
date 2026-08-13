/**
 * 6.12 — el estado vacío canónico (§9.14).
 *
 * «Nunca un hueco en blanco y nunca sólo un icono.» La anatomía es lo que se
 * vigila: glifo, título que dice qué falta, frase que dice qué hacer y **una**
 * acción. Una, no dos: un vacío con tres botones no es un vacío, es un menú, y
 * quien llega aquí no sabía ni que tenía que decidir algo.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { EstadoVacio } from '../../src/components/ui/EstadoVacio';

describe('EstadoVacio', () => {
    it('tiene las cuatro piezas de §9.14 y el glifo no se anuncia dos veces', () => {
        const { container } = render(
            <EstadoVacio
                glifo={<Inbox aria-hidden="true" />}
                titulo="Aún no tienes contactos"
                frase="Añade uno para que los agentes puedan escribir."
                accion={{ etiqueta: 'Añadir el primero', onClick: () => {} }}
            />,
        );
        expect(screen.getByText('Aún no tienes contactos')).toBeInTheDocument();
        expect(screen.getByText('Añade uno para que los agentes puedan escribir.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Añadir el primero' })).toBeInTheDocument();
        // El glifo es decorativo: su significado ya está en el título.
        expect(container.querySelector('span[aria-hidden="true"] svg')).not.toBeNull();
    });

    it('la acción es una sola', () => {
        render(
            <EstadoVacio
                glifo={<Inbox aria-hidden="true" />}
                titulo="Vacío"
                frase="Frase."
                accion={{ etiqueta: 'Única', onClick: () => {} }}
                pista="Atajo: N"
            />,
        );
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(screen.getByText('Atajo: N')).toBeInTheDocument();
    });

    it('sin acción no pinta botón: hay vacíos en los que no hay nada que hacer', () => {
        render(<EstadoVacio glifo={<Inbox aria-hidden="true" />} titulo="Vacío" frase="Frase." />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('la acción hace lo que dice', async () => {
        const user = userEvent.setup();
        const alPulsar = vi.fn();
        render(
            <EstadoVacio
                glifo={<Inbox aria-hidden="true" />}
                titulo="Vacío"
                frase="Frase."
                accion={{ etiqueta: 'Hazlo', onClick: alPulsar }}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Hazlo' }));
        expect(alPulsar).toHaveBeenCalledOnce();
    });
});
