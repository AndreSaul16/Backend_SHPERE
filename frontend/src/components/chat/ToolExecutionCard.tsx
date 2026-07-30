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

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
    toolName,
    status,
    result,
    error,
}) => {
    const [expanded, setExpanded] = useState(false);
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
            <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => result && setExpanded(!expanded)}
            >
                {status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 text-electric-cyan animate-spin" />
                ) : isFailed ? (
                    <XCircle className="h-3.5 w-3.5 text-red-400" />
                ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                )}
                <Wrench className="h-3 w-3 text-content-muted" />
                <span className={cn('font-medium flex-1', isFailed ? 'text-red-300' : 'text-content-muted')}>
                    {isFailed ? `${label} — falló` : label}
                </span>
                {result && (
                    expanded
                        ? <ChevronUp className="h-3 w-3 text-content-quiet" />
                        : <ChevronDown className="h-3 w-3 text-content-quiet" />
                )}
            </div>
            {isFailed && (
                <div className="mt-2 space-y-2">
                    {error && (
                        <p className="text-[11px] text-red-300/80 leading-relaxed break-words">
                            {error}
                        </p>
                    )}
                    <button
                        onClick={handleRetry}
                        disabled={isStreaming}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <pre className="mt-2 text-[11px] text-content-quiet whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-midnight/60 rounded p-2">
                            {result}
                        </pre>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
