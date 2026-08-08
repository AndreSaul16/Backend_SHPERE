// Artifacts Panel - Main Workspace Component
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileCode, FileText, Table, GitBranch, File } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { ArtifactRenderer } from './ArtifactRenderer';
import { RegionBoundary } from '@/components/shared/RegionBoundary';
import { ActaActions } from './ActaActions';
import { esActa } from '@/utils/acta';
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

    // §9.8: flechas ←/→ para moverse entre pestañas, Home/End a los extremos.
    // El foco viaja con la selección, que es el patrón de tabs automáticas.
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
        const teclas = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!teclas.includes(e.key) || artifacts.length === 0) return;
        e.preventDefault();
        const actual = artifacts.findIndex(a => a.id === activeArtifactId);
        const desde = actual < 0 ? 0 : actual;
        const destino =
            e.key === 'Home' ? 0
                : e.key === 'End' ? artifacts.length - 1
                    : (desde + (e.key === 'ArrowRight' ? 1 : -1) + artifacts.length) % artifacts.length;
        const siguiente = artifacts[destino];
        setActiveArtifact(siguiente.id);
        tabRefs.current[siguiente.id]?.focus();
    }, [artifacts, activeArtifactId, setActiveArtifact]);

    // §9.8 «Desbordamiento: scroll horizontal con degradado de desvanecimiento
    // en los dos cantos». Y lo primero: la pestaña activa tiene que verse. Con
    // seis artefactos en un panel de 480px la tira desborda, y sin esto el
    // documento que se está leyendo quedaba fuera de cuadro.
    const tiraRef = useRef<HTMLDivElement | null>(null);
    const [tiraDesborda, setTiraDesborda] = useState(false);
    useEffect(() => {
        tabRefs.current[activeArtifactId ?? '']?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [activeArtifactId]);
    useEffect(() => {
        const tira = tiraRef.current;
        if (!tira) return;
        const medir = () => setTiraDesborda(tira.scrollWidth > tira.clientWidth + 1);
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(tira);
        return () => ro.disconnect();
    }, [artifacts.length]);

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
            {/* Header */}
            <div className="h-16 px-6 border-b border-stroke-hairline flex items-center justify-between bg-surface-1">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-luxury-purple/10 rounded-lg">
                        <FileCode className="h-5 w-5 text-luxury-purple" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-content-strong uppercase tracking-widest">
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
                    className="p-2 rounded-full hover:bg-stroke-highlight transition-colors text-content-muted hover:text-content-strong active-scale"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Tira de pestañas — DESIGN §9.8, y la mitad visible de F3.
                    Era un carril VERTICAL de 224px fijos (64px en móvil) que se
                    comía la mitad del panel: con el ancho por defecto le dejaba
                    al acta ~215px de los 1440 de pantalla y el documento salía
                    cortado a media palabra. Una tira horizontal cuesta 48px de
                    alto y devuelve el ancho entero a la hoja.

                    §9.8 al pie de la letra: `role="tablist"`, `aria-selected`,
                    `aria-controls`, subrayado de latón de 2px en vez de relleno,
                    sólo la activa en el orden de tabulación y flechas ←/→ +
                    Home/End para moverse. */}
                {artifacts.length > 0 && (
                    <div
                        ref={tiraRef}
                        role="tablist"
                        aria-label="Artefactos de la sesión"
                        aria-orientation="horizontal"
                        onKeyDown={handleTabKeyDown}
                        className={cn(
                            "flex items-stretch gap-1 px-2 border-b border-stroke-hairline bg-surface-1 overflow-x-auto scrollbar-none flex-shrink-0",
                            tiraDesborda && "tab-strip-fade",
                        )}
                    >
                        {artifacts.map((artifact) => {
                            const Icon = ARTIFACT_ICONS[artifact.type] || File;
                            const isActive = artifact.id === activeArtifactId;

                            return (
                                <button
                                    key={artifact.id}
                                    id={`artifact-tab-${artifact.id}`}
                                    role="tab"
                                    type="button"
                                    aria-selected={isActive}
                                    aria-controls="artifact-tabpanel"
                                    tabIndex={isActive ? 0 : -1}
                                    ref={(el) => { tabRefs.current[artifact.id] = el; }}
                                    onClick={() => setActiveArtifact(artifact.id)}
                                    className={cn(
                                        "relative flex items-center gap-2 px-3 py-2.5 max-w-[200px] flex-shrink-0 transition-colors duration-(--duration-tap)",
                                        isActive ? "text-accent" : "text-content-muted hover:text-content-strong"
                                    )}
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                                    <span className="text-xs font-bold truncate">{artifact.title}</span>
                                    <span className="text-micro uppercase text-content-quiet flex-shrink-0 hidden sm:inline">
                                        {artifact.language || artifact.type}
                                    </span>
                                    {isActive && (
                                        <motion.div
                                            layoutId="active-tab"
                                            className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-fill"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Main Viewer */}
                <div
                    id="artifact-tabpanel"
                    role="tabpanel"
                    aria-labelledby={activeArtifact ? `artifact-tab-${activeArtifact.id}` : undefined}
                    className="flex-1 min-w-0 min-h-0 bg-midnight/20"
                >
                    <AnimatePresence mode="wait">
                        {activeArtifact ? (
                            <motion.div
                                key={activeArtifact.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="h-full flex flex-col"
                            >
                                {esActa(activeArtifact) && (
                                    <ActaActions title={activeArtifact.title} content={activeArtifact.content} />
                                )}
                                {/* Eje 3 · el visor es el vecindario peligroso
                                    del panel: un mermaid mal formado o una
                                    tabla con una fila rara lanzan al renderizar.
                                    Aislado aquí, lo que se cae es el documento;
                                    la tira de pestañas sigue, y cambiar de
                                    artefacto lo recompone solo (`resetKeys`). */}
                                <div className="flex-1 min-h-0">
                                    <RegionBoundary
                                        region="este artefacto"
                                        reassurance="El resto de artefactos y la conversación siguen intactos. Prueba con otra pestaña."
                                        resetKeys={[activeArtifact.id]}
                                    >
                                        <ArtifactRenderer artifact={activeArtifact} />
                                    </RegionBoundary>
                                </div>
                            </motion.div>
                        ) : artifacts.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center h-full">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-luxury-purple/20 blur-3xl rounded-full" />
                                    <div className="relative h-24 w-24 rounded-md bg-stroke-highlight border border-stroke-edge flex items-center justify-center shadow-2xl">
                                        <GitBranch className="h-10 w-10 text-content-muted animate-pulse" aria-hidden="true" />
                                    </div>
                                </div>
                                <div className="space-y-2 max-w-xs">
                                    <h4 className="text-content-strong font-bold text-lg">Área de Visualización</h4>
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
