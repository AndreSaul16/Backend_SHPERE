// Artifact Renderer - Master Switch Component
import { lazy, Suspense } from 'react';
import { FileQuestion } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

/**
 * Tarea 4.2 · D17b — los cinco visores salen del chunk de entrada.
 *
 * Este fichero de 46 líneas era, de largo, el más caro de la app: importaba de
 * forma estática `CodeBlock` (con `refractor` entero antes de 4.3),
 * `MermaidDiagram` (~600 KB de motor de diagramas), `MarkdownViewer`, `DataGrid`
 * y `dompurify`. Todo eso viajaba en el arranque en frío de CUALQUIER usuario,
 * incluido el que jamás abre un artefacto — y el panel de artefactos sólo se
 * monta cuando la junta produce uno.
 *
 * Cada rama del `switch` es ahora su propio trozo, y sólo baja el del tipo que
 * se está mirando: abrir un acta no descarga el motor de diagramas.
 *
 * El `svg` va aparte y no dentro de una rama JSX en línea a propósito:
 * `dompurify` es lo que hace segura esa rama, así que tiene que viajar CON
 * ella. Metido aquí arriba volvería al chunk de entrada él solo.
 */
const CodeBlock = lazy(() => import('./CodeBlock').then((m) => ({ default: m.CodeBlock })));
const MarkdownViewer = lazy(() => import('./MarkdownViewer').then((m) => ({ default: m.MarkdownViewer })));
const DataGrid = lazy(() => import('./DataGrid').then((m) => ({ default: m.DataGrid })));
const MermaidDiagram = lazy(() => import('./MermaidDiagram').then((m) => ({ default: m.MermaidDiagram })));
const SvgViewer = lazy(() => import('./SvgViewer').then((m) => ({ default: m.SvgViewer })));

interface ArtifactRendererProps {
    artifact: Artifact;
}

/**
 * La espera del visor: la FORMA del documento que viene, no un disco girando.
 *
 * R3 del plan lo pide por escrito («el skeleton del layout de esa ruta, nunca un
 * spinner centrado») y §9.12 lo define: barrido de `--stroke-hairline` sobre el
 * relleno de e2, que con movimiento reducido se queda quieto. Las tres barras
 * dibujan la barra de herramientas y el cuerpo que todos los visores comparten.
 */
function VisorCargando() {
    return (
        <div className="flex h-full flex-col" role="status" aria-label="Abriendo el documento">
            <div className="flex items-center justify-between border-b border-stroke-hairline bg-surface-1 px-6 py-3">
                <div className="skeleton h-3 w-28 rounded-xs" />
                <div className="skeleton h-6 w-6 rounded-sm" />
            </div>
            <div className="skeleton flex-1" />
        </div>
    );
}

export function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
    return (
        <Suspense fallback={<VisorCargando />}>
            <VisorDelTipo artifact={artifact} />
        </Suspense>
    );
}

function VisorDelTipo({ artifact }: ArtifactRendererProps) {
    switch (artifact.type) {
        case 'code':
            return <CodeBlock artifact={artifact} />;
        case 'markdown':
            return <MarkdownViewer artifact={artifact} />;
        case 'data_table':
            return <DataGrid artifact={artifact} />;
        case 'mermaid':
            return <MermaidDiagram artifact={artifact} />;
        case 'svg':
            return <SvgViewer artifact={artifact} />;
        default:
            return (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                    <FileQuestion className="h-12 w-12 text-content-muted" />
                    <p className="text-content-muted">Tipo de artefacto no soportado</p>
                    <code className="text-xs text-luxury-purple">{artifact.type}</code>
                </div>
            );
    }
}
