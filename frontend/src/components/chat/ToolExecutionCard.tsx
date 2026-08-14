import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Wrench, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, RotateCcw, HelpCircle, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/useChatStore';
import type { RemedioDeFallo } from '@/utils/parseMessageParts';
import { TOOL_LABELS } from './toolLabels';
import { conMovimiento, CURVA, DURACION } from '@/lib/motion';

interface ToolExecutionCardProps {
    toolName: string;
    status: 'running' | 'completed' | 'failed' | 'awaiting_confirmation';
    result?: string;
    error?: string;
    /** Qué se hará si el usuario confirma. Solo en `awaiting_confirmation`. */
    resumen?: string;
    /**
     * Qué puede hacer el usuario ante el fallo. Lo decide el backend; aquí sólo se
     * obedece. Ausente = `retry`, que es la conducta de siempre.
     */
    remedio?: RemedioDeFallo;
}

/** Dónde se conectan las credenciales. Un solo destino: Ajustes → Conexiones. */
const RUTA_DE_CONEXIONES = '/settings/integrations';

/** Dónde se autorizan los destinatarios. Ajustes → Contactos, que es lo que dice el error. */
const RUTA_DE_CONTACTOS = '/settings/contacts';


/**
 * Cabecera de la tarjeta. Cuando hay resultado que desplegar es un <button> con
 * `aria-expanded`/`aria-controls`; cuando no lo hay es un contenedor inerte, sin
 * manejador y sin rol interactivo. Separarlo así evita el `<div onClick>` y
 * también el botón que no hace nada, que es la otra forma de romperlo.
 */
function Header({
    interactive,
    expanded,
    onToggle,
    panelId,
    label,
    isFailed,
    isAwaiting,
    status,
}: {
    interactive: boolean;
    expanded: boolean;
    onToggle: () => void;
    panelId: string;
    label: string;
    isFailed: boolean;
    isAwaiting: boolean;
    status: ToolExecutionCardProps['status'];
}) {
    const contenido = (
        <>
            {status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" aria-hidden="true" />
            ) : isFailed ? (
                <XCircle className="h-3.5 w-3.5 text-dissent" aria-hidden="true" />
            ) : isAwaiting ? (
                /* Ni ✓ ni ✗: la acción no ha ocurrido y tampoco ha fallado. */
                <HelpCircle className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            )}
            <Wrench className="h-3 w-3 text-content-muted" aria-hidden="true" />
            <span className={cn('font-medium flex-1 text-start', isFailed ? 'text-dissent' : 'text-content-muted')}>
                {isFailed ? `${label} — falló` : label}
            </span>
            {interactive && (
                expanded
                    ? <ChevronUp className="h-3 w-3 text-content-muted" aria-hidden="true" />
                    : <ChevronDown className="h-3 w-3 text-content-muted" aria-hidden="true" />
            )}
        </>
    );

    if (!interactive) {
        return <div className="flex items-center gap-2 select-none">{contenido}</div>;
    }

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="flex w-full items-center gap-2 cursor-pointer select-none"
        >
            {contenido}
        </button>
    );
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
    toolName,
    status,
    result,
    error,
    resumen,
    remedio,
}) => {
    const [expanded, setExpanded] = useState(false);
    const panelId = React.useId();
    const reducido = useReducedMotion();
    const label = TOOL_LABELS[toolName] || toolName;
    const isFailed = status === 'failed';
    // Lista de NO reintentables, nunca al revés: lo que no está probado imposible
    // conserva el botón. Un remedio ausente o desconocido cae aquí a propósito.
    const ofreceReintento = remedio !== 'connect' && remedio !== 'none' && remedio !== 'whitelist';
    const ofreceConexion = remedio === 'connect';
    // El contacto no está autorizado: reintentar no puede funcionar hasta que exista,
    // y darlo de alta es una pantalla distinta de la de Conexiones.
    const ofreceContactos = remedio === 'whitelist';
    const isAwaiting = status === 'awaiting_confirmation';
    const isStreaming = useChatStore(
        (s) => s.currentSessionId !== null && s.streamingSessionIds.includes(s.currentSessionId)
    );

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        const { sendMessage } = useChatStore.getState();
        void sendMessage(
            `Vuelve a intentar la herramienta "${label}" (${toolName}) que acaba de fallar, con los mismos parámetros.`
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'my-2 rounded-lg border px-3 py-2 text-xs',
                isFailed
                    ? 'bg-oxblood-500/5 border-oxblood-500/30'
                    : 'bg-surface-3 border-surface-highlight',
            )}
        >
            {/* §12.4 y §12.7: era un `<div onClick>`, o sea desplegar el
                resultado de una herramienta no se podía con teclado y el estado
                del desplegable no se anunciaba. Ahora es un <button> con
                `aria-expanded` + `aria-controls` cuando hay algo que desplegar,
                y un <div> inerte —sin manejador— cuando no lo hay: un botón que
                no hace nada es peor que ninguno. */}
            <Header
                interactive={!!result}
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                panelId={panelId}
                label={label}
                isFailed={isFailed}
                isAwaiting={isAwaiting}
                status={status}
            />
            {/* Sin botón: quien confirma es el usuario respondiéndole al agente,
                no un clic que reenvía la herramienta. */}
            {isAwaiting && resumen && (
                <p className="mt-2 text-xs text-content-muted leading-relaxed break-words">
                    {resumen}
                </p>
            )}
            {isFailed && (
                <div className="mt-2 space-y-2">
                    {error && (
                        <p className="text-xs text-danger/80 leading-relaxed break-words">
                            {error}
                        </p>
                    )}
    {/* Pulsar «Reintentar» manda un mensaje nuevo al agente y GASTA UN CRÉDITO.
                        Ante una credencial que falta no puede funcionar jamás, así que ahí el
                        botón no se deshabilita ni se esconde: no existe. */}
                    {ofreceReintento && (
                        <button
                            onClick={handleRetry}
                            disabled={isStreaming}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-oxblood-500/30 text-danger hover:bg-oxblood-500/10 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                            title={isStreaming ? 'Espera a que termine la respuesta actual' : 'Pedir al agente que reintente'}
                        >
                            <RotateCcw className="h-3 w-3" />
                            Reintentar
                        </button>
                    )}
                    {ofreceConexion && (
                        <Link
                            to={RUTA_DE_CONEXIONES}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-oxblood-500/30 text-danger hover:bg-oxblood-500/10 transition-colors text-sm font-medium"
                            title="Conectar el servicio en Ajustes"
                        >
                            <Link2 className="h-3 w-3" />
                            Ir a Ajustes → Conexiones
                        </Link>
                    )}
                    {ofreceContactos && (
                        <Link
                            to={RUTA_DE_CONTACTOS}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-oxblood-500/30 text-danger hover:bg-oxblood-500/10 transition-colors text-sm font-medium"
                            title="Autorizar el contacto en Ajustes"
                        >
                            <Link2 className="h-3 w-3" />
                            Ir a Ajustes → Contactos
                        </Link>
                    )}
                </div>
            )}
            <AnimatePresence>
                {expanded && result && (
                    /* §7.4/§7.5 — la rejilla, no el alto: la tarjeta vive
                       dentro del transcript y animar `height` arrastraría a
                       todos los turnos de debajo en cada fotograma. */
                    <motion.div
                        initial={{ gridTemplateRows: '0fr', opacity: 0 }}
                        animate={{ gridTemplateRows: '1fr', opacity: 1 }}
                        exit={{ gridTemplateRows: '0fr', opacity: 0 }}
                        transition={conMovimiento(reducido, { duration: DURACION.reveal, ease: CURVA.settle })}
                        className="grid"
                    >
                        <div className="overflow-hidden">
                        <pre id={panelId} className="mt-2 text-xs text-content-muted whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-midnight/60 rounded p-2">
                            {result}
                        </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
