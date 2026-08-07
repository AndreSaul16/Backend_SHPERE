import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Download, AlertTriangle, GitBranch } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

/**
 * DESIGN §10: «`themeVariables` se deriva de los tokens leyendo
 * `getComputedStyle(document.documentElement)`, nunca con hex literales — hoy
 * `MermaidDiagram.tsx:11-22` tiene 11 hex clavados, así que un cambio de paleta
 * arreglaría la app y dejaría todos los diagramas en la paleta antigua».
 *
 * Y eso es exactamente lo que había pasado: los diagramas seguían en cian
 * `#00F5D4` y morado `#9D85FF` cuando el resto del producto ya era paño y
 * latón. Leyendo la variable, el diagrama sigue al tema — incluido el claro —
 * sin tocar este fichero.
 */
function token(name: string, fallback: string): string {
    if (typeof window === 'undefined' || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

/** Se llama en el primer render, no en la carga del módulo: en la carga del
 *  módulo el `<html>` puede no tener todavía la hoja de estilos aplicada. */
let temaAplicado = false;
function aplicarTemaMermaid() {
    if (temaAplicado) return;
    temaAplicado = true;
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        themeVariables: {
            primaryColor: token('--surface-2', '#142119'),
            primaryTextColor: token('--content', '#EEEDE8'),
            primaryBorderColor: token('--accent', '#D7A94F'),
            lineColor: token('--accent', '#D7A94F'),
            secondaryColor: token('--surface-1', '#0D1811'),
            tertiaryColor: token('--surface-3', '#1C2A21'),
            background: 'transparent',
            mainBkg: token('--surface-2', '#142119'),
            nodeBorder: token('--accent', '#D7A94F'),
            clusterBkg: token('--surface-1', '#0D1811'),
            titleColor: token('--content-strong', '#FBFAF7'),
            edgeLabelBackground: token('--surface-0', '#060F09'),
        },
        fontFamily: '"JetBrains Mono", monospace',
    });
}

interface MermaidDiagramProps {
    artifact: Artifact;
}

export function MermaidDiagram({ artifact }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [svgContent, setSvgContent] = useState<string>('');

    useEffect(() => {
        const renderDiagram = async () => {
            if (!containerRef.current) return;

            try {
                setError(null);
                aplicarTemaMermaid();
                const id = `mermaid-${artifact.id.replace(/-/g, '_')}`;
                const { svg } = await mermaid.render(id, artifact.content);
                setSvgContent(svg);
            } catch {
                // Sin aviso: el fallo ya ocupa el hueco del propio diagrama, y
                // no es una acción del usuario que haya fallado sino texto que
                // el modelo escribió mal. El motivo de mermaid no se enseña:
                // no hay nada que el usuario pueda hacer con él.
                setError('No se pudo dibujar el diagrama: el texto no es Mermaid válido');
            }
        };

        renderDiagram();
    }, [artifact.content, artifact.id]);

    const handleDownload = () => {
        if (!svgContent) return;
        const filename = `${artifact.title.replace(/\s+/g, '_').toLowerCase()}.svg`;
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-full bg-surface-0">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-1 border-b border-stroke-hairline">
                <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-micro font-mono text-content-muted uppercase">
                        Architecture Preview
                    </span>
                </div>
                {svgContent && (
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-xl hover:bg-stroke-highlight transition-all text-content-muted hover:text-electric-cyan"
                        title="Descargar SVG"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Diagram Content */}
            <div className="flex-1 overflow-auto p-12 flex items-center justify-center scrollbar-thin scrollbar-thumb-white/10">
                {error ? (
                    <div className="flex flex-col items-center gap-4 text-center p-6 bg-oxblood-500/5 rounded-md border border-oxblood-500/10 max-w-md">
                        <AlertTriangle className="h-10 w-10 text-danger" />
                        <div>
                            <p className="text-content-strong font-bold text-sm uppercase tracking-wider">{error}</p>
                            <p className="text-content-muted text-xs mt-1">Revisa la estructura del código Mermaid generado.</p>
                        </div>
                        <pre className="text-xs text-danger font-mono bg-black/40 p-4 rounded-md w-full text-left overflow-auto max-h-40 border border-oxblood-500/5">
                            {artifact.content}
                        </pre>
                    </div>
                ) : (
                    <div
                        ref={containerRef}
                        className="mermaid-container w-full h-full flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity"
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-surface-1 border-t border-stroke-hairline">
                <p className="text-micro text-content-muted font-mono uppercase">
                    ENGINE: MERMAID_JS · RENDER: SVG_VECTOR · STATUS: DYNAMIC
                </p>
            </div>
        </div>
    );
}
