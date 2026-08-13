import { useEstadoEfimero } from '@/hooks/useEstadoEfimero';
import { Copy, Check, Download, ExternalLink } from 'lucide-react';

/* 4.3 — `{ Prism }` del índice de `react-syntax-highlighter` arrastraba
   `refractor` entero: ~300 gramáticas, cerca de 1 MB de JS que se parsea en el
   arranque para colorear un `json`. `@/lib/resaltado` registra OCHO sobre
   `prism-light`, y es el mismo motor que usa el markdown del transcript (4.4):
   un solo resaltado en toda la app. */
import { PrismLight as SyntaxHighlighter, lenguajeSoportado } from '@/lib/resaltado';
import { useTemaDeCodigo } from '@/hooks/useTemaDeCodigo';

import { getDownloadExtension } from '@/types/artifact';
import type { Artifact } from '@/types/artifact';
import { notify, reasonOf } from '@/lib/toastBus';

interface CodeBlockProps {
    artifact: Artifact;
}

export function CodeBlock({ artifact }: CodeBlockProps) {
    // D49 — el ✓ se apaga solo y el temporizador muere con el componente.
    const [copied, marcarCopiado] = useEstadoEfimero(false, 2000);
    // 7.6 — el resaltado se conmuta con `data-theme`, igual que el fondo.
    const temaCodigo = useTemaDeCodigo();

    /**
     * D36 — una copia que falla lo dice.
     *
     * `await navigator.clipboard.writeText(...)` + `setCopied(true)` sin
     * `try/catch`. El portapapeles falla más de lo que parece: contexto no
     * seguro (la app servida por http), permiso denegado, documento sin foco,
     * o `navigator.clipboard` directamente ausente.
     *
     * El enunciado del hallazgo decía «muestra ✓ aunque falle»; medido, no es
     * eso: el `await` va antes del `setCopied(true)`, así que con la promesa
     * rechazada el ✓ no se pinta. Lo que pasaba era **nada** — ni cambio en el
     * botón, ni aviso, y el rechazo quedaba como promesa sin dueño. Para quien
     * pulsa, una copia fallida y una hecha se veían exactamente igual, y se
     * llevaba lo que tuviera antes en el portapapeles.
     */
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(artifact.content);
            marcarCopiado(true);
        } catch (error) {
            notify({
                title: 'No se pudo copiar el código',
                detail: reasonOf(error) ?? 'Selecciónalo y cópialo a mano: el texto sigue aquí.',
                variant: 'error',
                dedupeKey: 'clipboard-codeblock',
            });
        }
    };

    const handleDownload = () => {
        const extension = getDownloadExtension(artifact);
        const baseTitle = artifact.title.replace(/\s+/g, '_').toLowerCase();
        const filename = baseTitle.endsWith(extension) ? baseTitle : `${baseTitle}${extension}`;

        const blob = new Blob([artifact.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-full bg-surface-code">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-1 border-b border-stroke-hairline">
                <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-oxblood-500/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-warning/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-success/40" />
                    </div>
                    <span className="text-micro font-mono text-content-muted uppercase ml-2 flex items-center gap-2">
                        <ExternalLink className="h-3 w-3" />
                        {artifact.language || 'source-code'}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-xl hover:bg-stroke-highlight transition-all text-content-muted hover:text-electric-cyan"
                        title="Copiar código"
                    >
                        {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-xl hover:bg-stroke-highlight transition-all text-content-muted hover:text-electric-cyan"
                        title="Descargar"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <SyntaxHighlighter
                    /* Un lenguaje que no está registrado se pinta SIN colorear
                       en vez de reventar: `prism-light` sólo conoce las ocho de
                       `@/lib/resaltado`, y refractor lanza si le piden una
                       gramática que no tiene. `text` no está registrada tampoco
                       y es el camino de salida deliberado. */
                    language={lenguajeSoportado(artifact.language) ? artifact.language : 'text'}
                    style={temaCodigo}
                    showLineNumbers
                    customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.7',
                        fontFamily: '"JetBrains Mono", monospace',
                    }}
                    /* El color NO va aquí: la librería lo pisa con el de su
                       propio tema (ver la regla de `index.css` que lo corrige
                       con `!important`, con la medida que lo demuestra). */
                    lineNumberStyle={{
                        paddingRight: '1.5rem',
                        minWidth: '3.5rem',
                        textAlign: 'right',
                        userSelect: 'none',
                    }}
                >
                    {artifact.content}
                </SyntaxHighlighter>
            </div>

            {/* Status Bar */}
            <div className="px-6 py-2 border-t border-stroke-hairline bg-surface-1 flex justify-between items-center">
                <p className="text-micro text-content-muted font-mono tnum">
                    {(artifact.content.length / 1024).toFixed(1)} KB · {artifact.content.split('\n').length} líneas
                </p>
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                    <span className="text-micro text-content-muted font-mono uppercase">Sólo lectura</span>
                </div>
            </div>
        </div>
    );
}
