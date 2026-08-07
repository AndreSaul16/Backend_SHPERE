import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { AlertCircle, RefreshCw } from "lucide-react";
import { chatService } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonStyles";
import type { SharedSession } from "@/types";

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

    useEffect(() => {
        if (!token) return;
        let active = true;
        setState({ status: 'loading' });

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
                        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-content-strong">
                            {state.data.title}
                        </h1>
                        <div className="space-y-5">
                            {state.data.messages.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={
                                        m.role === "user"
                                            ? "ms-auto max-w-[85%] rounded-md border-s-2 border-agent-user bg-agent-user/12 px-4 py-3"
                                            : "me-auto max-w-[90%] rounded-md border border-stroke-edge bg-surface-2 px-4 py-3"
                                    }
                                >
                                    {m.role === "assistant" && m.agent_role && (
                                        <p className="mb-1.5 text-micro font-semibold uppercase text-content-muted">
                                            {m.agent_role}
                                        </p>
                                    )}
                                    <div className="doc-prose max-w-none break-words">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                                            {m.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {state.data.messages.length === 0 && (
                                <p className="py-8 text-center text-sm text-content-muted">
                                    Esta conversación aún no tiene mensajes.
                                </p>
                            )}
                        </div>

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
