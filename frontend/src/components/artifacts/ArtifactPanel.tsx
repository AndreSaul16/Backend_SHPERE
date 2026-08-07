// Artifacts Panel - Main Workspace Component
import { X, FileCode, FileText, Table, GitBranch, File } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { ArtifactRenderer } from './ArtifactRenderer';
import { ActaActions } from './ActaActions';
import { cn } from '@/lib/utils';
import type { ArtifactType } from '@/types/artifact';

// Icons by artifact type
const ARTIFACT_ICONS: Record<ArtifactType, React.ComponentType<{ className?: string }>> = {
    code: FileCode,
    markdown: FileText,
    data_table: Table,
    mermaid: GitBranch,
    svg: File,
};

export function ArtifactPanel() {
    const {
        artifacts,
        activeArtifactId,
        toggleArtifactPanel,
        setActiveArtifact
    } = useChatStore();

    const activeArtifact = artifacts.find(a => a.id === activeArtifactId);

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
            {/* Header */}
            <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-surface-1">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-luxury-purple/10 rounded-lg">
                        <FileCode className="h-5 w-5 text-luxury-purple" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                            Artifact Workspace
                        </h3>
                        {artifacts.length > 0 && (
                            <p className="text-micro text-content-muted font-mono mt-0.5">
                                {artifacts.length} OBJETOS DETECTADOS
                            </p>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => toggleArtifactPanel()}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors text-content-muted hover:text-content-strong active-scale"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex min-h-0">
                {/* Tabs Sidebar */}
                {artifacts.length > 0 && (
                    <div className="w-16 sm:w-56 border-r border-white/5 overflow-y-auto scrollbar-none flex-shrink-0 bg-white/[0.01]">
                        <div className="p-3 space-y-2">
                            {artifacts.map((artifact) => {
                                const Icon = ARTIFACT_ICONS[artifact.type] || File;
                                const isActive = artifact.id === activeArtifactId;

                                return (
                                    <button
                                        key={artifact.id}
                                        onClick={() => setActiveArtifact(artifact.id)}
                                        className={cn(
                                            "w-full p-3 rounded-md flex items-center gap-3 text-left transition-colors group relative duration-(--duration-tap)",
                                            isActive
                                                ? "bg-accent/12 border border-accent text-accent"
                                                : "hover:bg-stroke-hairline text-content-muted hover:text-content-strong border border-transparent"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-10 w-10 rounded-sm flex items-center justify-center flex-shrink-0",
                                            isActive ? "bg-accent-fill text-accent-on-fill" : "bg-surface-inset"
                                        )}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0 hidden sm:block">
                                            <p className="text-xs font-bold truncate">
                                                {artifact.title}
                                            </p>
                                            <p className="text-micro uppercase mt-0.5">
                                                {artifact.language || artifact.type}
                                            </p>
                                        </div>
                                        {isActive && (
                                            <motion.div
                                                layoutId="active-tab"
                                                className="absolute left-0 top-3 bottom-3 w-1 bg-luxury-purple rounded-full"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Main Viewer */}
                <div className="flex-1 min-w-0 bg-midnight/20">
                    <AnimatePresence mode="wait">
                        {activeArtifact ? (
                            <motion.div
                                key={activeArtifact.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="h-full flex flex-col"
                            >
                                {activeArtifact.type === 'markdown' && /acta/i.test(activeArtifact.title) && (
                                    <ActaActions title={activeArtifact.title} content={activeArtifact.content} />
                                )}
                                <div className="flex-1 min-h-0">
                                    <ArtifactRenderer artifact={activeArtifact} />
                                </div>
                            </motion.div>
                        ) : artifacts.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center h-full">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-luxury-purple/20 blur-3xl rounded-full" />
                                    <div className="relative h-24 w-24 rounded-md bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl">
                                        <GitBranch className="h-10 w-10 text-content-muted animate-pulse" aria-hidden="true" />
                                    </div>
                                </div>
                                <div className="space-y-2 max-w-xs">
                                    <h4 className="text-white font-bold text-lg">Área de Visualización</h4>
                                    <p className="text-content-muted text-sm leading-relaxed">
                                        Los objetos de código, diagramas y tablas generados por SPHERE aparecerán aquí para su inspección.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-content-muted text-sm font-mono h-full">
                                SELECCIONA UN OBJETO PARA INSPECCIONAR
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
