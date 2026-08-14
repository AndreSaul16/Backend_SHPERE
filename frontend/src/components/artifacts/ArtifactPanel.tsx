// Artifacts Panel - Main Workspace Component
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileCode, FileText, Table, GitBranch, File, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { DocumentoDelArtefacto } from './DocumentoDelArtefacto';
import { ArtifactExpanded } from './ArtifactExpanded';
import { RegistroActuaciones } from './RegistroActuaciones';
import { cn } from '@/lib/utils';
import type { ArtifactType } from '@/types/artifact';
import { EstadoVacio } from '@/components/ui/EstadoVacio';

// Icons by artifact type
const ARTIFACT_ICONS: Record<ArtifactType, React.ComponentType<{ className?: string }>> = {
    code: FileCode,
    markdown: FileText,
    data_table: Table,
    mermaid: GitBranch,
    svg: File,
};

export function ArtifactPanel() {
    /* 4.6 · D20: el panel se suscribía al store entero, así que un token de
       streaming lo repintaba —con su tira de pestañas, su medida de
       desbordamiento y su visor— aunque no hubiera artefacto ninguno en vuelo. */
    const artifacts = useChatStore((s) => s.artifacts);
    const activeArtifactId = useChatStore((s) => s.activeArtifactId);
    const toggleArtifactPanel = useChatStore((s) => s.toggleArtifactPanel);
    const setActiveArtifact = useChatStore((s) => s.setActiveArtifact);

    const activeArtifact = artifacts.find(a => a.id === activeArtifactId);

    /* El Atril (§9.15) es estado LOCAL de la cabecera: ampliar no es un hecho
       de la sesión, es una postura de lectura de este panel. Con `open` atado
       además a `activeArtifact`, el Atril se cierra solo si el documento que
       estaba mostrando desaparece del almacén. */
    const [expandido, setExpandido] = useState(false);

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
                {/* D54/D55 · §11 — «ARTIFACT WORKSPACE · 6 OBJETOS DETECTADOS»
                    era inglés y jerga de sonda espacial sobre la pantalla donde
                    vive el entregable del producto. El acta y sus anexos no son
                    objetos detectados: son lo que la junta ha dejado por
                    escrito. Y el latón sustituye al morado heredado (§2.3). */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-accent/12 rounded-sm border border-brass-600">
                        <FileCode className="h-5 w-5 text-accent" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-content-strong truncate">
                            Documentos de la junta
                        </h3>
                        {artifacts.length > 0 && (
                            <p className="text-micro text-content-muted font-mono mt-0.5 tnum uppercase">
                                {artifacts.length === 1 ? '1 documento' : `${artifacts.length} documentos`}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {/* El Atril (§9.15). Sólo en `xl+`: por debajo de ese punto
                        el panel YA es una hoja a pantalla completa
                        (`MainLayout`), así que ampliar no ampliaría nada. */}
                    {activeArtifact && (
                        <button
                            type="button"
                            onClick={() => setExpandido(true)}
                            aria-label="Ampliar documento"
                            className="hidden xl:flex items-center justify-center p-2 rounded-full hover:bg-stroke-highlight transition-colors text-content-muted hover:text-content-strong active-scale"
                        >
                            <Maximize2 className="h-5 w-5" aria-hidden="true" />
                        </button>
                    )}
                    <button
                        onClick={() => toggleArtifactPanel()}
                        className="p-2 rounded-full hover:bg-stroke-highlight transition-colors text-content-muted hover:text-content-strong active-scale"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* §8.7 El Registro de Actuaciones — el telégrafo, en la cabecera
                del panel de artefactos, que es donde la sección lo pide.
                Va como franja propia bajo la cabecera y no dentro de ella
                porque la cabecera tiene alto fijo y el registro es una línea
                más; y va ENCIMA de la tira de pestañas porque lo que registra
                —lo que los agentes han hecho en el mundo— no pertenece a
                ningún documento en concreto, sino a la sesión.

                Cuando no ha pasado nada la franja no ocupa nada: el componente
                deja la región viva vacía y no monta ninguna entrada. */}
            <RegistroActuaciones className="px-6 border-b border-stroke-hairline bg-surface-1 empty:hidden" />

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
                                {/* La misma pila que enseña el Atril (§9.15), y
                                    por construcción: si se copiara, el día que
                                    una de las dos gane una banda o una acción,
                                    la otra se quedaría sin ella. */}
                                <DocumentoDelArtefacto artifact={activeArtifact} />
                            </motion.div>
                        ) : artifacts.length === 0 ? (
                            /* §9.14: glifo de línea, sin bucle ni resplandor —
                               «un vacío que parpadea pide perdón», y el
                               `blur-3xl` morado era además una capa compuesta
                               permanente por un estado en el que no pasa nada. */
                            /* 6.12 · §9.14: tenía glifo, título y frase, y le
                               faltaba lo cuarto — una acción. El vacío del panel
                               de artefactos es además el único que aparece con
                               el panel ABIERTO a propósito: la salida honrada es
                               cerrarlo y volver a la conversación, que es donde
                               se generan los documentos. */
                            <EstadoVacio
                                tamano="amplio"
                                className="flex-1 h-full"
                                glifo={<GitBranch aria-hidden="true" />}
                                titulo="Aún no hay documentos"
                                frase="El acta, el código y los diagramas que redacte la junta se abrirán aquí."
                                accion={{
                                    etiqueta: 'Volver a la conversación',
                                    onClick: () => toggleArtifactPanel(),
                                }}
                            />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-content-muted text-sm font-mono h-full">
                                Elige un documento arriba para leerlo
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* El Atril (§9.15). Se monta siempre y es `open` quien decide, no
                un `&&` alrededor: atado a `activeArtifact`, el Atril se cierra
                solo cuando el documento que mostraba desaparece del almacén —y
                un diálogo abierto sobre nada es una hoja en blanco que además
                tiene el foco atrapado dentro. */}
            <ArtifactExpanded
                artifact={activeArtifact}
                open={expandido && !!activeArtifact}
                onClose={() => setExpandido(false)}
            />
        </div>
    );
}
