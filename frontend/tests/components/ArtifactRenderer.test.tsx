import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ArtifactRenderer } from '../../src/components/artifacts/ArtifactRenderer';
import type { Artifact } from '../../src/types/artifact';

// Mock the child components to simplify testing.
// The renderer passes the whole `artifact` object down, so the mocks read
// `artifact.content` (and `artifact.type` where useful).
vi.mock('../../src/components/artifacts/CodeBlock', () => ({
    CodeBlock: ({ artifact }: { artifact: Artifact }) => (
        <div data-testid="code-block">{artifact.content}</div>
    )
}));
vi.mock('../../src/components/artifacts/MarkdownViewer', () => ({
    MarkdownViewer: ({ artifact }: { artifact: Artifact }) => (
        <div data-testid="markdown-viewer">{artifact.content}</div>
    )
}));
vi.mock('../../src/components/artifacts/MermaidDiagram', () => ({
    MermaidDiagram: ({ artifact }: { artifact: Artifact }) => (
        <div data-testid="mermaid-diagram">{artifact.content}</div>
    )
}));
vi.mock('../../src/components/artifacts/DataGrid', () => ({
    DataGrid: ({ artifact }: { artifact: Artifact }) => (
        <div data-testid="data-grid">{artifact.content}</div>
    )
}));

const makeArtifact = (overrides: Partial<Artifact>): Artifact => ({
    id: 'a-1',
    type: 'code',
    title: 'Test',
    content: '',
    createdAt: new Date(),
    ...overrides,
});

/**
 * Tarea 4.2 — los cinco visores son `React.lazy`.
 *
 * Por qué estos tests pasaron de síncronos a asíncronos: montar un visor ahora
 * atraviesa un `import()` real (vitest lo intercepta y sirve el doble de arriba,
 * pero sigue siendo una promesa), así que en el primer fotograma lo que hay en
 * pantalla es el `fallback` del `Suspense`. `findBy*` espera a que resuelva.
 *
 * No es una relajación del test: se comprueba MÁS que antes. Cada caso asserta
 * primero que aparece el esqueleto —o sea que el visor de verdad NO estaba en
 * el chunk que ya se había descargado, que es justo lo que la tarea persigue— y
 * después que llega el visor correcto con su contenido.
 */
describe('ArtifactRenderer Component', () => {
    it('renders CodeBlock for code artifact type', async () => {
        render(<ArtifactRenderer artifact={makeArtifact({ type: 'code', content: 'const a = 1;', language: 'typescript' })} />);
        expect(screen.getByRole('status', { name: /abriendo el documento/i })).toBeDefined();
        expect(await screen.findByTestId('code-block')).toBeDefined();
        expect(screen.getByText('const a = 1;')).toBeDefined();
    });

    it('renders MarkdownViewer for markdown artifact type', async () => {
        render(<ArtifactRenderer artifact={makeArtifact({ type: 'markdown', content: '# Hello' })} />);
        expect(screen.getByRole('status', { name: /abriendo el documento/i })).toBeDefined();
        expect(await screen.findByTestId('markdown-viewer')).toBeDefined();
        expect(screen.getByText('# Hello')).toBeDefined();
    });

    it('renders MermaidDiagram for mermaid artifact type', async () => {
        render(<ArtifactRenderer artifact={makeArtifact({ type: 'mermaid', content: 'graph TD;' })} />);
        expect(screen.getByRole('status', { name: /abriendo el documento/i })).toBeDefined();
        expect(await screen.findByTestId('mermaid-diagram')).toBeDefined();
        expect(screen.getByText('graph TD;')).toBeDefined();
    });

    it('renders DataGrid for data_table artifact type', async () => {
        render(<ArtifactRenderer artifact={makeArtifact({ type: 'data_table', content: 'a,b\n1,2' })} />);
        expect(screen.getByRole('status', { name: /abriendo el documento/i })).toBeDefined();
        const grid = await screen.findByTestId('data-grid');
        expect(grid).toBeDefined();
        // getByText normaliza el whitespace (colapsa '\n'), así que verificamos
        // el textContent crudo del nodo en su lugar.
        expect(grid.textContent).toContain('a,b');
        expect(grid.textContent).toContain('1,2');
    });

    it('renders an "unsupported" fallback for unknown type', () => {
        // Unknown types fall through to the default branch, which shows a
        // friendly "no soportado" message plus the raw type string.
        // Esta rama NO es perezosa: es JSX del propio conmutador, así que se
        // pinta en el primer fotograma y el test sigue siendo síncrono. Que lo
        // siga siendo es la comprobación de que no se ha metido un `import()`
        // de más donde no hacía falta.
        render(<ArtifactRenderer artifact={makeArtifact({ type: 'unknown_type' as any, content: 'foo' })} />);
        expect(screen.getByText(/Tipo de artefacto no soportado/i)).toBeDefined();
        expect(screen.getByText('unknown_type')).toBeDefined();
    });

    it('sanea el SVG en un trozo aparte, no en el chunk de entrada', async () => {
        // `dompurify` es lo que hace segura esta rama y por eso viaja CON ella:
        // el visor de SVG es un fichero propio desde 4.2. El saneador tiene que
        // seguir corriendo — un `<script>` dentro del SVG de un modelo no puede
        // llegar al documento.
        render(<ArtifactRenderer artifact={makeArtifact({
            type: 'svg' as any,
            content: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/><script>alert(1)</script></svg>',
        })} />);
        expect(screen.getByRole('status', { name: /abriendo el documento/i })).toBeDefined();
        await waitFor(() => expect(document.querySelector('svg rect')).not.toBeNull());
        expect(document.querySelector('svg script')).toBeNull();
    });
});
