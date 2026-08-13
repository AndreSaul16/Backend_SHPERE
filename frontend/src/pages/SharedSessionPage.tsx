import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { AlertCircle, RefreshCw } from "lucide-react";
import { chatService } from "@/services/api";
import { DocTable } from "@/components/shared/DocTable";
import { VoteChip } from "@/components/chat/VoteChip";
import { AGENT_HEX } from "@/store/useChatStore";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonStyles";
import type { SharedMessage, SharedSession } from "@/types";

/**
 * Vista PÚBLICA read-only de una conversación compartida.
 * No usa stores ni requiere autenticación: sólo renderiza los mensajes
 * saneados que devuelve el backend en /sessions/share/:token.
 *
 * Es la única superficie pública del producto y su canal de adquisición, así
 * que su peor estado no puede ser una espera infinita: si el backend no
 * responde —red caída, o simplemente lento— la página se quedaba en «Cargando
 * conversación…» PARA SIEMPRE, sin mensaje y sin reintento. El 404 sí resolvía
 * bien; el que faltaba era el fallo de red.
 *
 * Ahora hay tres desenlaces y ninguno es el vacío:
 *   - `gone`   → el enlace no existe o dejó de compartirse (404/410). Sin
 *                reintento, porque reintentar no lo va a arreglar.
 *   - `failed` → red, timeout o error del servidor. CON reintento.
 *   - datos    → la conversación.
 */

/** Techo de espera. Pasado esto, la petición se aborta y sale el error. */
const TIMEOUT_MS = 15_000;

type LoadState =
    | { status: 'loading' }
    | { status: 'ok'; data: SharedSession }
    | { status: 'gone' }
    | { status: 'failed' };

export function SharedSessionPage() {
    const { token } = useParams<{ token: string }>();
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    // Cambia en cada «Reintentar»: es lo que vuelve a disparar el efecto.
    const [attempt, setAttempt] = useState(0);

    const retry = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt((n) => n + 1);
    }, []);

    /*
     * D43 · 7.4 — el `setState({ status: 'loading' })` estaba DENTRO del
     * efecto (`react-hooks/set-state-in-effect`). Sobraba en el caso normal
     * —el estado inicial ya es «cargando» y `retry` también lo pone— y en el
     * único caso en que hacía falta, cambiar de enlace compartido sin
     * desmontar la página, llegaba tarde: el render intermedio enseñaba el
     * acta ANTERIOR mientras se pedía la nueva. Ajustado durante el render,
     * React descarta ese render y no llega a pintarse.
     */
    const [tokenAnterior, setTokenAnterior] = useState(token);
    if (tokenAnterior !== token) {
        setTokenAnterior(token);
        setState({ status: 'loading' });
    }

    useEffect(() => {
        if (!token) return;
        let active = true;

        // El timeout no es cosmético: sin él, una conexión que ni responde ni
        // falla (backend colgado, red muerta) deja la promesa pendiente y la
        // página en «Cargando…» indefinidamente. Fetch no tiene plazo propio.
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            if (active) setState({ status: 'failed' });
        }, TIMEOUT_MS);

        chatService
            .getSharedSession(token)
            .then((res) => {
                if (!active || timedOut) return;
                setState({ status: 'ok', data: res });
            })
            .catch((err: unknown) => {
                if (!active || timedOut) return;
                // Un 404/410 es un enlace muerto: es información, no un fallo
                // transitorio, y reintentarlo sólo gastaría el tiempo del
                // visitante. Cualquier otra cosa —red, 5xx, CORS— sí se
                // reintenta.
                const message = err instanceof Error ? err.message : '';
                setState(/\b(404|410)\b/.test(message) ? { status: 'gone' } : { status: 'failed' });
            })
            .finally(() => clearTimeout(timer));

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [token, attempt]);

    /**
     * Tarea 2.4 — el `<title>` nombra la junta.
     *
     * Esta es la única superficie pública del producto: el título es lo que se
     * ve en la pestaña, en el historial del navegador y en un marcador. Decía
     * «SPHERE — Tu consejo de dirección» para todas las conversaciones
     * compartidas del mundo.
     *
     * Las metas de Open Graph NO se tocan desde aquí y no es un olvido: un
     * crawler no ejecuta JavaScript, así que una SPA no puede darle la vista
     * previa por sesión. Eso necesita que el backend sirva el HTML de
     * `/share/:token` con las metas ya puestas — tarea de backend, apuntada en
     * el plan. Las metas genéricas de producto ya están en `index.html`.
     */
    useEffect(() => {
        const anterior = document.title;
        if (state.status === 'ok') document.title = `${state.data.title} · SPHERE`;
        else if (state.status === 'gone') document.title = 'Enlace no disponible · SPHERE';
        return () => { document.title = anterior; };
    }, [state]);

    return (
        <div className="min-h-dvh bg-surface-0 text-content">
            {/* Banner de origen */}
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stroke-hairline bg-surface-1 px-4 py-3">
                <span className="min-w-0 text-xs font-semibold tracking-tight sm:text-sm">
                    Conversación compartida desde <span className="text-accent">SPHERE</span>
                </span>
                <Link to="/register" className={buttonClass({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}>
                    Crear cuenta gratis
                </Link>
            </header>

            <div className="mx-auto max-w-3xl px-4 py-8">
                {state.status === 'loading' && <SharedSkeleton />}

                {state.status === 'gone' && (
                    <SharedNotice
                        title="Este enlace ya no está disponible"
                        body="La conversación no existe o su autor dejó de compartirla."
                    >
                        <Link to="/register" className={buttonClass({ variant: 'primary' })}>
                            Descubre SPHERE
                        </Link>
                    </SharedNotice>
                )}

                {state.status === 'failed' && (
                    <SharedNotice
                        title="No hemos podido cargar la conversación"
                        body="El servidor no ha respondido a tiempo. Puede ser una caída pasajera de tu conexión."
                    >
                        <Button variant="primary" onClick={retry}>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Reintentar
                        </Button>
                        <Link to="/register" className={buttonClass({ variant: 'secondary' })}>
                            Descubre SPHERE
                        </Link>
                    </SharedNotice>
                )}

                {state.status === 'ok' && (
                    <>
                        {/* La constancia se lee sobre papel (§P1, §5.3). Esta es
                            la única pantalla del producto que ve alguien que no
                            ha entrado nunca: si la junta deja acta, lo que hay
                            que enseñar es el acta, no un chat. La hoja re-mapea
                            el contexto de variables, así que todo lo que se
                            pinte dentro —placas, chips, citas— sale en la rama
                            clara sin repintarlo elemento a elemento. */}
                        <article className="acta-sheet p-5 sm:p-8">
                            <h1 className="mb-6 text-2xl font-serif font-semibold tracking-tight text-content-strong">
                                {state.data.title}
                            </h1>
                            <div className="space-y-5">
                                {state.data.messages.map((m, idx) => (
                                    <SharedTurn key={idx} message={m} />
                                ))}
                                {state.data.messages.length === 0 && (
                                    <p className="py-8 text-center text-sm text-content-muted">
                                        Esta conversación aún no tiene mensajes.
                                    </p>
                                )}
                            </div>
                        </article>

                        {/* CTA a registro */}
                        <div className="mt-12 space-y-3 rounded-md border border-stroke-edge bg-surface-2 p-6 text-center">
                            <p className="text-sm text-content-muted">
                                Crea tu propia junta directiva con IA.
                            </p>
                            <Link to="/register" className={buttonClass({ variant: 'primary' })}>
                                Empezar gratis en SPHERE
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Un turno de la conversación compartida.
 *
 * Tarea 2.4: «placas con identidad y votos». Los cinco directores tienen color
 * propio (§2.8) y aquí se usa — la placa lleva su filete y su nombre— y el voto
 * se cuenta con el mismo chip que el transcript del producto (§P2: el disenso
 * es la señal). Sin identidad ni voto, esta pantalla enseña cinco párrafos
 * iguales y el visitante no ve lo único que la junta aporta: quién dijo qué y
 * con cuánta confianza.
 */
function SharedTurn({ message }: { message: SharedMessage }) {
    const esUsuario = message.role === 'user';
    const rol = (message.agent_role ?? '').toUpperCase();
    // El hex sale del catálogo del store, nunca escrito a mano (§13.1).
    const identidad =
        rol in AGENT_HEX ? AGENT_HEX[rol as keyof typeof AGENT_HEX] : AGENT_HEX.custom;

    return (
        <div
            className={
                esUsuario
                    ? 'ms-auto max-w-[85%] rounded-md border-s-2 bg-surface-inset px-4 py-3'
                    : 'me-auto max-w-[95%] rounded-md border-s-2 px-4 py-3'
            }
            // §9.11: filete de identidad de 2px al margen del turno, no un
            // relleno de color — sobre papel, un lavado del color de agente no
            // llegaría al contraste que pide §12.
            style={{ borderInlineStartColor: esUsuario ? AGENT_HEX.user : identidad }}
        >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {/* El nombre va en grafito y NO en el color del director: los
                    hex de §2.8 están calculados contra el paño (7,3-8,4:1) y
                    sobre papel se quedan en 2,5:1, por debajo del mínimo de §12.
                    La identidad la porta el filete, que es un elemento gráfico
                    redundante con el nombre escrito (§P5). */}
                <span className="text-micro font-sans font-semibold uppercase text-content-muted">
                    {esUsuario ? 'Consulta' : message.agent_role || 'Junta'}
                </span>
                {message.board_vote?.decision && (
                    <VoteChip
                        decision={message.board_vote.decision}
                        confidence={message.board_vote.confidence}
                    />
                )}
            </div>
            <div className="doc-prose doc-prose--turno max-w-none break-words">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{ table: DocTable }}
                >
                    {message.content}
                </ReactMarkdown>
            </div>
        </div>
    );
}

/**
 * §9.14 estado de error: glifo de línea, título que dice qué falta, una frase
 * que dice qué hacer y las acciones. Nunca un hueco en blanco.
 */
function SharedNotice({
    title,
    body,
    children,
}: {
    title: string;
    body: string;
    children: React.ReactNode;
}) {
    return (
        <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-dissent" aria-hidden="true" />
            <div className="space-y-1">
                <h1 className="text-lg font-semibold text-content-strong">{title}</h1>
                <p className="mx-auto max-w-sm text-xs text-content-muted">{body}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
        </div>
    );
}

/**
 * §9.12: la forma del contenido SÍ se conoce (título + turnos), así que
 * esqueleto y no spinner, y con altura parecida para que no salte el layout.
 */
function SharedSkeleton() {
    return (
        <div aria-busy="true" className="space-y-5">
            <p role="status" className="sr-only">Cargando la conversación…</p>
            <SkeletonBlock className="h-7 w-2/3" />
            <SkeletonBlock className="ms-auto h-20 w-[85%]" />
            <SkeletonBlock className="me-auto h-32 w-[90%]" />
            <SkeletonBlock className="me-auto h-24 w-[90%]" />
        </div>
    );
}

function SkeletonBlock({ className }: { className: string }) {
    return (
        <span
            aria-hidden="true"
            className={`block overflow-hidden rounded-xs bg-surface-2 ${className}`}
        >
            <span className="block h-full w-full bg-stroke-hairline animate-(--animate-sweep) motion-reduce:animate-none" />
        </span>
    );
}
