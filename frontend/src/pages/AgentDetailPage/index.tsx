/**
 * La ficha de un director. Sólo coloca: lo que hace está en `useAgentDetail`,
 * lo que se ve está en las tres secciones.
 *
 * Eran 710 líneas en un fichero (7.3 · D40 de la ficha). El diálogo de borrado
 * y los avisos NO se han vuelto a extraer aquí porque ya existían: la fase 1
 * los mandó a `ConfirmDialog` y al `<ToastProvider>` de la raíz.
 */
import { useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { UnsavedGuardDialog } from '@/components/ui/UnsavedGuardDialog';
import { BarraDeGuardado } from '@/components/ui/BarraDeGuardado';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KnowledgeBasePanel } from '@/components/agents/KnowledgeBasePanel';
import { InlineError } from '@/components/ui/InlineError';
import { buttonClass } from '@/components/ui/buttonStyles';
import { EsqueletoDeFormulario } from '@/components/ui/Esqueleto';
import { panelClass } from '@/components/ui/cardStyles';
import { useAgentDetail } from './useAgentDetail';
import { SeccionIdentidad } from './SeccionIdentidad';
import { SeccionCerebro } from './SeccionCerebro';
import { SeccionPeligro } from './SeccionPeligro';

export function AgentDetailPage() {
    const { agentId } = useParams<{ agentId: string }>();
    const ficha = useAgentDetail(agentId);
    const { borrador, cambiar } = ficha;
    const inicial = borrador.name.trim().charAt(0).toUpperCase() || 'A';

    /* 6.13 · §9.12: la ficha de un director es un formulario largo de forma
       conocida. Con el giro centrado la pantalla cambiaba entera de golpe; con
       la silueta, el contenido aterriza en su sitio. */
    if (ficha.cargando) {
        return (
            <div className="h-full overflow-y-auto p-4 sm:p-8">
                <div className="mx-auto max-w-2xl">
                    <EsqueletoDeFormulario etiqueta="Cargando la ficha del director" filas={5} />
                </div>
            </div>
        );
    }

    if (ficha.errorDeCarga !== null) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-0/40 px-4">
                <div className="w-full max-w-md space-y-3">
                    <InlineError
                        title="No se ha podido abrir este agente"
                        detail="Su configuración sigue guardada tal cual: esto es un fallo al traerla, no una pérdida."
                        reason={ficha.errorDeCarga || undefined}
                        onRetry={() => window.location.reload()}
                        retryLabel="Volver a cargarlo"
                    />
                    {/* Dos salidas, no una: reintentar por si fue un tropiezo, y
                        volver al chat por si el agente ya no existe. */}
                    <button
                        type="button"
                        onClick={ficha.volver}
                        className={buttonClass({ variant: 'secondary', className: 'w-full' })}
                    >
                        Volver al chat
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-surface-0/40 relative overflow-hidden">
            {/* 5.15 · D63 — este formulario YA calculaba «sucio» y sólo lo usaba
                para atenuar el botón de guardar: un clic en el rail se llevaba
                por delante un prompt de sistema reescrito entero. */}
            <UnsavedGuardDialog
                sucio={ficha.sucio}
                objeto={borrador.name || 'este director'}
                consecuencia="Se pierden el prompt, el modelo y los ajustes que has cambiado."
            />

            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-surface-0 sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <button
                        type="button"
                        onClick={ficha.volver}
                        aria-label="Volver al chat"
                        className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>

                    <div className="flex items-center gap-3">
                        <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold border"
                            style={{
                                backgroundColor: `${borrador.color}15`,
                                borderColor: `${borrador.color}40`,
                                color: borrador.color,
                            }}
                        >
                            {inicial}
                        </div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-xl font-bold text-content-strong truncate max-w-[180px] sm:max-w-none">
                                {borrador.name || 'Agente'}
                            </h1>
                            <span
                                className="hidden sm:inline-flex px-2 py-0.5 rounded text-micro font-mono font-bold uppercase border"
                                style={{
                                    color: borrador.color,
                                    borderColor: `${borrador.color}30`,
                                    backgroundColor: `${borrador.color}10`,
                                }}
                            >
                                {ficha.role}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => { void ficha.guardar(); }}
                    disabled={ficha.guardando || !ficha.sucio}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition-all',
                        ficha.sucio
                            ? 'bg-accent/10 text-accent hover:bg-accent hover:text-surface-0'
                            : 'bg-surface text-content-quiet cursor-not-allowed',
                    )}
                >
                    {ficha.guardando
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />}
                    <span className="hidden sm:inline">
                        {ficha.guardando ? 'Guardando...' : 'Guardar Cambios'}
                    </span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-8 pb-32 sm:pb-12 scrollbar-thin scrollbar-thumb-surface-highlight">
                <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
                    <SeccionIdentidad borrador={borrador} cambiar={cambiar} inicial={inicial} />
                    <SeccionCerebro borrador={borrador} cambiar={cambiar} />

                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className={panelClass({ padding: 'none', className: 'overflow-hidden' })}
                    >
                        <div className="flex items-center gap-2 px-6 sm:px-8 pt-6 sm:pt-8 pb-2">
                            <BookOpen className="h-4 w-4 text-luxury-purple" />
                            <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                                Base de Conocimiento
                            </h2>
                        </div>
                        <div className="px-2 sm:px-4 pb-4">
                            <KnowledgeBasePanel agentId={agentId!} />
                        </div>
                    </motion.section>

                    <SeccionPeligro onEliminar={ficha.pedirBorrado} />

                    {/* 6.5 · La barra adherida. El botón de guardar de la
                        cabecera se queda —es donde la mano lo busca al llegar—
                        pero este formulario mide dos pantallas y media. */}
                    <BarraDeGuardado
                        cambios={ficha.cambiosPendientes}
                        guardando={ficha.guardando}
                        onGuardar={() => { void ficha.guardar(); }}
                        onDescartar={ficha.descartarCambios}
                        objeto={borrador.name || 'este director'}
                    />
                </div>
            </div>

            {/* ── Confirmación de borrado (§9.4 / §11) ─────────────── */}
            <ConfirmDialog
                open={ficha.confirmandoBorrado}
                onClose={ficha.cancelarBorrado}
                onConfirm={() => { void ficha.eliminar(); }}
                question="¿Eliminar el agente"
                objectName={borrador.name || 'este agente'}
                consequence="Se pierden su configuración, su base de conocimiento y sus datos asociados. No se puede deshacer."
                confirmLabel="Eliminar definitivamente"
                confirmLoadingLabel="Eliminando"
                loading={ficha.eliminando}
            />
        </div>
    );
}
