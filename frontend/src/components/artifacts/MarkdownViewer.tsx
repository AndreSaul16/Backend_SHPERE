import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, FileText } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

interface MarkdownViewerProps {
    artifact: Artifact;
}

export function MarkdownViewer({ artifact }: MarkdownViewerProps) {
    const handleDownload = () => {
        const filename = `${artifact.title.replace(/\s+/g, '_').toLowerCase()}.md`;
        const blob = new Blob([artifact.content], { type: 'text/markdown' });
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
                    <FileText className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-[10px] font-mono text-content-muted uppercase tracking-widest">
                        Document Preview
                    </span>
                </div>
                <button
                    onClick={handleDownload}
                    className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-400 hover:text-electric-cyan"
                    title="Descargar .md"
                >
                    <Download className="h-4 w-4" />
                </button>
            </div>

            {/* Markdown Content */}
            <div className="flex-1 overflow-auto p-8 sm:p-12 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {/* El acta se lee sobre papel, en los dos temas: `.acta-sheet`
                    aporta la superficie, el bisel de 6px y — lo importante — el
                    re-mapeo de contexto de variables de DESIGN §13, sin el cual
                    `.doc-prose` sacaría tinta clara sobre papel (blockquote a
                    1.13:1, viñetas a 2.10:1). La cabecera con fecha y recuento y
                    la medida definitiva son de la tarea 2.1. */}
                <article className="acta-sheet mx-auto p-8 sm:p-10">
                    <div className="doc-prose">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {artifact.content}
                        </ReactMarkdown>
                    </div>
                </article>
            </div>
        </div>
    );
}
