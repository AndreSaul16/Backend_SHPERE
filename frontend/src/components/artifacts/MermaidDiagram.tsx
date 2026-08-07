import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Download, AlertTriangle, GitBranch } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    themeVariables: {
        primaryColor: '#9D85FF',
        primaryTextColor: '#FFFFFF',
        primaryBorderColor: '#00F5D4',
        lineColor: '#00F5D4',
        secondaryColor: '#0A0A0F',
        tertiaryColor: '#16161c',
        background: 'transparent',
        mainBkg: '#16161c',
        nodeBorder: '#00F5D4',
        clusterBkg: '#16161c',
        titleColor: '#FFFFFF',
        edgeLabelBackground: '#0A0A0F',
    },
    fontFamily: '"JetBrains Mono", monospace',
});

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
        <div className="flex flex-col h-full bg-[#0d0d12]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-micro font-mono text-content-muted uppercase">
                        Architecture Preview
                    </span>
                </div>
                {svgContent && (
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-400 hover:text-electric-cyan"
                        title="Descargar SVG"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Diagram Content */}
            <div className="flex-1 overflow-auto p-12 flex items-center justify-center scrollbar-thin scrollbar-thumb-white/10">
                {error ? (
                    <div className="flex flex-col items-center gap-4 text-center p-6 bg-red-500/5 rounded-[32px] border border-red-500/10 max-w-md">
                        <AlertTriangle className="h-10 w-10 text-red-500" />
                        <div>
                            <p className="text-white font-bold text-sm uppercase tracking-wider">{error}</p>
                            <p className="text-content-muted text-xs mt-1">Revisa la estructura del código Mermaid generado.</p>
                        </div>
                        <pre className="text-xs text-red-400 font-mono bg-black/40 p-4 rounded-2xl w-full text-left overflow-auto max-h-40 border border-red-500/5">
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
            <div className="px-6 py-3 bg-white/[0.01] border-t border-white/5">
                <p className="text-micro text-content-muted font-mono uppercase">
                    ENGINE: MERMAID_JS · RENDER: SVG_VECTOR · STATUS: DYNAMIC
                </p>
            </div>
        </div>
    );
}
