/**
 * AV-004 — el visor del acta sanea por decisión, no por defecto.
 *
 * Hoy el acta ya es segura, y por accidente afortunado: react-markdown no
 * pinta HTML crudo si nadie le pone `rehypeRaw`, y su transformador de URL
 * neutraliza `javascript:`. Así que este commit **no cierra un agujero
 * abierto: cierra el camino por el que se abriría**.
 *
 * De ahí que los dos primeros casos pasen antes del cambio. Son tests de
 * caracterización, y su valor entero está en las mutaciones: el día que
 * alguien añada `rehypeRaw` para «que se vean las tablas HTML del acta» —el
 * cambio de una línea que la auditoría predijo—, la suite se pone roja.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownViewer } from '../../src/components/artifacts/MarkdownViewer';
import type { Artifact } from '../../src/types/artifact';

const hacerActa = (content: string): Artifact => ({
    id: 'acta-1',
    type: 'markdown',
    title: 'Acta de la junta',
    content,
    createdAt: new Date('2026-08-14T10:00:00Z'),
});

describe('MarkdownViewer — el acta saneada (AV-004)', () => {
    it('un <script> en el acta no llega al documento', () => {
        const { container } = render(
            <MarkdownViewer artifact={hacerActa('# Acta\n\n<script>window.x=1</script>\n\nCuerpo.')} />,
        );

        expect(container.querySelector('script')).toBeNull();
        // Y el acta se sigue leyendo: sanear no es esconder.
        expect(screen.getByText('Cuerpo.')).toBeDefined();
    });

    it('un enlace con protocolo peligroso no conserva el protocolo', () => {
        const { container } = render(
            <MarkdownViewer artifact={hacerActa('[pincha](javascript:alert(1))')} />,
        );

        const enlace = container.querySelector('a');
        expect(enlace).not.toBeNull();
        expect(enlace?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    });

    it('un `onerror` inyectado en una imagen no sobrevive', () => {
        const { container } = render(
            <MarkdownViewer artifact={hacerActa('<img src=x onerror="window.x=1">')} />,
        );

        expect(container.querySelector('img[onerror]')).toBeNull();
    });

    it('las tablas del acta siguen intactas, con su contenedor y su foco', () => {
        const tabla = [
            '| Director | Voto | Confianza | Nota |',
            '|---|---|---|---|',
            '| CTO | SÍ | 90 | ninguna |',
        ].join('\n');
        const { container } = render(<MarkdownViewer artifact={hacerActa(tabla)} />);

        expect(container.querySelectorAll('th')).toHaveLength(4);
        const region = screen.getByRole('region', { name: /tabla/i });
        expect(region).toHaveAttribute('tabIndex', '0');
        expect(region.querySelector('table')).not.toBeNull();
    });

    it('el markdown normal del acta se sigue pintando', () => {
        const { container } = render(
            <MarkdownViewer artifact={hacerActa('# Conclusión\n\nSe **aprueba** el plan.')} />,
        );

        expect(container.querySelector('h1')?.textContent).toBe('Conclusión');
        expect(container.querySelector('strong')?.textContent).toBe('aprueba');
    });
});
