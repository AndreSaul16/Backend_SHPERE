/**
 * Una región que se cae NO se lleva la pantalla — eje 3.
 *
 * Se prueba lo que el usuario nota: sigo viendo lo demás, tengo un botón, y si
 * cambio de contexto la región vuelve sola. Nada sobre `getDerivedStateFrom*`.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { RegionBoundary } from '../../src/components/shared/RegionBoundary';

function Bomba({ revienta }: { revienta: boolean }) {
    if (revienta) throw new Error('mermaid con sintaxis imposible');
    return <p>contenido de la región</p>;
}

describe('RegionBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    it('lo que se cae es la región: el resto de la pantalla sigue ahí', () => {
        render(
            <div>
                <p>la conversación</p>
                <RegionBoundary region="el panel de artefactos">
                    <Bomba revienta />
                </RegionBoundary>
                <textarea aria-label="Tu consulta a la junta" defaultValue="mi borrador" />
            </div>,
        );

        expect(screen.getByText('la conversación')).toBeInTheDocument();
        expect((screen.getByLabelText('Tu consulta a la junta') as HTMLTextAreaElement).value)
            .toBe('mi borrador');
        expect(screen.getByText('No se ha podido mostrar el panel de artefactos')).toBeInTheDocument();
    });

    it('la región caída ofrece recargarse ella sola', () => {
        function Alternador() {
            const [revienta, setRevienta] = useState(true);
            return (
                <>
                    <button type="button" onClick={() => setRevienta(false)}>arreglar</button>
                    <RegionBoundary region="el panel de artefactos">
                        <Bomba revienta={revienta} />
                    </RegionBoundary>
                </>
            );
        }
        render(<Alternador />);

        fireEvent.click(screen.getByRole('button', { name: 'arreglar' }));
        fireEvent.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

        expect(screen.getByText('contenido de la región')).toBeInTheDocument();
    });

    it('cambiar de contexto recompone la región sin que nadie pulse nada', () => {
        const { rerender } = render(
            <RegionBoundary region="este artefacto" resetKeys={['a1']}>
                <Bomba revienta />
            </RegionBoundary>,
        );
        expect(screen.getByTestId('region-caida')).toBeInTheDocument();

        rerender(
            <RegionBoundary region="este artefacto" resetKeys={['a2']}>
                <Bomba revienta={false} />
            </RegionBoundary>,
        );
        expect(screen.queryByTestId('region-caida')).not.toBeInTheDocument();
        expect(screen.getByText('contenido de la región')).toBeInTheDocument();
    });

    it('un fallo determinista no promete un reintento que no puede cumplir', () => {
        render(
            <RegionBoundary region="este artefacto">
                <Bomba revienta />
            </RegionBoundary>,
        );

        for (let i = 0; i < 3; i++) {
            fireEvent.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));
        }

        expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();
        expect(screen.getByText(/sigue fallando/i)).toBeInTheDocument();
    });

    it('no enseña el motivo técnico en pantalla', () => {
        render(
            <RegionBoundary region="este artefacto">
                <Bomba revienta />
            </RegionBoundary>,
        );
        expect(screen.queryByText(/sintaxis imposible/)).not.toBeInTheDocument();
    });
});
