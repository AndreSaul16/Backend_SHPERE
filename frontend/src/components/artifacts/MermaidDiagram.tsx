import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Download, AlertTriangle, GitBranch } from 'lucide-react';
import { aplicarTemaMermaid, siguienteIdDeDibujo, temaActual } from './mermaidTheme';
import type { Artifact } from '@/types/artifact';

interface MermaidDiagramProps {
    artifact: Artifact;
}

export function MermaidDiagram({ artifact }: MermaidDiagramProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [svgContent, setSvgContent] = useState<string>('');

    // El tema con el que está dibujado el SVG que hay en pantalla. Cambiarlo
    // vuelve a disparar el efecto, que es lo que recolorea el diagrama.
    const [tema, setTema] = useState(temaActual);

    useEffect(() => {
        const observador = new MutationObserver(() => setTema(temaActual()));
        observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observador.disconnect();
    }, []);

    useEffect(() => {
        let vigente = true;
        const id = siguienteIdDeDibujo();

        const renderDiagram = async () => {
            try {
                aplicarTemaMermaid(tema);
                const { svg } = await mermaid.render(id, artifact.content);
                if (!vigente) return;
                setError(null);
                setSvgContent(svg);
            } catch {
                if (!vigente) return;
                // Sin aviso: el fallo ya ocupa el hueco del propio diagrama, y
                // no es una acción del usuario que haya fallado sino texto que
                // el modelo escribió mal. El motivo de mermaid no se enseña:
                // no hay nada que el usuario pueda hacer con él.
                setError('No se pudo dibujar el diagrama: el texto no es Mermaid válido');
                // Y el SVG anterior se va: dejarlo puesto enseñaría un diagrama
                // que ya no corresponde al texto que hay delante.
                setSvgContent('');
            } finally {
                // Mermaid deja su elemento de medida en el documento cuando el
                // dibujo falla. Se barre siempre: no cuesta nada y evita que la
                // página acumule cadáveres por cada diagrama mal escrito.
                document.getElementById(id)?.remove();
                document.getElementById(`d${id}`)?.remove();
            }
        };

        renderDiagram();
        return () => { vigente = false; };
    }, [artifact.content, tema]);

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
                    <span className="text-micro font-sans text-content-muted uppercase">
                        Diagrama
                    </span>
                </div>
                {svgContent && (
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-sm hover:bg-stroke-highlight transition-colors text-content-muted hover:text-accent"
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
                <p className="text-micro text-content-muted font-sans uppercase">
                    Diagrama vectorial · se descarga como SVG
                </p>
            </div>
        </div>
    );
}
