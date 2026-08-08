/**
 * El error de una sección tiene que dejar salida — eje 2, DESIGN §11.
 *
 * Lo que se prueba es el contrato de voz, no el marcado: qué pasó, qué se
 * conserva, y una acción. Y sobre todo lo que NO puede pasar: que el motivo
 * técnico del backend acabe siendo el titular.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InlineError } from '../../../src/components/ui/InlineError';

describe('InlineError', () => {
    it('dice qué pasó y qué se conserva, y lo anuncia como alerta', () => {
        render(
            <InlineError
                title="No se han podido cargar tus contactos"
                detail="Ningún contacto se ha borrado: es un fallo al traer la lista."
            />,
        );

        const aviso = screen.getByRole('alert');
        expect(aviso).toHaveTextContent('No se han podido cargar tus contactos');
        expect(aviso).toHaveTextContent('Ningún contacto se ha borrado');
    });

    it('el reintento llama a quien sabe reintentar', () => {
        const onRetry = vi.fn();
        render(
            <InlineError
                title="No se ha podido guardar"
                detail="Tu texto sigue en el campo."
                onRetry={onRetry}
                retryLabel="Volver a guardar"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Volver a guardar' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('el motivo técnico va aparte del titular, nunca en su lugar', () => {
        render(
            <InlineError
                title="No se ha podido iniciar el pago"
                detail="No se te ha cobrado nada."
                reason="stripe: card_declined"
            />,
        );

        // Está, porque aquí sí es accionable…
        expect(screen.getByText('stripe: card_declined')).toBeInTheDocument();
        // …pero el titular sigue siendo el humano.
        expect(screen.getByText('No se ha podido iniciar el pago')).toBeInTheDocument();
    });

    it('sin acción de cerrar no se pinta un botón de cerrar que no cierra nada', () => {
        render(<InlineError title="Algo" detail="Detalle" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
