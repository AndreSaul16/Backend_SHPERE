import { useState } from "react";
import { FileText, Github, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { exportsService } from "@/services/api";
import { parseProximosPasos } from "@/utils/actaParser";

interface ActaActionsProps {
    title: string;
    content: string;
}

type Status = "idle" | "loading" | "success" | "error";

const GH_REPO_STORAGE_KEY = "sphere_last_github_repo";

function loadLastRepo(): { owner: string; repo: string } {
    try {
        const raw = localStorage.getItem(GH_REPO_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return { owner: "", repo: "" };
}

/**
 * Acciones sobre el acta del board (F2): enviarla a Notion o crear issues de
 * GitHub con los "Próximos pasos". Estados loading/éxito(link)/error inline.
 */
export function ActaActions({ title, content }: ActaActionsProps) {
    // Notion
    const [notionStatus, setNotionStatus] = useState<Status>("idle");
    const [notionUrl, setNotionUrl] = useState<string>("");
    const [notionError, setNotionError] = useState<string>("");

    // GitHub
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [ghRepo, setGhRepo] = useState(loadLastRepo);
    const [ghStatus, setGhStatus] = useState<Status>("idle");
    const [ghCreated, setGhCreated] = useState<{ title: string; url: string }[]>([]);
    const [ghFailed, setGhFailed] = useState<{ title: string; error: string }[]>([]);
    const [ghError, setGhError] = useState<string>("");

    const parsedIssues = parseProximosPasos(content);

    const handleNotion = async () => {
        setNotionStatus("loading");
        setNotionError("");
        try {
            const { url } = await exportsService.notion(title, content);
            setNotionUrl(url);
            setNotionStatus("success");
        } catch (e) {
            setNotionError(e instanceof Error ? e.message : "Error al exportar a Notion");
            setNotionStatus("error");
        }
    };

    const handleGithubSubmit = async () => {
        if (!ghRepo.owner.trim() || !ghRepo.repo.trim()) return;
        setGhStatus("loading");
        setGhError("");
        try {
            localStorage.setItem(GH_REPO_STORAGE_KEY, JSON.stringify(ghRepo));
            const { created, errors } = await exportsService.githubIssues(
                ghRepo.owner.trim(),
                ghRepo.repo.trim(),
                parsedIssues
            );
            setGhCreated(created);
            setGhFailed(errors || []);
            setGhStatus("success");
        } catch (e) {
            setGhError(e instanceof Error ? e.message : "Error al crear issues");
            setGhStatus("error");
        }
    };

    return (
        <div className="border-b border-white/5 bg-white/[0.02] px-4 py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {/* Notion */}
                <button
                    onClick={handleNotion}
                    disabled={notionStatus === "loading"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-highlight hover:bg-electric-cyan/10 text-text-secondary hover:text-electric-cyan border border-transparent hover:border-electric-cyan/20 transition-colors disabled:opacity-50"
                >
                    {notionStatus === "loading" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                        <FileText className="h-3 w-3" />
                    )}
                    Enviar a Notion
                </button>

                {/* GitHub */}
                <button
                    onClick={() => setShowGithubModal((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-surface-highlight hover:bg-luxury-purple/10 text-text-secondary hover:text-luxury-purple border border-transparent hover:border-luxury-purple/20 transition-colors"
                >
                    <Github className="h-3 w-3" />
                    Crear issues en GitHub
                    {parsedIssues.length > 0 && (
                        <span className="ml-1 rounded-full bg-luxury-purple/20 px-1.5 text-[9px] font-bold text-luxury-purple">
                            {parsedIssues.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Estado Notion inline */}
            {notionStatus === "success" && (
                <a
                    href={notionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
                >
                    <CheckCircle2 className="h-3 w-3" />
                    Página creada en Notion <ExternalLink className="h-3 w-3" />
                </a>
            )}
            {notionStatus === "error" && (
                <p className="flex items-center gap-1.5 text-[11px] text-rose-400">
                    <AlertCircle className="h-3 w-3" /> {notionError}
                </p>
            )}

            {/* Modal GitHub (inline, minimal) */}
            {showGithubModal && (
                <div className="mt-2 rounded-xl border border-surface-highlight bg-surface/60 p-3 space-y-3">
                    {parsedIssues.length === 0 ? (
                        <p className="text-[11px] text-amber-400">
                            No se encontró la sección "Próximos pasos" con acciones en el acta.
                        </p>
                    ) : (
                        <>
                            <p className="text-[11px] text-text-secondary">
                                Se crearán {parsedIssues.length} issues en el repositorio indicado.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    aria-label="owner"
                                    placeholder="owner"
                                    value={ghRepo.owner}
                                    onChange={(e) => setGhRepo((r) => ({ ...r, owner: e.target.value }))}
                                    className="flex-1 min-w-0 bg-midnight border border-surface-highlight rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-luxury-purple/50"
                                />
                                <input
                                    aria-label="repo"
                                    placeholder="repo"
                                    value={ghRepo.repo}
                                    onChange={(e) => setGhRepo((r) => ({ ...r, repo: e.target.value }))}
                                    className="flex-1 min-w-0 bg-midnight border border-surface-highlight rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-luxury-purple/50"
                                />
                            </div>
                            <button
                                onClick={handleGithubSubmit}
                                disabled={ghStatus === "loading" || !ghRepo.owner.trim() || !ghRepo.repo.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-luxury-purple/20 hover:bg-luxury-purple/30 text-luxury-purple transition-colors disabled:opacity-40"
                            >
                                {ghStatus === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
                                Crear issues
                            </button>
                        </>
                    )}

                    {ghStatus === "success" && (
                        <div className="space-y-1">
                            {ghCreated.map((c) => (
                                <a
                                    key={c.url}
                                    href={c.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
                                >
                                    <CheckCircle2 className="h-3 w-3" /> {c.title} <ExternalLink className="h-3 w-3" />
                                </a>
                            ))}
                            {/* Éxito parcial: mostrar también los que fallaron para
                                no dar por creados items de acción que se perdieron. */}
                            {ghFailed.map((f, i) => (
                                <p key={`err-${i}`} className="flex items-center gap-1.5 text-[11px] text-rose-400">
                                    <AlertCircle className="h-3 w-3" /> {f.title}: {f.error}
                                </p>
                            ))}
                        </div>
                    )}
                    {ghStatus === "error" && (
                        <p className="flex items-center gap-1.5 text-[11px] text-rose-400">
                            <AlertCircle className="h-3 w-3" /> {ghError}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
