import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import mermaid from 'mermaid';
import { MermaidDiagram } from '../../src/components/artifacts/MermaidDiagram';
import { __resetTemaMermaid } from '../../src/components/artifacts/mermaidTheme';
import type { Artifact } from '../../src/types/artifact';

/**
 * D29, tarea 2.5. Dos fallos que se arreglan a la vez porque comparten causa:
 * el estado global del módulo no se soltaba nunca.
 *
 *   - `initialize()` corría UNA vez por vida de la pestaña, así que cambiar
 *     `data-theme` no recoloreaba el diagrama.
 *   - El id del elemento de medida se derivaba del artefacto, que no cambia:
 *     tras un fallo de parseo el cadáver del intento anterior seguía en el
 *     documento y el siguiente intento chocaba con él. Corregir el texto del
 *     diagrama no lo arreglaba nunca.
 */

vi.mock('mermaid', () => ({
    default: {
        initialize: vi.fn(),
        render: vi.fn(),
    },
}));

const render_ = mermaid.render as unknown as ReturnType<typeof vi.fn>;
const initialize_ = mermaid.initialize as unknown as ReturnType<typeof vi.fn>;

const artefacto = (content: string): Artifact => ({
    id: 'mermaid-1',
    type: 'mermaid',
    title: 'Flujo de la junta',
    content,
    createdAt: new Date(),
});

beforeEach(() => {
    __resetTemaMermaid();
    render_.mockReset();
    initialize_.mockReset();
    delete document.documentElement.dataset.theme;
});
afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
});

describe('MermaidDiagram y el tema', () => {
    it('cambiar `data-theme` vuelve a inicializar y a dibujar', async () => {
        render_.mockResolvedValue({ svg: '<svg><g>oscuro</g></svg>' });
        const { container } = render(<MermaidDiagram artifact={artefacto('graph TD; A-->B;')} />);
        await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
        expect(initialize_).toHaveBeenCalledTimes(1);

        render_.mockResolvedValue({ svg: '<svg><g>claro</g></svg>' });
        document.documentElement.dataset.theme = 'light';

        await waitFor(() => expect(container.innerHTML).toContain('claro'));
        expect(initialize_).toHaveBeenCalledTimes(2);
    });

    it('no reinicializa si el tema no ha cambiado', async () => {
        render_.mockResolvedValue({ svg: '<svg/>' });
        const { rerender } = render(<MermaidDiagram artifact={artefacto('graph TD; A-->B;')} />);
        await waitFor(() => expect(initialize_).toHaveBeenCalledTimes(1));
        rerender(<MermaidDiagram artifact={artefacto('graph TD; A-->C;')} />);
        await waitFor(() => expect(render_).toHaveBeenCalledTimes(2));
        expect(initialize_).toHaveBeenCalledTimes(1);
    });
});

describe('MermaidDiagram y el error recuperable', () => {
    it('un texto corregido tras un fallo se dibuja, y con un id nuevo', async () => {
        render_.mockRejectedValueOnce(new Error('Parse error'));
        const { container, rerender, findByText } = render(
            <MermaidDiagram artifact={artefacto('esto no es mermaid')} />
        );
        expect(await findByText(/No se pudo dibujar el diagrama/)).toBeTruthy();
        // El SVG anterior no se queda puesto: enseñaría un diagrama que ya no
        // corresponde al texto que hay delante.
        expect(container.querySelector('.mermaid-container svg')).toBeNull();

        render_.mockResolvedValueOnce({ svg: '<svg><g>corregido</g></svg>' });
        rerender(<MermaidDiagram artifact={artefacto('graph TD; A-->B;')} />);

        await waitFor(() => expect(container.innerHTML).toContain('corregido'));
        expect(container.querySelector('[role="alert"]')).toBeNull();

        // Ids distintos: es lo que rompe el bloqueo del intento anterior.
        const ids = render_.mock.calls.map((c: unknown[]) => c[0]);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('barre el elemento de medida que mermaid deja al fallar', async () => {
        render_.mockImplementation(async (id: string) => {
            const cadaver = document.createElement('div');
            cadaver.id = `d${id}`;
            document.body.appendChild(cadaver);
            throw new Error('Parse error');
        });
        const { findByText } = render(<MermaidDiagram artifact={artefacto('roto')} />);
        expect(await findByText(/No se pudo dibujar el diagrama/)).toBeTruthy();
        await waitFor(() =>
            expect(document.querySelectorAll('body > div[id^="dmermaid-"]')).toHaveLength(0)
        );
    });
});

describe('los tokens de la paleta llegan a mermaid en un formato que entiende', () => {
    it('convierte oklch a hex de sRGB', async () => {
        const { aHex } = await import('../../src/components/artifacts/mermaidTheme');
        // Mermaid deriva media paleta con `khroma`, que sólo entiende hex, rgb()
        // y hsl(). Toda la paleta de SPHERE es oklch: sin esta conversión
        // `initialize` lanzaba «Unsupported color format» y TODO diagrama daba
        // «el texto no es Mermaid válido» — con un texto válido.
        expect(aHex('oklch(0 0 0)')).toBe('#000000');
        expect(aHex('oklch(1 0 0)')).toBe('#ffffff');
        expect(aHex('oklch(100% 0 0)')).toBe('#ffffff');
        // brass-600 del sistema: el latón que pinta los bordes y las aristas.
        expect(aHex('oklch(0.760 0.120 82)')).toBe('#d7a94f');
    });

    it('deja pasar lo que khroma ya entiende y descarta lo que no', async () => {
        const { aHex } = await import('../../src/components/artifacts/mermaidTheme');
        expect(aHex('#D7A94F')).toBe('#D7A94F');
        expect(aHex('rgb(215, 169, 79)')).toBe('rgb(215, 169, 79)');
        // Un `color-mix` sin resolver o un token vacío caen al valor de reserva
        // en vez de reventar la inicialización entera.
        expect(aHex('color-mix(in oklab, red, blue)')).toBeNull();
        expect(aHex('')).toBeNull();
    });
});
