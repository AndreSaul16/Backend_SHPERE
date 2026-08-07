import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, Download, ExternalLink } from 'lucide-react';

import { getDownloadExtension } from '@/types/artifact';
import type { Artifact } from '@/types/artifact';

interface CodeBlockProps {
    artifact: Artifact;
}

export function CodeBlock({ artifact }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
        <div className="flex flex-col h-full bg-[#0d0d12]">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
                    </div>
                    <span className="text-micro font-mono text-content-muted uppercase ml-2 flex items-center gap-2">
                        <ExternalLink className="h-3 w-3" />
                        {artifact.language || 'source-code'}
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleCopy}
                        className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-400 hover:text-electric-cyan"
                        title="Copiar código"
                    >
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-400 hover:text-electric-cyan"
                        title="Descargar"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <SyntaxHighlighter
                    language={artifact.language || 'text'}
                    style={vscDarkPlus}
                    showLineNumbers
                    customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.7',
                        fontFamily: '"JetBrains Mono", monospace',
                    }}
                    lineNumberStyle={{
                        color: 'rgba(255,255,255,0.1)',
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
            <div className="px-6 py-2 border-t border-white/5 bg-white/[0.01] flex justify-between items-center">
                <p className="text-micro text-content-muted font-mono">
                    SIZE: {(artifact.content.length / 1024).toFixed(1)} KB · LINES: {artifact.content.split('\n').length}
                </p>
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                    <span className="text-micro text-content-muted font-mono uppercase">Read Only Mode</span>
                </div>
            </div>
        </div>
    );
}
