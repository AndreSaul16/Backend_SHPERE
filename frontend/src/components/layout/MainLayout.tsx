import { type ReactNode, useState, useCallback, useEffect } from "react";
import { Menu, X, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/useChatStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { RegionBoundary } from "@/components/shared/RegionBoundary";

interface MainLayoutProps {
    sidebar: ReactNode;
    chat: ReactNode;
    artifactPanel?: ReactNode;
    className?: string;
}

/**
 * Ancho del panel de artefactos — DESIGN §4.2 (`--panel-artifact-*`).
 *
 * F3: el panel abría en 450px y su carril de pestañas se llevaba 224px fijos,
 * así que al acta —el entregable del producto— le quedaban ~215px de los 1440
 * de la pantalla y el título salía partido a media palabra. El carril pasa a ser
 * una tira horizontal (ver `ArtifactPanel`) y el ancho por defecto se alinea con
 * el token del contrato, con lo que la hoja recupera el panel entero.
 */
const MIN_PANEL_WIDTH = 380;
const MAX_PANEL_WIDTH = 760;
const DEFAULT_PANEL_WIDTH = 480;

/**
 * El ancho del panel sobrevive a la recarga (tarea 3.5).
 *
 * Era estado local: quien ensanchaba el panel para leer el acta a gusto lo
 * perdía en cada recarga y volvía a los 480px. Un ajuste que hay que rehacer
 * cada vez no es un ajuste.
 *
 * Se lee con un inicializador perezoso —nada de tocar `localStorage` en el
 * render— y se valida al leer: un valor corrupto o de una versión anterior no
 * puede dejar el panel en 12px.
 */
const CLAVE_ANCHO_PANEL = 'sphere:ancho-panel-artefactos';

function anchoGuardado(): number {
    try {
        const bruto = window.localStorage.getItem(CLAVE_ANCHO_PANEL);
        if (!bruto) return DEFAULT_PANEL_WIDTH;
        const n = Number.parseInt(bruto, 10);
        if (!Number.isFinite(n)) return DEFAULT_PANEL_WIDTH;
        return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, n));
    } catch {
        // Safari en privado tira al leer `localStorage`. El panel funciona igual.
        return DEFAULT_PANEL_WIDTH;
    }
}

export function MainLayout({ sidebar, chat, artifactPanel, className }: MainLayoutProps) {
    const { isSidebarOpen, toggleSidebar, isArtifactPanelOpen } = useChatStore();
    /* §4.3: por debajo de `xl` el panel es una hoja a pantalla completa; a
       partir de ahí, columna redimensionable. Antes esto se decidía leyendo
       `window.innerWidth` durante el render, que no vuelve a mirarse nunca:
       ensanchar la ventana dejaba el panel a pantalla completa hasta recargar. */
    const esColumna = useMediaQuery('(min-width: 80rem)');

    // Panel width state (desktop only)
    const [panelWidth, setPanelWidth] = useState(anchoGuardado);
    const [isResizing, setIsResizing] = useState(false);

    // Handle mouse drag for resizing
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing) return;

        // Calculate new width from right edge of window
        const newWidth = window.innerWidth - e.clientX;

        // Clamp to min/max
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
            setPanelWidth(newWidth);
        }
    }, [isResizing]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    // Se escribe cuando el ancho se asienta, no en cada píxel del arrastre.
    useEffect(() => {
        if (isResizing) return;
        try { window.localStorage.setItem(CLAVE_ANCHO_PANEL, String(panelWidth)); } catch { /* modo privado */ }
    }, [panelWidth, isResizing]);

    // §9.13: ←/→ mueven 16px, Home/End van a los extremos. El panel crece hacia
    // la izquierda, así que ← ensancha y → estrecha: la flecha empuja el canto,
    // no el número.
    const handleResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
        const STEP = 16;
        let next: number | null = null;
        if (e.key === 'ArrowLeft') next = panelWidth + STEP;
        else if (e.key === 'ArrowRight') next = panelWidth - STEP;
        else if (e.key === 'Home') next = MAX_PANEL_WIDTH;
        else if (e.key === 'End') next = MIN_PANEL_WIDTH;
        if (next === null) return;
        e.preventDefault();
        setPanelWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, next)));
    }, [panelWidth]);

    // §9.13: «por debajo de lg es un cajón: … Escape cierra». El cajón tapa la
    // aplicación entera tras un velo, así que sin esta salida por teclado la
    // única forma de recuperar el producto es acertar con el dedo en el velo.
    useEffect(() => {
        if (!isSidebarOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // En lg+ la barra es fija y «abierta» es su estado normal: cerrarla
            // con Escape sería quitar de en medio algo que nadie ha invocado.
            if (window.innerWidth >= 1024) return;
            toggleSidebar(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isSidebarOpen, toggleSidebar]);

    // Attach/detach global mouse listeners for drag
    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <div className={cn("flex h-dvh w-full min-w-0 overflow-hidden bg-transparent", className)}>
            {/* Mobile Menu Button - Dynamic Position */}
            <button
                onClick={() => toggleSidebar()}
                aria-label={isSidebarOpen ? "Cerrar el menú" : "Abrir el menú"}
                aria-expanded={isSidebarOpen}
                aria-controls="app-sidebar"
                className={cn(
                    "lg:hidden fixed top-3.5 z-50 p-2.5 bg-surface-1 border border-stroke-edge rounded-sm text-content-strong hover:bg-surface-2 transition-colors duration-(--duration-tap) shadow-e3",
                    isSidebarOpen ? "left-[min(248px,78vw)]" : "left-4"
                )}
            >
                {isSidebarOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>

            {/* Left Sidebar - Responsive */}
            <aside id="app-sidebar" className={cn(
                "fixed lg:relative inset-y-0 left-0 z-40 w-[min(288px,86vw)] lg:w-72 h-full border-r border-stroke-hairline flex-shrink-0 bg-surface-1 transform transition-transform duration-(--duration-panel) ease-(--ease-travel)",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                {/* Eje 3 · la barra lateral se cae sola. Antes un fallo aquí
                    —una sesión con forma inesperada, un avatar imposible— se
                    llevaba por delante la conversación entera, que es lo único
                    que el usuario no puede permitirse perder. */}
                <RegionBoundary
                    region="la lista de juntas"
                    reassurance="Tu conversación sigue abierta a la derecha. Puedes seguir trabajando en ella."
                >
                    {sidebar}
                </RegionBoundary>
            </aside>

            {/* Mobile Backdrop for Sidebar */}
            {isSidebarOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="lg:hidden fixed inset-0 z-30 bg-baize-950/72 backdrop-blur-[3px]"
                    onClick={() => toggleSidebar(false)}
                />
            )}

            {/* Center Chat - Flexible */}
            <main className="flex-1 h-full relative flex flex-col min-w-0 z-10 bg-transparent">
                <ErrorBoundary>
                    {chat}
                </ErrorBoundary>
            </main>

            {/* Right Artifact Panel */}
            {artifactPanel && (
                <aside
                    className={cn(
                        "h-full border-l border-stroke-hairline bg-surface-1 shadow-e3 transition-all",
                        "fixed inset-0 z-[60] xl:relative xl:inset-auto xl:z-20",
                        isArtifactPanelOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0 pointer-events-none xl:hidden",
                        isResizing ? "transition-none" : "duration-300"
                    )}
                    style={{ width: esColumna ? `${panelWidth}px` : undefined }}
                >
                    {/* Tirador de redimensionar — DESIGN §9.13.
                        Era «un `div` con `onMouseDown` y nada más: no hay forma
                        de redimensionar sin ratón». §9.13 prescribe literalmente
                        el sustituto: `role="separator"`, `aria-orientation`,
                        `aria-valuenow` y operable con ←/→ (paso 16px) y
                        Home/End. El arrastre sigue siendo el atajo de ratón.

                        La regla de jsx-a11y sobre interacciones en elementos no
                        interactivos lo marca, y es un falso positivo suyo,
                        verificado: su tabla de roles (aria-query) declara
                        separator con superClass [roletype, structure] y punto.
                        WAI-ARIA 1.2 dice que un separator FOCALIZABLE es un rol
                        de widget, y el patrón «Window Splitter» de la APG es
                        literalmente esto: role=separator + tabindex +
                        aria-valuenow + flechas. El control SÍ es operable por
                        teclado; lo que está incompleto es el modelo de la regla.
                        Se silencia sólo esta línea, con su motivo. */}
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                    <div
                        role="separator"
                        tabIndex={0}
                        aria-orientation="vertical"
                        aria-label="Ancho del panel de artefactos"
                        aria-valuenow={panelWidth}
                        aria-valuemin={MIN_PANEL_WIDTH}
                        aria-valuemax={MAX_PANEL_WIDTH}
                        aria-valuetext={`${panelWidth} píxeles`}
                        onMouseDown={handleMouseDown}
                        onKeyDown={handleResizeKeyDown}
                        className={cn(
                            "hidden xl:flex absolute left-0 top-0 bottom-0 w-3 cursor-col-resize items-center justify-center group hover:bg-electric-cyan/10 transition-colors z-10",
                            isResizing && "bg-electric-cyan/20"
                        )}
                    >
                        <GripVertical className={cn(
                            "h-6 w-4 text-stroke-control group-hover:text-accent transition-colors",
                            isResizing && "text-electric-cyan"
                        )} aria-hidden="true" />
                    </div>

                    {/* Panel Content */}
                    <div className="h-full xl:pl-3">
                        <RegionBoundary
                            region="el panel de artefactos"
                            reassurance="La conversación y el acta siguen en su sitio; sólo se ha caído este panel."
                        >
                            {artifactPanel}
                        </RegionBoundary>
                    </div>
                </aside>
            )}
        </div>
    );
}
