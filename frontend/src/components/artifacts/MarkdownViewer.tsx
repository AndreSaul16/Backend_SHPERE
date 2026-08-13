import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Download, FileText } from 'lucide-react';
import { DocTable } from '@/components/shared/DocTable';
import { ActaHeader } from './ActaHeader';
import { esActa } from '@/utils/acta';
import type { Artifact } from '@/types/artifact';

interface MarkdownViewerProps {
    artifact: Artifact;
}

export function MarkdownViewer({ artifact }: MarkdownViewerProps) {
    const acta = esActa(artifact);

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
        <div className="flex flex-col h-full bg-surface-code">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-1 border-b border-stroke-hairline">
                <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-micro font-sans text-content-muted uppercase">
                        {acta ? 'Acta' : 'Documento'}
                    </span>
                </div>
                <button
                    onClick={handleDownload}
                    className="p-2 rounded-sm hover:bg-stroke-highlight transition-colors text-content-muted hover:text-accent"
                    title="Descargar .md"
                >
                    <Download className="h-4 w-4" />
                </button>
            </div>

            {/* Markdown Content */}
            {/* F3: el relleno era `p-8 sm:p-12` + `p-8 sm:p-10` en la hoja, o
                sea 176px de márgenes dentro de un panel de 480px, y `sm:` mide
                el VIEWPORT, no el panel: en escritorio se aplicaba el relleno
                grande justo donde menos sitio hay. Con la tira de pestañas
                horizontal y estos valores, al acta le queda ~370px de columna
                en el ancho por defecto en vez de ~119px. */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {/* El acta se lee sobre papel, en los dos temas: `.acta-sheet`
                    aporta la superficie, el bisel de 6px y — lo importante — el
                    re-mapeo de contexto de variables de DESIGN §13, sin el cual
                    `.doc-prose` sacaría tinta clara sobre papel (blockquote a
                    1.13:1, viñetas a 2.10:1). La cabecera con fecha y recuento y
                    la medida definitiva son de la tarea 2.1. */}
                <article className="acta-sheet mx-auto p-6 sm:p-8">
                    {/* Tarea 2.1: fecha y recuento, y el sitio donde aterriza el
                        Sello (§8.3). Sólo en el acta: un artefacto markdown
                        cualquiera no tiene junta que datar ni votos que contar. */}
                    {acta && <ActaHeader actaId={artifact.id} date={artifact.createdAt} />}
                    <div className="doc-prose">
                        {/* F4: la tabla del acta se desplaza dentro de su
                            contenedor (§9.7), nunca rompe la hoja. */}
                        {/* El acta se sanea por DECISIÓN, igual que el hilo
                            (`MessageBubble`) y la vista pública. Hoy react-markdown
                            no pinta HTML crudo sin `rehypeRaw`, así que esto no
                            cierra un agujero abierto: cierra el camino por el que
                            se abriría el día que alguien quiera «que se vean las
                            tablas HTML del acta». El esquema github admite las
                            etiquetas de tabla, y `DocTable` sustituye el
                            componente DESPUÉS del saneado, así que la tabla del
                            acta y su contenedor desplazable siguen intactos. */}
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeSanitize]}
                            components={{ table: DocTable }}
                        >
                            {artifact.content}
                        </ReactMarkdown>
                    </div>
                </article>
            </div>
        </div>
    );
}
