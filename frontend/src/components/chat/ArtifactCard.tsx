import { FileCode, Download, ExternalLink, FileText, Table, GitBranch, Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/useChatStore';
import { getDownloadExtension, type ArtifactType } from '@/types/artifact';

interface ArtifactCardProps {
    content: string;
    language?: string;
    artifactType?: ArtifactType;
    title?: string;         // NEW: Direct title prop
    artifactId?: string;    // NEW: Direct artifact ID for lookup
}

// Icons by artifact type or language
const getIcon = (type?: ArtifactType, lang?: string) => {
    if (type === 'mermaid' || lang === 'mermaid') return <GitBranch className="h-4 w-4" />;
    if (type === 'data_table') return <Table className="h-4 w-4" />;
    if (type === 'markdown') return <FileText className="h-4 w-4" />;
    return <FileCode className="h-4 w-4" />;
};

export function ArtifactCard({ content, language, artifactType, title: propsTitle, artifactId }: ArtifactCardProps) {
    const { artifacts, setActiveArtifact } = useChatStore();

    // Find artifact by ID first (streaming case), then fallback to content match
    const existingArtifact = artifactId
        ? artifacts.find(a => a.id === artifactId)
        : artifacts.find(a => a.content.trim() === content.trim());

    const handleView = () => {
        if (existingArtifact) {
            setActiveArtifact(existingArtifact.id);
        } else {
            // If for some reason it wasn't detected yet (e.g. partial stream), create it
            // This is a safety measure
            console.warn("Artifact not found in store, creating on the fly");
        }
    };

    const handleDownload = () => {
        if (!existingArtifact) return;

        const extension = getDownloadExtension(existingArtifact);
        const baseTitle = existingArtifact.title.replace(/\s+/g, '_').toLowerCase();

        // Evitar duplicar extensión si el título ya la tiene
        const filename = baseTitle.endsWith(extension)
            ? baseTitle
            : `${baseTitle}${extension}`;

        const blob = new Blob([existingArtifact.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatSize = (content: string) => {
        const bytes = new Blob([content]).size;
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    // Use provided title prop first, then artifact title, then fallback
    const title = propsTitle || existingArtifact?.title || (language ? `Source: ${language}` : 'Artifact');
    const displayContent = existingArtifact?.content || content;
    const size = formatSize(displayContent);

    // Board V2: el «Acta de la Junta» es el artefacto estrella del debate.
    //
    // Lo destacaba un borde de `conic-gradient` girando en bucle infinito cada
    // 6 s (cian → morado → magenta), que §7.4 prohíbe por nombre entre «los
    // cuatro bucles heredados» y §0 rechaza como degradado morado→cian. Un
    // bucle sólo se permite si representa un proceso real en curso, y un acta
    // ya cerrada no está haciendo nada.
    //
    // Lo sustituye lo que el sistema sí usa para «esta tarjeta es la
    // importante»: el filete de latón de §9.3 (`selected`) y la barra de 2px en
    // el canto de inicio. Materia, no luz — y coste cero.
    const isActa = /acta/i.test(title);

    return (
        <div className="my-4 group relative">
            <div className={cn(
                "relative bg-surface-2 rounded-md overflow-hidden transition-colors shadow-e2",
                isActa
                    ? "border border-brass-500 border-s-2 border-s-brass-500"
                    : "border border-stroke-edge hover:border-brass-600",
            )}>
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-surface-inset rounded-sm text-accent">
                            {isActa ? <Gavel className="h-4 w-4" /> : getIcon(artifactType, language)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-mono text-content-strong truncate">
                                {title}
                            </p>
                            <div className="flex items-center gap-2">
                                <p className="text-micro text-content-muted uppercase opacity-60">
                                    {language || artifactType || 'document'}
                                </p>
                                <span className="text-micro text-content-muted opacity-40">•</span>
                                <p className="text-micro text-content-muted font-mono opacity-60">
                                    {size}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={handleView}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-highlight hover:bg-electric-cyan/10 text-content-muted hover:text-electric-cyan rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-electric-cyan/20"
                        >
                            <ExternalLink className="h-3 w-3" />
                            {isActa ? 'Ver acta' : 'Ver Código'}
                        </button>
                        <button
                            onClick={handleDownload}
                            className="p-1.5 bg-surface-highlight hover:bg-luxury-purple/10 text-content-muted hover:text-luxury-purple rounded-lg transition-colors border border-transparent hover:border-luxury-purple/20"
                            title="Descargar"
                        >
                            <Download className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
