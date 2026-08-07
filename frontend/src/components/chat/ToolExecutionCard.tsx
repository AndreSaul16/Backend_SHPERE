import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/useChatStore';

interface ToolExecutionCardProps {
    toolName: string;
    status: 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
}

const TOOL_LABELS: Record<string, string> = {
    // Shared
    calendar_list_events: 'Consultando calendario',
    calendar_create_event: 'Creando evento',
    calendar_update_event: 'Actualizando evento',
    calendar_delete_event: 'Eliminando evento',
    calendar_check_availability: 'Verificando disponibilidad',
    whatsapp_send_message: 'Enviando WhatsApp',
    whatsapp_send_notification: 'Enviando notificación',
    whatsapp_read_messages: 'Leyendo mensajes',
    // CEO
    delegate_task: 'Delegando tarea',
    check_task_status: 'Consultando estado de tarea',
    list_active_tasks: 'Listando tareas activas',
    // CFO
    get_financial_news: 'Buscando noticias financieras',
    get_stock_data: 'Consultando datos de bolsa',
    get_market_analysis: 'Analizando mercado',
    // CMO
    post_to_linkedin: 'Publicando en LinkedIn',
    post_to_instagram: 'Publicando en Instagram',
    get_social_analytics: 'Consultando analytics',
    schedule_post: 'Programando publicación',
    // CTO
    create_jules_task: 'Enviando tarea a Jules',
    check_jules_status: 'Verificando estado de Jules',
    review_jules_output: 'Revisando código de Jules',
};

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
    status,
}: {
    interactive: boolean;
    expanded: boolean;
    onToggle: () => void;
    panelId: string;
    label: string;
    isFailed: boolean;
    status: ToolExecutionCardProps['status'];
}) {
    const contenido = (
        <>
            {status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" aria-hidden="true" />
            ) : isFailed ? (
                <XCircle className="h-3.5 w-3.5 text-dissent" aria-hidden="true" />
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
}) => {
    const [expanded, setExpanded] = useState(false);
    const panelId = React.useId();
    const label = TOOL_LABELS[toolName] || toolName;
    const isFailed = status === 'failed';
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
                    ? 'bg-red-500/5 border-red-500/30'
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
                status={status}
            />
            {isFailed && (
                <div className="mt-2 space-y-2">
                    {error && (
                        <p className="text-xs text-red-300/80 leading-relaxed break-words">
                            {error}
                        </p>
                    )}
                    <button
                        onClick={handleRetry}
                        disabled={isStreaming}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        title={isStreaming ? 'Espera a que termine la respuesta actual' : 'Pedir al agente que reintente'}
                    >
                        <RotateCcw className="h-3 w-3" />
                        Reintentar
                    </button>
                </div>
            )}
            <AnimatePresence>
                {expanded && result && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <pre id={panelId} className="mt-2 text-xs text-content-muted whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-midnight/60 rounded p-2">
                            {result}
                        </pre>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
