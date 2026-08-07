import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownViewer } from '../../src/components/artifacts/MarkdownViewer';
import type { Artifact } from '../../src/types/artifact';

/**
 * F4 (P1) — la tabla del acta se desplaza dentro de su contenedor, no rompe la
 * hoja.
 *
 * A 390px el visor medía `clientWidth 325` / `scrollWidth 463`: 138px de tabla
 * fuera de vista, dos columnas de cuatro invisibles y ninguna señal de que
 * existieran. §9.7 pide envoltorio con `overflow-x: auto`, `role="region"`,
 * `aria-label` y `tabindex="0"` para poder desplazarla con teclado.
 */

const TABLA = `
| Concepto | Q4 adelantado | Q1 previsto | Delta |
|---|---:|---:|---:|
| Ingeniería | 148.000 € | 96.000 € | +52.000 € |
| Soporte | 41.500 € | 28.000 € | +13.500 € |
`;

const acta = (content: string): Artifact => ({
    id: 'acta-1', type: 'markdown', title: 'Acta de la Junta', content, createdAt: new Date(),
});

describe('F4 — desbordamiento de tabla en el acta', () => {
    it('envuelve la tabla en una región desplazable y alcanzable con teclado', () => {
        render(<MarkdownViewer artifact={acta(TABLA)} />);

        const region = screen.getByRole('region', { name: /tabla/i });
        expect(region).toHaveAttribute('tabindex', '0');
        expect(region).toHaveClass('doc-table-scroll');
        // La tabla vive DENTRO de la región: es ella la que se desplaza.
        expect(region.querySelector('table')).not.toBeNull();
    });

    it('las cuatro columnas siguen en el documento (no se pierde ninguna)', () => {
        render(<MarkdownViewer artifact={acta(TABLA)} />);

        for (const cabecera of ['Concepto', 'Q4 adelantado', 'Q1 previsto', 'Delta']) {
            expect(screen.getByText(cabecera)).toBeInTheDocument();
        }
        expect(screen.getByText('+52.000 €')).toBeInTheDocument();
    });

    it('un documento sin tablas no crea regiones vacías', () => {
        render(<MarkdownViewer artifact={acta('# Acta\n\nSin tablas.')} />);

        expect(screen.queryByRole('region', { name: /tabla/i })).not.toBeInTheDocument();
    });
});
