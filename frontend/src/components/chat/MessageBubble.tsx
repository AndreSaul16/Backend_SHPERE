import React, { memo, useMemo, useState } from 'react';
import { useEstadoEfimero } from '@/hooks/useEstadoEfimero';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Copy, Check, RefreshCw, Pin, ThumbsUp, ThumbsDown, Trash2, Brain, ChevronDown } from 'lucide-react';
import { cn } from "@/lib/utils";
import type { Message, Agent } from "@/types";
import { ArtifactCard } from './ArtifactCard';
import { VersionesDelTurno } from './VersionesDelTurno';
import { ToolExecutionCard } from './ToolExecutionCard';
import { AGENT_HEX, useChatStore } from '@/store/useChatStore';
import { colorDeAgente, colorDeAgenteAlpha } from '@/lib/colorDeAgente';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { notify, reasonOf } from '@/lib/toastBus';
import { AvatarImage } from '@/components/ui/AvatarImage';
import { DocTable } from '@/components/shared/DocTable';
import { CodigoMarkdown } from '@/components/shared/CodigoMarkdown';
import { VoteChip } from './VoteChip';
import { parseMessageParts } from '@/utils/parseMessageParts';

/**
 * Acción de la fila del turno (§9.11 «acciones»). Un solo sitio para las cinco:
 * el tamaño táctil de §12.11 (≥44×44 en `pointer: coarse`, y ahí lo estira la
 * regla de `index.css`) y el color de §2.2 —el token silenciado del sistema es
 * `ink-300`, 9.87:1 sobre e1— en vez del gris 500 de antes, ≈2.7:1.
 */
const ROW_ACTION_CLASS =
    'flex h-8 w-8 items-center justify-center rounded-sm text-content-muted transition-colors hover:bg-stroke-hairline hover:text-content-strong';

/**
 * Tarea 2.3 · §P1 «el documento manda sobre el chat».
 *
 * El transcript se pinta dentro de `.doc-prose`, así que encabezados, listas,
 * citas, enlaces, negritas, itálicas, `hr`, `img` y código salen ya con la
 * tipografía del documento. Aquí SÓLO quedan los tres casos que el CSS no puede
 * resolver solo.
 *
 * 4.7: vive en el scope del MÓDULO y no dentro del componente. Declarado dentro,
 * era un objeto nuevo en cada render, así que `react-markdown` no podía
 * reutilizar nada entre dos tokens y volvía a construir el árbol de componentes
 * entero. Un objeto estable es la mitad de lo que hace que `React.memo` de abajo
 * sirva para algo.
 */
const COMPONENTES_MARKDOWN = {
    // `react-markdown` mete los bloques dentro del <p> del párrafo y el DOM lo
    // rechaza. No es estilo: es validez del árbol.
    p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => {
        const hasBlock = React.Children.toArray(children).some((child) => {
            if (!React.isValidElement(child)) return false;
            // El `type` de un elemento es la etiqueta ('pre') si es intrínseco,
            // o el componente si no. Antes esto era `(child.type as any).name
            // || (child.type as any)`, que en un componente anónimo daba
            // `undefined` y el `.includes` decía que no había bloque: el <p>
            // se pintaba igual y el DOM lo rechazaba.
            const tipo = typeof child.type === 'string'
                ? child.type
                : (child.type as { displayName?: string; name?: string }).displayName
                    ?? (child.type as { name?: string }).name
                    ?? '';
            return ['pre', 'ul', 'ol', 'blockquote'].includes(tipo);
        });
        if (hasBlock) return <>{children}</>;
        return <p {...props}>{children}</p>;
    },
    // F4 · §9.7: una tabla ancha se desplaza dentro de su contenedor; jamás
    // rompe la burbuja.
    table: DocTable,
    // 4.4: el bloque cercado lo colorea el MISMO Prism ligero que el panel de
    // artefactos. Antes esto lo hacía `rehype-highlight` con el tema de
    // `highlight.js`: dos motores de resaltado en la misma pantalla.
    code: CodigoMarkdown,
};

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
                            style={{ borderColor: `color-mix(in srgb, ${hexColor} 25%, transparent)` }}
                        >
                            {thinking}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function MessageBubbleInterno({ message, agent, agentColor, sessionAvatar, isTyping, isLast, isPinned, rating, onRegenerate, onPin, onRate, onDelete }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const userAvatar = useUserAvatar();
    const reducido = useReducedMotion();
    const artifacts = useChatStore(state => state.artifacts);
    const [copied, marcarCopiado] = useEstadoEfimero(false, 2000);

    /**
     * 4.7 — el turno partido en piezas, y sólo cuando el turno cambia.
     *
     * Sin `useMemo` esto corría en cada render: durante el streaming, una vez
     * por token, por burbuja, sobre TODO el contenido acumulado hasta ese
     * instante. Con `React.memo` abajo, las burbujas que no cambian ya no
     * renderizan; con esto, la que sí cambia parsea una vez por token en vez de
     * una vez por render (que con los re-renders del store eran varias).
     *
     * Este proyecto NO tiene React Compiler instalado —no está
     * `babel-plugin-react-compiler` ni configurado en `vite.config.ts`—, así que
     * la memoización manual sigue siendo necesaria y no es ruido.
     */
    const partes = useMemo(() => parseMessageParts(message.content), [message.content]);

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
            marcarCopiado(true);
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
    const defaultColor = AGENT_HEX.custom; // latón (§2.8)
    const activeHexColor = agentColor || agent?.hexColor || defaultColor;
    // FASE 8 — el color que llega al DOM es var(--agent-…) con el hex de
    // respaldo: así la identidad sigue al tema (los AGENT_HEX medían
    // 2.2-2.6:1 sobre papel en tema claro). Ver lib/colorDeAgente.ts.
    const rolIdentidad = isUser ? 'user' : agent?.role;
    const colorIdentidad = colorDeAgente(rolIdentidad, activeHexColor);

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
                <div className="bg-surface-1 border border-stroke-edge text-content-muted text-xs px-4 py-2 rounded-md shadow-e2 max-w-[85%] text-left whitespace-pre-wrap">
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
            {/* 3.7 · §4.3 — a 390px el turno va a ANCHO COMPLETO: «no hay margen
                lateral que usar», y el nombre del director va sobre el turno.
                La columna de la placa (36px con su hueco) y el tope del 88% se
                comían 80 de los 390px de la pantalla y dejaban la medida en 26
                caracteres por línea, un tercio de lo que pide el contrato. La
                identidad no se pierde al esconder la placa: la llevan el filete
                de 2px del canto y el nombre en versalitas. */}
            <div className={cn(
                "flex gap-2 sm:gap-3 min-w-0",
                isUser ? "flex-row-reverse max-w-[92%] sm:max-w-[80%]" : "flex-row max-w-full sm:max-w-[80%]",
            )}>

                {/* Agent Avatar */}
                {!isUser && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                            "hidden sm:flex h-8 w-8 rounded-full items-center justify-center flex-shrink-0 border shadow-sm mt-1 bg-surface transition-colors duration-500 overflow-hidden",
                        )}
                        style={{ borderColor: colorDeAgenteAlpha(rolIdentidad, activeHexColor, 25) }}
                    >
                        <AvatarImage
                            src={sessionAvatar}
                            alt={agent?.name}
                            className="h-full w-full object-cover"
                            fallback={
                                agent
                                    ? <span className={cn("text-micro sm:text-xs font-bold", agent.color)}>{agent.avatar}</span>
                                    : <span className="text-micro sm:text-xs font-bold">S</span>
                            }
                        />
                    </motion.div>
                )}

                {/* User Avatar */}
                {isUser && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="hidden sm:flex h-8 w-8 rounded-full items-center justify-center flex-shrink-0 border border-agent-user/40 bg-agent-user/12 mt-1 overflow-hidden"
                    >
                        {/* `alt` en español: §11 «Un idioma». Decía "You". */}
                        <AvatarImage
                            src={userAvatar}
                            alt="Tú"
                            className="h-full w-full object-cover"
                            fallback={<span className="text-micro sm:text-xs font-semibold text-agent-user">S</span>}
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
                        /* 3.7 · §9.11 el Turno.
                           - **Sin pico.** `rounded-tl-sm`/`rounded-tr-sm` daban
                             la esquina achatada de la burbuja de mensajería;
                             §9.11 pide radio corto y uniforme, y §6 fija la
                             escala. Un turno de junta no es un bocadillo.
                           - **Sin resplandor.** Cada burbuja de agente llevaba
                             `0 0 20px <hex>10`, un glow que §0 rechaza por su
                             nombre. La sombra proyectada de e2 hace el trabajo.
                           - **Filete de identidad de 2px** en el canto: §2.8
                             dice que los hex de director no valen como texto,
                             así que la identidad va en el filete, y así es
                             donde por fin se lee quién habla sin leer el
                             nombre. */
                        "group relative p-3 sm:p-4 rounded-md shadow-e2 text-sm leading-relaxed border text-left",
                        isUser ? "border-e-2" : "border-s-2",
                        "min-w-[80px] max-w-full overflow-hidden",
                        /* Partir una palabra SÓLO si no cabe ni en una línea
                           entera — el caso de una URL larga, que es el motivo por
                           el que esto existe. La regla hermana que lo acompañaba
                           (la de `word-break`) es el alias antiguo de la variante
                           «anywhere» y además autoriza a partir palabras que sí
                           caben: dos declaraciones para un solo trabajo, y la
                           segunda más agresiva de lo que nadie quería. */
                        "[overflow-wrap:break-word]",
                        isUser
                            ? "bg-user-bubble/12 text-content"
                            : "bg-ai-bubble text-content-strong"
                    )}
                    /* El filete fino sigue siendo el del sistema; el del canto
                       lleva la identidad. El de la burbuja de usuario era
                       un hex de ocho dígitos escrito a pelo — el cian de la paleta
                       anterior, no el `--agent-user` de §2.8. */
                    style={isUser
                        ? { borderColor: colorDeAgenteAlpha('user', AGENT_HEX.user, 21), borderInlineEndColor: colorDeAgente('user', AGENT_HEX.user) }
                        : { borderColor: colorDeAgenteAlpha(rolIdentidad, activeHexColor, 21), borderInlineStartColor: colorIdentidad }
                    }
                >
                    {!isUser && (
                        <div
                            style={{ color: colorIdentidad }}
                            className="text-micro font-bold mb-1 uppercase flex items-center gap-1.5 transition-colors duration-(--duration-reveal)"
                        >
                            {/* F8 · §7.4 — este punto latía en TODAS las
                                burbujas de agente, para siempre: con seis
                                turnos, seis bucles perpetuos, y crecían con el
                                debate. §8.11 presupuesta UNO, el de quien está
                                hablando ahora mismo. */}
                            <span
                                className={cn(
                                    'h-1 w-1 rounded-full bg-current',
                                    isTyping && isLast && !reducido && 'punto-hablando',
                                )}
                            />
                            {agent ? agent.name.split(' ')[0] : (message.role && !['user', 'system'].includes(message.role) ? message.role : 'SPHERE')}
                            {message.isConclusion && (
                                <span className="px-1.5 py-0.5 rounded bg-current/10 text-current text-micro not-italic">
                                    · CONCLUSIÓN
                                </span>
                            )}
                        </div>
                    )}

                    {/* Línea de pensamiento (chain-of-thought) antes de la respuesta */}
                    {!isUser && (
                        <ThinkingBlock
                            thinking={message.thinking}
                            isStreaming={!!isTyping && !!isLast}
                            hasContent={!!message.content.trim()}
                            hexColor={colorIdentidad}
                            label={thinkingLabel}
                        />
                    )}

                    {/* 3.7 · §4.3 — la medida del transcript es la del
                        documento: `min(60ch, 100% - 32px)`. Antes esta línea
                        traía `max-w-none`, que anulaba la medida de
                        `.doc-prose` y dejaba que la burbuja se estirase a los
                        ~820px del contenedor: 100 y pico caracteres por línea,
                        el doble del techo de lectura cómoda. `--turno` baja un
                        peldaño la escala de encabezados, porque la de la hoja
                        está diseñada para la medida del documento y aquí, a 390px,
                        la columna real son ~250px. */}
                    <div className="doc-prose doc-prose--turno break-words">
                        {/* 4.7 · D21 — el parseo ya no vive aquí.
                            Eran ~180 líneas de regex y construcción de array
                            DENTRO del JSX, o sea rehechas en cada render: una
                            vez por token, por burbuja, sobre el contenido
                            completo acumulado. Ahora es `parseMessageParts`
                            (dato puro, con test propio) memoizado por
                            contenido, y aquí sólo queda el reparto a
                            componentes. */}
                        {partes.map((parte, i) => {
                            if (parte.tipo === 'texto') {
                                return (
                                    <ReactMarkdown
                                        key={`texto-${i}`}
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSanitize]}
                                        components={COMPONENTES_MARKDOWN}
                                    >
                                        {parte.texto}
                                    </ReactMarkdown>
                                );
                            }
                            if (parte.tipo === 'artefacto') {
                                const artifact = artifacts.find(a => a.id === parte.artifactId);
                                // Sin tarjeta si el artefacto no está en el
                                // store: es lo que hacía el código anterior y
                                // se conserva. Ocurre al recargar un hilo cuyo
                                // artefacto no se ha rehidratado todavía.
                                if (!artifact) return null;
                                return (
                                    <ArtifactCard
                                        key={`artifact-${parte.artifactId}`}
                                        content={artifact.content}
                                        language={artifact.language || ''}
                                        title={artifact.title}
                                        artifactId={parte.artifactId}
                                    />
                                );
                            }
                            return (
                                <ToolExecutionCard
                                    key={`tool-${i}-${parte.nombre}`}
                                    toolName={parte.nombre}
                                    status={parte.estado}
                                    result={parte.resultado}
                                    error={parte.error}
                                />
                            );
                        })}
                        {/* Cursor Fantasma */}
                        {isTyping && isLast && !isUser && (
                            <motion.span
                                animate={reducido ? { opacity: 1 } : { opacity: [1, 0] }}
                                transition={reducido ? { duration: 0 } : { repeat: Infinity, duration: 0.8 }}
                                className="inline-block w-1.5 h-4 ml-1 align-middle"
                                style={{ backgroundColor: colorIdentidad }}
                            />
                        )}
                    </div>

                    {/* 5.11 · Q12 — las versiones de un turno regenerado. Sólo
                        cuando las hay: una barra «v1 / v2» en cada burbuja
                        sería ruido en el 99% de los turnos. */}
                    {!isUser && message.versionesPrevias?.length ? (
                        <VersionesDelTurno
                            versiones={message.versionesPrevias}
                            actual={message.content}
                        />
                    ) : null}

                    {/* Pin indicator */}
                    {isPinned && (
                        <div className="flex items-center gap-1 mt-1">
                            <Pin className="h-3 w-3 text-warning" />
                            <span className="text-micro text-warning/70 uppercase">Anclado</span>
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
                                <VoteChip
                                    decision={message.vote.decision}
                                    confidence={message.vote.confidence}
                                />
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

/**
 * 4.7 · D21 — la burbuja que no cambia no se vuelve a pintar.
 *
 * El transcript entero se re-renderiza en cada token de streaming: `ChatPanel`
 * lee `messagesBySession` y el store fabrica un array nuevo por token, así que
 * el `.map()` produce elementos nuevos para las 100 burbujas aunque 99 sean
 * idénticas. Sin este `memo`, cada una de esas 99 volvía a montar su markdown,
 * su tabla, su resaltado y su parser.
 *
 * El comparador es explícito y NO es `shallow` a secas por dos motivos:
 *
 *  - `message` es un objeto nuevo por token SÓLO para la burbuja que recibe el
 *    token; para el resto, el store conserva la referencia (`m.id === id ? … :
 *    m`). Así que comparar `message` por referencia es exactamente lo correcto
 *    y no hace falta mirar dentro.
 *  - Los cuatro manejadores (`onPin`, `onRate`, `onRegenerate`, `onDelete`)
 *    LLEGAN NUEVOS en cada render de `ChatPanel` — son flechas escritas en el
 *    JSX. Compararlos por referencia dejaría el `memo` en decorado: no ahorraría
 *    ni un render. Se comparan por PRESENCIA (los hay o no los hay), que es lo
 *    único que cambia lo que se pinta: `onRegenerate` sólo se pasa a la última
 *    burbuja, y ese cambio sí se detecta.
 *
 * Ignorar la identidad de una función que sí cambió de comportamiento sería un
 * bug — pero aquí no puede pasar: las cuatro cierran sobre `msg.id`, que es lo
 * mismo que la identidad de `message`, ya comparada.
 */
export const MessageBubble = memo(MessageBubbleInterno, (antes, ahora) => (
    antes.message === ahora.message &&
    antes.agent === ahora.agent &&
    antes.agentColor === ahora.agentColor &&
    antes.sessionAvatar === ahora.sessionAvatar &&
    antes.isTyping === ahora.isTyping &&
    antes.isLast === ahora.isLast &&
    antes.searchQuery === ahora.searchQuery &&
    antes.isPinned === ahora.isPinned &&
    antes.rating === ahora.rating &&
    !!antes.onRegenerate === !!ahora.onRegenerate &&
    !!antes.onPin === !!ahora.onPin &&
    !!antes.onRate === !!ahora.onRate &&
    !!antes.onDelete === !!ahora.onDelete
));
