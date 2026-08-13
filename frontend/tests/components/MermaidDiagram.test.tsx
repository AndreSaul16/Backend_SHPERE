/**
 * AV-005 — el diagrama se prueba contra el motor, no contra su doble.
 *
 * El test anterior mockeaba `mermaid` entero y su `render` **siempre resolvía**,
 * así que la rama de fallo —el mejor guardarraíl de este visor: panel de error,
 * texto fuente a la vista y el SVG viejo retirado— no se ejecutaba nunca. Un
 * test fantasma: verde pase lo que pase.
 *
 * Aquí el doble puede rechazar, que es de lo que trata la degradación. Se
 * conserva **un** caso con doble que resuelve, y es el único que legítimamente
 * lo necesita: comprobar que el SVG que devuelve el motor se inyecta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MermaidDiagram } from '../../src/components/artifacts/MermaidDiagram';
import { __resetTemaMermaid } from '../../src/components/artifacts/mermaidTheme';
import type { Artifact } from '../../src/types/artifact';

const render_ = vi.fn();
const initialize = vi.fn();

// Se dobla el MOTOR, no la capa de tema: `aplicarTemaMermaid` corre de verdad,
// así que `initialize` recibe la configuración REAL del producto —que es lo que
// AV-005b tiene que observar— y `render` es lo único guionizado por cada test.
vi.mock('mermaid', () => ({
    default: {
        initialize: (...args: unknown[]) => initialize(...args),
        render: (...args: unknown[]) => render_(...args),
    },
}));

const hacerArtefacto = (content: string): Artifact => ({
    id: 'mermaid-1',
    type: 'mermaid',
    title: 'Diagram',
    content,
    createdAt: new Date(),
});

beforeEach(() => {
    vi.clearAllMocks();
    __resetTemaMermaid();
});

describe('MermaidDiagram — la degradación con un motor que rechaza (AV-005)', () => {
    it('un diagrama inválido enseña el error y conserva el texto fuente', async () => {
        render_.mockRejectedValue(new Error('Parse error on line 1'));

        render(<MermaidDiagram artifact={hacerArtefacto('esto no es un diagrama')} />);

        await waitFor(() => {
            expect(screen.getByText(/no es Mermaid válido/i)).toBeDefined();
        });
        // El texto que escribió la junta sigue delante, para copiarlo.
        expect(screen.getByText('esto no es un diagrama')).toBeDefined();
    });

    it('tras un diagrama válido, uno inválido no deja descargable el dibujo anterior', async () => {
        // El panel de error sustituye al contenedor entero, así que mirar si
        // queda un `<svg>` dentro NO observa nada: no hay contenedor donde
        // mirar. Lo que sí sobrevive al fallo si el SVG viejo no se limpia es
        // el botón de descarga —cuelga de `svgContent`—, y con él el usuario se
        // baja el diagrama ANTERIOR creyendo que es el que tiene delante.
        render_.mockResolvedValue({ svg: '<svg><g>el diagrama bueno</g></svg>' });
        const { container, rerender } = render(
            <MermaidDiagram artifact={hacerArtefacto('graph TD; A-->B;')} />,
        );
        await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
        expect(screen.getByTitle('Descargar SVG')).toBeDefined();

        render_.mockRejectedValue(new Error('Parse error on line 1'));
        rerender(<MermaidDiagram artifact={hacerArtefacto('ya no es un diagrama')} />);

        await waitFor(() => {
            expect(screen.getByText(/no es Mermaid válido/i)).toBeDefined();
        });
        expect(screen.queryByTitle('Descargar SVG')).toBeNull();
        expect(container.querySelector('.mermaid-container svg')).toBeNull();
    });

    it('el motor se inicializa con securityLevel estricto', async () => {
        // Con el motor rechazando a propósito: el nivel de seguridad se fija
        // ANTES de dibujar, y tiene que estar puesto también cuando el dibujo
        // se va a caer.
        render_.mockRejectedValue(new Error('da igual'));

        render(<MermaidDiagram artifact={hacerArtefacto('graph TD; A-->B;')} />);

        await waitFor(() => expect(initialize).toHaveBeenCalled());
        expect(initialize).toHaveBeenCalledWith(
            expect.objectContaining({ securityLevel: 'strict' }),
        );
    });

    it('el SVG que devuelve el motor se inyecta en el contenedor', async () => {
        // ÚNICO caso con doble que resuelve, y lo necesita: sin un SVG que
        // devolver no hay inyección que comprobar.
        render_.mockResolvedValue({ svg: '<svg><g>diagrama dibujado</g></svg>' });

        const { container } = render(<MermaidDiagram artifact={hacerArtefacto('graph TD; A-->B;')} />);

        await waitFor(() => {
            expect(container.querySelector('.mermaid-container svg')).not.toBeNull();
        });
        expect(container.querySelector('.mermaid-container')?.innerHTML).toContain('diagrama dibujado');
    });
});
