/**
 * El aviso de los fallos del store — reescrito para que ninguno deje parado.
 *
 * Lo que había: un recuadro rojo fijo en la esquina con el título «ERROR DEL
 * SISTEMA» y debajo el mensaje interno del store («Fallo al recuperar el
 * historial de la sesión»). Sin botón de cerrar, sin reintentar, y sin forma de
 * quitarlo: se quedaba hasta que otra acción pisara `errorStates`. Informaba y
 * dejaba al usuario mirándolo.
 *
 * Lo que hay: cada contexto sabe QUÉ pasó en cristiano, QUÉ se conserva y QUÉ
 * se puede hacer, con el reintento cableado a la acción del store que falló.
 * Y siempre, siempre, se puede cerrar.
 *
 * §11 aplicado a rajatabla:
 *   · el título nombra la cosa, nunca «Error del Sistema»;
 *   · el mensaje interno NO se pinta —es para el registro, no para la pantalla—;
 *   · si no se ha perdido nada, se dice con esas palabras.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RotateCcw, X } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import type { ErrorContext } from '@/lib/errors';

interface Guion {
    titulo: string;
    detalle: string;
    /** Etiqueta del reintento. Sin ella el aviso sólo se cierra. */
    accion?: string;
}

/**
 * El orden importa: si hay varios fallos vivos se enseña el primero de esta
 * lista, que va del más bloqueante al más anecdótico.
 */
const GUION: Array<[ErrorContext, Guion]> = [
    ['create_session', {
        titulo: 'No se ha podido abrir la junta',
        detalle: 'No se ha creado nada ni se ha gastado ningún crédito. Vuelve a intentarlo.',
        accion: 'Reintentar',
    }],
    ['load_history', {
        titulo: 'No se ha podido cargar esta conversación',
        detalle: 'El debate sigue guardado en tu cuenta: esto es un fallo al traerlo, no una pérdida.',
        accion: 'Volver a cargarla',
    }],
    ['send_message', {
        titulo: 'Tu mensaje no ha salido',
        detalle: 'Sigue en el campo de escritura y no se ha cobrado nada. Vuelve a enviarlo cuando quieras.',
    }],
    ['fetch_agents', {
        titulo: 'No se ha podido cargar tu historial de juntas',
        detalle: 'La conversación que tengas abierta sigue funcionando. Puedes reintentar la lista.',
        accion: 'Reintentar',
    }],
    ['artifact_parser', {
        titulo: 'Un artefacto ha llegado ilegible',
        detalle: 'El resto de la conversación está intacto. Puedes seguir; el texto del debate no se ve afectado.',
    }],
    ['core_engine', {
        titulo: 'La junta ha tenido un problema interno',
        detalle: 'Lo escrito hasta ahora se conserva. Si se repite, recarga la página.',
    }],
];

export function ErrorOverlay() {
    const errorStates = useChatStore((s) => s.errorStates);
    const clearError = useChatStore((s) => s.clearError);
    const [reintentando, setReintentando] = useState(false);

    const entrada = GUION.find(([ctx]) => errorStates[ctx] !== null);
    if (!entrada) return null;
    const [context, guion] = entrada;

    const reintentar = async () => {
        const store = useChatStore.getState();
        clearError(context);
        setReintentando(true);
        try {
            if (context === 'fetch_agents') await store.fetchSessions();
            else if (context === 'load_history' && store.currentSessionId) {
                await store.loadSession(store.currentSessionId);
            } else if (context === 'create_session') {
                await store.createNewSession(store.selectedAgentId ?? undefined);
            }
        } catch {
            // El propio store vuelve a escribir en `errorStates`: el aviso
            // reaparece solo con el mismo guion. No hace falta contarlo aquí.
        } finally {
            setReintentando(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                /* Ancho completo abajo por debajo de sm y esquina en sm+, igual
                   que la pila de avisos: `right-6` con `w-full` se salía por la
                   izquierda a 390px, que es la mayoría del tráfico. */
                className="fixed inset-x-0 bottom-0 z-[100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:end-6 sm:bottom-24 sm:w-[380px] sm:p-0"
            >
                <div
                    role="alert"
                    data-testid="aviso-de-fallo"
                    className="flex items-start gap-3 rounded-sm border border-stroke-edge border-s-[3px] border-s-danger bg-surface-3 p-3 shadow-e3 ring-1 ring-black/40"
                >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-[550] text-content-strong">{guion.titulo}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{guion.detalle}</p>
                        {guion.accion && (
                            <button
                                type="button"
                                onClick={reintentar}
                                disabled={reintentando}
                                className="mt-2 flex items-center gap-1.5 rounded-sm text-xs font-[550] text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover disabled:text-content-quiet disabled:no-underline"
                            >
                                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                {reintentando ? 'Reintentando…' : guion.accion}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => clearError(context)}
                        aria-label={`Cerrar aviso: ${guion.titulo}`}
                        className="-me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
