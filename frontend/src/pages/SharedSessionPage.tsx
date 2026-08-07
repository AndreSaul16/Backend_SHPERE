import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { chatService } from "@/services/api";
import type { SharedSession } from "@/types";

/**
 * Vista PÚBLICA read-only de una conversación compartida.
 * No usa stores ni requiere autenticación: sólo renderiza los mensajes
 * saneados que devuelve el backend en /sessions/share/:token.
 */
export function SharedSessionPage() {
    const { token } = useParams<{ token: string }>();
    const [data, setData] = useState<SharedSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        if (!token) return;
        setLoading(true);
        chatService
            .getSharedSession(token)
            .then((res) => {
                if (active) setData(res);
            })
            .catch(() => {
                if (active) setError("Esta conversación no está disponible o dejó de compartirse.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [token]);

    return (
        <div className="min-h-screen bg-midnight text-content-strong">
            {/* Banner de origen */}
            <div className="sticky top-0 z-10 border-b border-surface-highlight bg-midnight/90 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold tracking-tight">
                    Conversación compartida desde <span className="text-electric-cyan">SPHERE</span>
                </span>
                <Link
                    to="/register"
                    className="shrink-0 rounded-xl bg-electric-cyan/10 border border-electric-cyan/30 px-3 py-1.5 text-xs font-bold text-electric-cyan hover:bg-electric-cyan/20 transition-colors"
                >
                    Crear cuenta gratis
                </Link>
            </div>

            <div className="mx-auto max-w-3xl px-4 py-8">
                {loading && (
                    <p className="text-center text-content-muted text-sm py-16">Cargando conversación…</p>
                )}

                {!loading && error && (
                    <div className="text-center py-16 space-y-4">
                        <p className="text-content-muted text-sm">{error}</p>
                        <Link to="/register" className="text-electric-cyan text-sm font-semibold hover:underline">
                            Descubre SPHERE
                        </Link>
                    </div>
                )}

                {!loading && !error && data && (
                    <>
                        <h1 className="text-2xl font-bold tracking-tight mb-6">{data.title}</h1>
                        <div className="space-y-5">
                            {data.messages.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={
                                        m.role === "user"
                                            ? "ml-auto max-w-[85%] rounded-2xl bg-electric-cyan/10 border border-electric-cyan/20 px-4 py-3"
                                            : "mr-auto max-w-[90%] rounded-2xl bg-surface border border-surface-highlight px-4 py-3"
                                    }
                                >
                                    {m.role === "assistant" && m.agent_role && (
                                        <p className="text-micro font-bold uppercase text-content-quiet mb-1.5">
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
                            {data.messages.length === 0 && (
                                <p className="text-center text-content-muted text-sm py-8">
                                    Esta conversación aún no tiene mensajes.
                                </p>
                            )}
                        </div>

                        {/* CTA a registro */}
                        <div className="mt-12 rounded-2xl border border-surface-highlight bg-surface/50 p-6 text-center space-y-3">
                            <p className="text-sm text-content-muted">
                                Crea tu propio consejo de directores con IA.
                            </p>
                            <Link
                                to="/register"
                                className="inline-block rounded-xl bg-electric-cyan px-5 py-2.5 text-sm font-bold text-midnight hover:bg-electric-cyan/90 transition-colors"
                            >
                                Empezar gratis en SPHERE
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
