import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import 'highlight.js/styles/atom-one-dark.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, RefreshCw, Pin, ThumbsUp, ThumbsDown, Trash2, Brain, ChevronDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { Message, Agent } from "@/types";
import { ArtifactCard } from './ArtifactCard';
import { ToolExecutionCard } from './ToolExecutionCard';
import { useChatStore } from '@/store/useChatStore';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { notify, reasonOf } from '@/lib/toastBus';
import { AvatarImage } from '@/components/ui/AvatarImage';

/**
 * Acción de la fila del turno (§9.11 «acciones»). Un solo sitio para las cinco:
 * el tamaño táctil de §12.11 (≥44×44 en `pointer: coarse`, y ahí lo estira la
 * regla de `index.css`) y el color de §2.2 —el token silenciado del sistema es
 * `ink-300`, 9.87:1 sobre e1— en vez del gris 500 de antes, ≈2.7:1.
 */
const ROW_ACTION_CLASS =
    'flex h-8 w-8 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong';

interface MessageBubbleProps {
    message: Message;
    agent?: Agent;
    agentColor?: string;
    sessionAvatar?: string | null;
    isTyping?: boolean;
    isLast?: boolean;
    searchQuery?: string;
    isPinned?: boolean;
    rating?: 'up' | 'down' | null;
    onRegenerate?: () => void;
    onPin?: () => void;
    onRate?: (rating: 'up' | 'down') => void;
    onEdit?: (newContent: string) => void;
    onDelete?: () => void;
}

/**
 * Bloque de "pensamiento" (chain-of-thought) estilo DeepSeek/Claude.
 * - Si hay razonamiento real (reasoning_content): se muestra colapsable,
 *   auto-expandido mientras razona y auto-colapsado cuando llega la respuesta.
 * - Fallback sintético: si aún no hay razonamiento ni contenido pero está
 *   streameando, muestra un "Pensando…" animado para no dejar la burbuja muda.
 */
function ThinkingBlock({ thinking, isStreaming, hasContent, hexColor, label }: {
    thinking?: string;
    isStreaming: boolean;
    hasContent: boolean;
    hexColor: string;
    label?: string;
}) {
    const [userToggled, setUserToggled] = useState(false);
    const [open, setOpen] = useState(false);

    const isThinkingNow = isStreaming && !hasContent;
    const hasThinking = !!(thinking && thinking.trim());

    if (!hasThinking) {
        if (isThinkingNow) {
            return (
                <div className="flex items-center gap-2 mb-2 text-xs text-content-muted italic">
                    <Brain className="h-3 w-3 animate-pulse" style={{ color: hexColor }} />
                    <span>{label || 'Pensando'}</span>
                    <span className="inline-flex gap-0.5">
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}>.</motion.span>
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}>.</motion.span>
                        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}>.</motion.span>
                    </span>
                </div>
            );
        }
        return null;
    }

    // Sin interacción del usuario: expandido mientras razona, colapsado al terminar.
    const expanded = userToggled ? open : isThinkingNow;

    return (
        <div className="mb-2">
            <button
                type="button"
                onClick={() => { setUserToggled(true); setOpen(!expanded); }}
                className="flex items-center gap-1.5 text-micro uppercase text-content-muted hover:text-content-strong transition-colors"
            >
                <Brain className="h-3 w-3" style={{ color: hexColor }} />
                <span>{isThinkingNow ? 'Razonando…' : 'Razonamiento'}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div
                            className="mt-1.5 pl-3 border-l-2 text-[12px] leading-relaxed text-content-muted italic whitespace-pre-wrap [overflow-wrap:break-word]"
                            style={{ borderColor: `${hexColor}40` }}
                        >
                            {thinking}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function MessageBubble({ message, agent, agentColor, sessionAvatar, isTyping, isLast, isPinned, rating, onRegenerate, onPin, onRate, onDelete }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const userAvatar = useUserAvatar();
    const artifacts = useChatStore(state => state.artifacts);
    const [copied, setCopied] = useState(false);

    /**
     * D36 — una copia que falla lo dice.
     *
     * `await navigator.clipboard.writeText(...)` + `setCopied(true)` sin
     * `try/catch`. El portapapeles falla más de lo que parece: contexto no
     * seguro (la app servida por http), permiso denegado, documento sin foco,
     * o `navigator.clipboard` directamente ausente.
     *
     * El enunciado del hallazgo decía «muestra ✓ aunque falle»; medido, no es
     * eso: el `await` va antes del `setCopied(true)`, así que con la promesa
     * rechazada el ✓ no se pinta. Lo que pasaba era **nada** — ni cambio en el
     * botón, ni aviso, y el rechazo quedaba como promesa sin dueño. Para quien
     * pulsa, una copia fallida y una hecha se veían exactamente igual, y se
     * llevaba lo que tuviera antes en el portapapeles.
     */
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            notify({
                title: 'No se pudo copiar el mensaje',
                detail: reasonOf(error) ?? 'Selecciona el texto y cópialo a mano: sigue en pantalla.',
                variant: 'error',
                dedupeKey: 'clipboard-message',
            });
        }
    };

    // HUD Colors: prioridad sesión > agente > fallback
    const defaultColor = '#00F0C8'; // Cyan
    const activeHexColor = agentColor || agent?.hexColor || defaultColor;

    // Board V2: etiqueta de "pensando" específica por rol y fase (en vez del genérico).
    const thinkingLabel = (() => {
        const who = agent ? agent.name.split(' ')[0] : message.role;
        if (message.phase === 'rebuttal') return `${who} prepara su réplica`;
        if (message.phase === 'synthesis') return `${who} redacta el acta`;
        if (message.phase === 'devil') return `${who} busca el punto débil`;
        if (message.phase === 'analysis') return `${who} está analizando`;
        return undefined;
    })();

    if (isSystem) {
        return (
            <div className="flex justify-center my-3 sm:my-4 px-2">
                <div className="bg-midnight/90 border border-surface-highlight text-content-muted text-xs px-4 py-2 rounded-2xl shadow-md backdrop-blur-md max-w-[85%] text-left whitespace-pre-wrap">
                    <ReactMarkdown
                        rehypePlugins={[rehypeSanitize]}
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                            strong: ({ children }) => <strong className="text-content-strong font-semibold">{children}</strong>
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex w-full mb-3 sm:mb-4", isUser ? "justify-end" : "justify-start")}>
            <div className={cn("flex max-w-[88%] sm:max-w-[80%] gap-2 sm:gap-3", isUser ? "flex-row-reverse" : "flex-row")}>

                {/* Agent Avatar */}
                {!isUser && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                            "h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center flex-shrink-0 border shadow-sm mt-1 bg-surface transition-colors duration-500 overflow-hidden",
                        )}
                        style={{ borderColor: `${activeHexColor}40` }}
                    >
                        <AvatarImage
                            src={sessionAvatar}
                            alt={agent?.name}
                            className="h-full w-full object-cover"
                            fallback={
                                agent
                                    ? <span className={cn("text-micro sm:text-xs font-bold", agent.color)}>{agent.avatar}</span>
                                    : <span className="text-micro sm:text-xs">🤖</span>
                            }
                        />
                    </motion.div>
                )}

                {/* User Avatar */}
                {isUser && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center flex-shrink-0 border border-cyan-500/30 shadow-sm mt-1 bg-gradient-to-br from-indigo-500 to-purple-600 overflow-hidden"
                    >
                        {/* `alt` en español: §11 «Un idioma». Decía "You". */}
                        <AvatarImage
                            src={userAvatar}
                            alt="Tú"
                            className="h-full w-full object-cover"
                            fallback={<span className="text-micro sm:text-xs font-bold text-white">S</span>}
                        />
                    </motion.div>
                )}

                {/* Bubble - IRON MAN HUD Morphing */}
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    data-row
                    className={cn(
                        "group p-3 sm:p-4 rounded-2xl shadow-lg text-sm leading-relaxed border text-left",
                        "min-w-[80px] max-w-full overflow-hidden",
                        "[overflow-wrap:break-word] [word-break:break-word]",
                        isUser
                            ? "bg-user-bubble/12 text-content rounded-tr-sm"
                            : "bg-ai-bubble/95 text-content-strong rounded-tl-sm backdrop-blur-sm relative"
                    )}
                    style={isUser
                        ? { borderColor: '#22D3EE20' }
                        : {
                            borderColor: `${activeHexColor}35`,
                            boxShadow: `0 0 20px ${activeHexColor}10`,
                            backgroundColor: undefined,
                        }
                    }
                >
                    {!isUser && (
                        <motion.div
                            animate={{ color: activeHexColor }}
                            className="text-micro font-bold mb-1 uppercase opacity-80 flex items-center gap-1.5"
                        >
                            <span className="h-1 w-1 rounded-full bg-current animate-pulse" />
                            {agent ? agent.name.split(' ')[0] : (message.role && !['user', 'system'].includes(message.role) ? message.role : 'SPHERE')}
                            {message.isConclusion && (
                                <span className="px-1.5 py-0.5 rounded bg-current/10 text-current text-micro not-italic">
                                    · CONCLUSIÓN
                                </span>
                            )}
                        </motion.div>
                    )}

                    {/* Línea de pensamiento (chain-of-thought) antes de la respuesta */}
                    {!isUser && (
                        <ThinkingBlock
                            thinking={message.thinking}
                            isStreaming={!!isTyping && !!isLast}
                            hasContent={!!message.content.trim()}
                            hexColor={activeHexColor}
                            label={thinkingLabel}
                        />
                    )}

                    {/* `max-w-none` neutraliza la medida de 68ch de `.doc-prose`:
                        aquí la impone la burbuja, y la medida del transcript la
                        fija la tarea 3.7. */}
                    <div className="doc-prose max-w-none break-words">
                        {/* Process message content, detecting artifact + tool placeholders */}
                        {(() => {
                            const combinedPattern = /\[ARTIFACT:([^:]+):([^\]]+)\]|\[TOOL_START:([^\]]+)\]|\[TOOL_RESULT:([^:]+):([^\]]*)\]|\[TOOL_ERROR:([^:]+):([^\]]*)\]/g;
                            const parts: React.ReactNode[] = [];
                            let lastIndex = 0;
                            let match;
                            let partKey = 0;

                            // Track tool states for rendering cards
                            const toolStates: Record<string, { status: 'running' | 'completed' | 'failed'; result?: string }> = {};

                            const content = message.content;

                            // Markdown components Shared Config
                            const markdownComponents = {
                                p: ({ children, ...props }: any) => {
                                    // Hack to prevent hydration errors: if children contain a block element (like pre), don't wrap in p
                                    const hasBlock = React.Children.toArray(children).some(
                                        child => React.isValidElement(child) && ['pre', 'ul', 'ol', 'blockquote'].includes((child.type as any).name || (child.type as any))
                                    );
                                    if (hasBlock) return <>{children}</>;
                                    return <p className="mb-3 last:mb-0 leading-relaxed" {...props}>{children}</p>;
                                },
                                code({ inline, className, children, ...props }: any) {
                                    if (!inline) {
                                        return (
                                            <div className="my-3 overflow-hidden rounded-lg border border-surface-highlight shadow-sm">
                                                <pre className="bg-midnight/80 p-3 overflow-x-auto text-[13px]">
                                                    <code className={cn("font-mono", className)} {...props}>
                                                        {children}
                                                    </code>
                                                </pre>
                                            </div>
                                        );
                                    }
                                    return (
                                        <code className={cn("bg-surface-highlight/50 px-1.5 py-0.5 rounded text-xs font-mono text-electric-cyan border border-electric-cyan/10", className)} {...props}>
                                            {children}
                                        </code>
                                    );
                                },
                                ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                                ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                                li: ({ children }: any) => <li className="text-content-strong">{children}</li>,
                                blockquote: ({ children }: any) => (
                                    <blockquote className="border-l-2 border-electric-cyan/30 pl-4 py-1 my-3 bg-electric-cyan/5 rounded-r text-content-muted italic">
                                        {children}
                                    </blockquote>
                                ),
                            };

                            while ((match = combinedPattern.exec(content)) !== null) {
                                // Add text before the placeholder
                                if (match.index > lastIndex) {
                                    const textBefore = content.slice(lastIndex, match.index);
                                    if (textBefore.trim()) {
                                        parts.push(
                                            <ReactMarkdown
                                                key={`text-${partKey++}`}
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                                                components={markdownComponents}
                                            >
                                                {textBefore}
                                            </ReactMarkdown>
                                        );
                                    }
                                }

                                if (match[1]) {
                                    // ARTIFACT match: [ARTIFACT:id:title]
                                    const artifactId = match[1];
                                    const artifact = artifacts.find(a => a.id === artifactId);
                                    if (artifact) {
                                        parts.push(
                                            <ArtifactCard
                                                key={`artifact-${artifactId}`}
                                                content={artifact.content}
                                                language={artifact.language || ''}
                                                title={artifact.title}
                                                artifactId={artifactId}
                                            />
                                        );
                                    }
                                } else if (match[3]) {
                                    // TOOL_START match: [TOOL_START:name]
                                    const toolName = match[3];
                                    toolStates[toolName] = { status: 'running' };
                                    parts.push(
                                        <ToolExecutionCard
                                            key={`tool-start-${partKey++}`}
                                            toolName={toolName}
                                            status="running"
                                        />
                                    );
                                } else if (match[4]) {
                                    // TOOL_RESULT match: [TOOL_RESULT:name:result]
                                    const toolName = match[4];
                                    const toolResult = match[5] || '';
                                    toolStates[toolName] = { status: 'completed', result: toolResult };
                                    // Replace the running card with a completed one
                                    const runningIdx = parts.findIndex(
                                        (p) => React.isValidElement(p) && (p.props as Record<string, unknown>)?.toolName === toolName && (p.props as Record<string, unknown>)?.status === 'running'
                                    );
                                    if (runningIdx >= 0) {
                                        parts[runningIdx] = (
                                            <ToolExecutionCard
                                                key={`tool-done-${partKey++}`}
                                                toolName={toolName}
                                                status="completed"
                                                result={toolResult}
                                            />
                                        );
                                    } else {
                                        parts.push(
                                            <ToolExecutionCard
                                                key={`tool-done-${partKey++}`}
                                                toolName={toolName}
                                                status="completed"
                                                result={toolResult}
                                            />
                                        );
                                    }
                                } else if (match[6]) {
                                    // TOOL_ERROR match: [TOOL_ERROR:name:error]
                                    const toolName = match[6];
                                    const toolError = match[7] || '';
                                    toolStates[toolName] = { status: 'failed', result: toolError };
                                    // Replace the running card with a failed one
                                    const runningIdx = parts.findIndex(
                                        (p) => React.isValidElement(p) && (p.props as Record<string, unknown>)?.toolName === toolName && (p.props as Record<string, unknown>)?.status === 'running'
                                    );
                                    const failedCard = (
                                        <ToolExecutionCard
                                            key={`tool-fail-${partKey++}`}
                                            toolName={toolName}
                                            status="failed"
                                            error={toolError}
                                        />
                                    );
                                    if (runningIdx >= 0) {
                                        parts[runningIdx] = failedCard;
                                    } else {
                                        parts.push(failedCard);
                                    }
                                }

                                lastIndex = match.index + match[0].length;
                            }

                            // Add remaining text after last placeholder
                            if (lastIndex < content.length) {
                                const remaining = content.slice(lastIndex);
                                if (remaining.trim()) {
                                    parts.push(
                                        <ReactMarkdown
                                            key={`text-${partKey++}`}
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                                            components={markdownComponents}
                                        >
                                            {remaining}
                                        </ReactMarkdown>
                                    );
                                }
                            }

                            // If no placeholders found, render normally
                            if (parts.length === 0) {
                                return (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                                        components={markdownComponents}
                                    >
                                        {message.content}
                                    </ReactMarkdown>
                                );
                            }

                            return parts;
                        })()}
                        {/* Cursor Fantasma */}
                        {isTyping && isLast && !isUser && (
                            <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ repeat: Infinity, duration: 0.8 }}
                                className="inline-block w-1.5 h-4 ml-1 align-middle"
                                style={{ backgroundColor: activeHexColor }}
                            />
                        )}
                    </div>

                    {/* Pin indicator */}
                    {isPinned && (
                        <div className="flex items-center gap-1 mt-1">
                            <Pin className="h-3 w-3 text-yellow-500" />
                            <span className="text-micro text-yellow-500/70 uppercase">Pinned</span>
                        </div>
                    )}

                    {/* Action buttons + timestamp footer */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        {/* Acciones del turno — D16 (1.11) · DESIGN §9.11 «acciones»
                            y P5. Eran `opacity-0 group-hover:opacity-100`: copiar,
                            anclar, valorar, regenerar y borrar quedaban
                            INALCANZABLES por teclado (el hover no llega) e
                            invisibles en táctil (donde el hover no existe).

                            El contrato vive en `index.css` (`[data-row]` /
                            `[data-row-actions]`) y no aquí a propósito: el punto
                            de partida por defecto es VISIBLE y sólo se oculta
                            cuando el dispositivo demuestra tener hover fino
                            —`@media (hover:hover) and (pointer:fine)`—, donde
                            reaparece con `:hover` Y con `:focus-within`. Con
                            utilidades sería al revés: se parte de oculto y
                            cualquier excepción que falte deja la acción
                            inalcanzable sin que nada avise.

                            gap-2 (8px) y no gap-1: §12.15 exige ≥8px de espacio
                            muerto entre dos objetivos táctiles adyacentes. */}
                        <div className="flex items-center gap-2" data-row-actions>
                            {/* Copiar. `aria-label` y no sólo `title`: §9.6
                                prohíbe que el `title` sea la única etiqueta, y
                                en táctil el `title` no aparece nunca. */}
                            <button type="button" onClick={handleCopy} aria-label={copied ? "Copiado" : "Copiar el mensaje"} className={ROW_ACTION_CLASS} title="Copiar">
                                {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                            </button>

                            {/* Anclar */}
                            {onPin && (
                                <button type="button" onClick={onPin} aria-pressed={isPinned} aria-label={isPinned ? "Desanclar el mensaje" : "Anclar el mensaje"} className={cn(ROW_ACTION_CLASS, isPinned && "text-warning")} title={isPinned ? "Desanclar" : "Anclar"}>
                                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            )}

                            {/* AI-only actions */}
                            {!isUser && !isSystem && (
                                <>
                                    {/* Regenerar */}
                                    {onRegenerate && (
                                        <button type="button" onClick={onRegenerate} aria-label="Regenerar la respuesta" className={ROW_ACTION_CLASS} title="Regenerar">
                                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    )}

                                    {/* Valoración */}
                                    {onRate && (
                                        <>
                                            <button type="button" onClick={() => onRate('up')} aria-pressed={rating === 'up'} aria-label="Valorar como buena respuesta" className={cn(ROW_ACTION_CLASS, rating === 'up' && "text-success")} title="Buena respuesta">
                                                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button type="button" onClick={() => onRate('down')} aria-pressed={rating === 'down'} aria-label="Valorar como mala respuesta" className={cn(ROW_ACTION_CLASS, rating === 'down' && "text-dissent")} title="Mala respuesta">
                                                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}

                            {/* User-only actions */}
                            {isUser && (
                                <>
                                    {onDelete && (
                                        <button type="button" onClick={onDelete} aria-label="Eliminar el mensaje" className={cn(ROW_ACTION_CLASS, "hover:text-dissent")} title="Eliminar">
                                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Chip de voto (board V2) + timestamp */}
                        <div className="flex items-center gap-2">
                            {!isUser && message.vote && (
                                <span
                                    className="px-2 py-0.5 rounded-full text-micro font-bold font-mono border"
                                    style={{
                                        color: activeHexColor,
                                        borderColor: `${activeHexColor}40`,
                                        backgroundColor: `${activeHexColor}12`,
                                    }}
                                    title={`Voto: ${message.vote.decision} · confianza ${message.vote.confidence}%`}
                                >
                                    {message.vote.decision === 'SI' ? '✓ A FAVOR' : message.vote.decision === 'NO' ? '✗ EN CONTRA' : '~ CONDICIONAL'} · {message.vote.confidence}%
                                </span>
                            )}
                            <span className="text-xs text-content-muted">
                                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
