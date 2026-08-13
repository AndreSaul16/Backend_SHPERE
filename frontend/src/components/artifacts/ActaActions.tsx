import { useCallback, useMemo, useState } from "react";
import { FileText, Github, ExternalLink, Loader2, CheckCircle2, AlertCircle, Presentation } from "lucide-react";
import { claveDeActa, cargarHechos, guardarHechos } from "@/utils/actaPasos";
import { exportsService } from "@/services/api";
import { parseProximosPasos } from "@/utils/actaParser";
import { ActaPresentation } from "./ActaPresentation";
import { comboDe, useAtajo } from "@/hooks/useShortcuts";
import { InlineError } from "@/components/ui/InlineError";
import { motivoLegible } from "@/lib/errors";

interface ActaActionsProps {
    title: string;
    content: string;
}

type Status = "idle" | "loading" | "success" | "error";

const GH_REPO_STORAGE_KEY = "sphere_last_github_repo";

/**
 * D52 — lo que hay en `localStorage` no es de fiar.
 *
 * La versión anterior hacía `JSON.parse` y devolvía el resultado tal cual. El
 * `try/catch` sólo cubre el parseo: un valor sintácticamente válido pero de otra
 * forma —`null`, `42`, `"algo"`, un objeto con `owner: 123`— pasaba de largo y
 * llegaba a `ghRepo.owner.trim()`, que revienta con un TypeError y se lleva por
 * delante todo el panel de artefactos. Y no hace falta mala fe: basta con una
 * versión anterior del producto, o con otra pestaña escribiendo la misma clave.
 *
 * Un valor corrupto se trata como si no hubiera nada, que es exactamente lo que
 * significa.
 */
function loadLastRepo(): { owner: string; repo: string } {
    const vacio = { owner: "", repo: "" };
    try {
        const raw = localStorage.getItem(GH_REPO_STORAGE_KEY);
        if (!raw) return vacio;
        const valor: unknown = JSON.parse(raw);
        if (typeof valor !== "object" || valor === null) return vacio;
        const { owner, repo } = valor as Record<string, unknown>;
        if (typeof owner !== "string" || typeof repo !== "string") return vacio;
        return { owner, repo };
    } catch {
        return vacio;
    }
}

/**
 * Acciones sobre el acta del board (F2): enviarla a Notion o crear issues de
 * GitHub con los "Próximos pasos". Estados loading/éxito(link)/error inline.
 */
export function ActaActions({ title, content }: ActaActionsProps) {
    // Notion
    const [notionStatus, setNotionStatus] = useState<Status>("idle");
    const [notionUrl, setNotionUrl] = useState<string>("");
    const [notionError, setNotionError] = useState<string | undefined>(undefined);

    // GitHub
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [ghRepo, setGhRepo] = useState(loadLastRepo);
    const [ghStatus, setGhStatus] = useState<Status>("idle");
    const [ghCreated, setGhCreated] = useState<{ title: string; url: string }[]>([]);
    const [ghFailed, setGhFailed] = useState<{ title: string; error: string }[]>([]);
    const [ghError, setGhError] = useState<string | undefined>(undefined);

    // Q1 (5.8) — modo presentación. El estado vive aquí porque aquí está el
    // acta con su contenido, y porque `ActaActions` sólo se monta para actas.
    const [presentando, setPresentando] = useState(false);
    useAtajo(
        comboDe('presentacion'),
        useCallback(() => setPresentando(true), []),
    );

    // Q6 — los próximos pasos, marcables y con acción propia.
    const [pasoEnVuelo, setPasoEnVuelo] = useState<string | null>(null);
    const [pasoError, setPasoError] = useState<{ titulo: string; motivo: string } | null>(null);
    const [pasoCreado, setPasoCreado] = useState<{ titulo: string; url: string } | null>(null);

    /**
     * D52 — el acta se re-parseaba en CADA render, y este componente re-renderiza
     * con cada tecla de los campos owner/repo. Recorrer un acta de 3 KB línea a
     * línea para responder siempre lo mismo es trabajo tirado, y encima en el
     * hilo del teclado.
     */
    const parsedIssues = useMemo(() => parseProximosPasos(content), [content]);

    // La clave se deriva del acta, no del artefacto: el artefacto se re-crea con
    // un uuid nuevo en cada carga del historial y las marcas se perderían.
    const clavePasos = useMemo(
        () => claveDeActa(title, parsedIssues.map((i) => i.title)),
        [title, parsedIssues]
    );
    const [hechos, setHechos] = useState<Set<string>>(() => cargarHechos(clavePasos));
    // La clave cambia si cambia el acta: hay que traerse SUS marcas, no las de
    // la anterior. `useState` no se reinicializa solo al cambiar la clave.
    const [claveVista, setClaveVista] = useState(clavePasos);
    if (claveVista !== clavePasos) {
        setClaveVista(clavePasos);
        setHechos(cargarHechos(clavePasos));
    }

    const alternarPaso = (titulo: string) => {
        setHechos((previos) => {
            const siguiente = new Set(previos);
            if (siguiente.has(titulo)) siguiente.delete(titulo);
            else siguiente.add(titulo);
            guardarHechos(clavePasos, siguiente);
            return siguiente;
        });
    };

    /**
     * Un paso, un issue. La acción de fila no abre el volcado completo: crea
     * exactamente el que se está mirando, y al volver con su URL lo da por
     * hecho — que es lo que acaba de pasar.
     */
    const enviarPaso = async (issue: { title: string; body: string }) => {
        const owner = ghRepo.owner.trim();
        const repo = ghRepo.repo.trim();
        // Sin repositorio no hay adónde mandarlo: se pide, no se falla.
        if (!owner || !repo) {
            setShowGithubModal(true);
            return;
        }
        setPasoEnVuelo(issue.title);
        setPasoError(null);
        setPasoCreado(null);
        try {
            const { created, errors } = await exportsService.githubIssues(owner, repo, [issue]);
            const fallo = errors?.[0];
            if (fallo) {
                setPasoError({ titulo: issue.title, motivo: fallo.error });
            } else if (created[0]) {
                setPasoCreado({ titulo: issue.title, url: created[0].url });
                setHechos((previos) => {
                    const siguiente = new Set(previos).add(issue.title);
                    guardarHechos(clavePasos, siguiente);
                    return siguiente;
                });
            }
        } catch (e) {
            setPasoError({
                titulo: issue.title,
                motivo: e instanceof Error ? e.message : "No se pudo crear el issue",
            });
        } finally {
            setPasoEnVuelo(null);
        }
    };

    const handleNotion = async () => {
        setNotionStatus("loading");
        setNotionError(undefined);
        try {
            const { url } = await exportsService.notion(title, content);
            setNotionUrl(url);
            setNotionStatus("success");
        } catch (e) {
            // 6.14 · D64 · §11: el `e.message` crudo llegaba a pantalla («500
            // integrations.notion_error: …»). El título dice qué pasó, la
            // segunda frase qué se conserva —que aquí es lo importante: el acta
            // no se ha tocado— y el motivo del backend, si lo hay redactado, va
            // pequeño y debajo.
            setNotionError(motivoLegible(e));
            setNotionStatus("error");
        }
    };

    const handleGithubSubmit = async () => {
        if (!ghRepo.owner.trim() || !ghRepo.repo.trim()) return;
        setGhStatus("loading");
        setGhError(undefined);
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
            setGhError(motivoLegible(e));
            setGhStatus("error");
        }
    };

    return (
        <div className="border-b border-stroke-hairline bg-surface-1 px-4 py-3 space-y-2">
            <ActaPresentation
                open={presentando}
                onClose={() => setPresentando(false)}
                title={title}
                content={content}
            />
            <div className="flex flex-wrap items-center gap-2">
                {/* 5.8 · Q1 — presentar el acta. Va el PRIMERO de la fila: es
                    lo que el usuario hace con el acta más a menudo (enseñársela
                    a alguien), y hasta ahora exigía copiar el markdown a otra
                    herramienta. La tecla se enseña al lado, que es como se
                    descubre; el botón existe porque a 390px no hay tecla. */}
                <button
                    onClick={() => setPresentando(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-brass-600 bg-accent/12 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                >
                    <Presentation className="h-3 w-3" aria-hidden="true" />
                    Presentar
                    <kbd className="ms-1 hidden rounded-xs border border-stroke-control px-1 font-mono text-micro text-content-muted sm:inline">
                        P
                    </kbd>
                </button>

                {/* Notion */}
                <button
                    onClick={handleNotion}
                    disabled={notionStatus === "loading"}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-highlight hover:bg-electric-cyan/10 text-content-muted hover:text-electric-cyan border border-transparent hover:border-electric-cyan/20 transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-highlight hover:bg-luxury-purple/10 text-content-muted hover:text-luxury-purple border border-transparent hover:border-luxury-purple/20 transition-colors"
                >
                    <Github className="h-3 w-3" />
                    Crear issues en GitHub
                    {parsedIssues.length > 0 && (
                        <span className="ml-1 rounded-full bg-luxury-purple/20 px-1.5 text-micro font-bold text-luxury-purple">
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
                    className="flex items-center gap-1.5 text-xs text-success hover:underline"
                >
                    <CheckCircle2 className="h-3 w-3" />
                    Página creada en Notion <ExternalLink className="h-3 w-3" />
                </a>
            )}
            {notionStatus === "error" && (
                <InlineError
                    title="No se ha podido crear la página en Notion"
                    detail="El acta sigue aquí, entera y sin tocar. Comprueba que la conexión con Notion sigue activa en Ajustes › Conexiones y vuelve a intentarlo."
                    reason={notionError}
                    onRetry={() => { void handleNotion(); }}
                    retryLabel="Volver a exportar"
                />
            )}

            {/* Q6 — los próximos pasos, marcables y con acción propia.

                Un acta que no deja marcar lo hecho no es un acta: es un texto.
                Antes esta lista sólo existía dentro del volcado a GitHub; ahora
                es la lista, con su estado y con la acción de fila que crea UN
                issue —el de esa línea— en vez de los seis de golpe.

                Casillas de verdad (`input type="checkbox"` con su `<label>`), no
                divs con un glifo: el estado marcado tiene que existir también
                para quien navega con teclado o con lector. */}
            {parsedIssues.length > 0 && (
                <section className="mt-3 space-y-2" aria-labelledby="acta-pasos-titulo">
                    <div className="flex items-baseline justify-between gap-2">
                        <h4 id="acta-pasos-titulo" className="text-micro font-sans uppercase text-content-quiet">
                            Próximos pasos
                        </h4>
                        <p className="text-micro font-sans tabular-nums text-content-quiet">
                            {hechos.size} de {parsedIssues.length} hechos
                        </p>
                    </div>

                    <ul className="space-y-1">
                        {parsedIssues.map((issue) => {
                            const hecho = hechos.has(issue.title);
                            const enVuelo = pasoEnVuelo === issue.title;
                            return (
                                <li
                                    key={issue.title}
                                    data-row-actions
                                    className="group flex items-start gap-2 rounded-sm px-1.5 py-1 hover:bg-stroke-hairline"
                                >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                                        <input
                                            type="checkbox"
                                            checked={hecho}
                                            onChange={() => alternarPaso(issue.title)}
                                            className="mt-0.5 h-4 w-4 shrink-0 accent-accent-fill"
                                        />
                                        <span
                                            className={
                                                hecho
                                                    ? "min-w-0 text-xs text-content-quiet line-through"
                                                    : "min-w-0 text-xs text-content"
                                            }
                                        >
                                            {issue.title}
                                        </span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => enviarPaso(issue)}
                                        disabled={enVuelo}
                                        aria-label={`Crear issue en GitHub para «${issue.title}»`}
                                        className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-micro font-sans uppercase text-content-muted transition-colors hover:bg-stroke-highlight hover:text-accent disabled:opacity-50"
                                    >
                                        {enVuelo ? (
                                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Github className="h-3 w-3" aria-hidden="true" />
                                        )}
                                        GitHub
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {/* §11: éxito en pasado, corto, y con el objeto nombrado. */}
                    {pasoCreado && (
                        <a
                            href={pasoCreado.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-success hover:underline"
                        >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Issue creado para «{pasoCreado.titulo}» <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                    )}
                    {pasoError && (
                        <p role="alert" className="flex items-start gap-1.5 text-xs text-dissent">
                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            No se pudo crear el issue de «{pasoError.titulo}». {pasoError.motivo}
                        </p>
                    )}
                </section>
            )}

            {/* Modal GitHub (inline, minimal) */}
            {showGithubModal && (
                <div
                    role="group"
                    aria-label="Crear issues en GitHub"
                    className="mt-2 rounded-xl border border-surface-highlight bg-surface/60 p-3 space-y-3"
                >
                    {parsedIssues.length === 0 ? (
                        <p className="text-xs text-warning">
                            No se encontró la sección "Próximos pasos" con acciones en el acta.
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-content-muted">
                                Se crearán {parsedIssues.length} issues en el repositorio indicado.
                            </p>

                            {/* AD-004 — lo que se aprueba son estos títulos, no su número.

                                Salen del MISMO `parsedIssues` que el recuento de arriba y
                                que la lista marcable de la sección: un solo array, así que
                                el número anunciado no puede divergir de lo que se lista.

                                Y se listan TODOS. Nada de «y N más»: lo que no se ve es
                                exactamente lo que nadie ha aprobado, y esto acaba en el
                                repositorio de un cliente. Si la lista es larga, se recorre
                                con scroll, que sigue dejándola entera. */}
                            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                                {parsedIssues.map((issue) => (
                                    <li
                                        key={issue.title}
                                        className="truncate text-xs text-content"
                                        title={issue.title}
                                    >
                                        {issue.title}
                                    </li>
                                ))}
                            </ul>

                            <div className="flex gap-2">
                                <input
                                    aria-label="owner"
                                    placeholder="owner"
                                    value={ghRepo.owner}
                                    onChange={(e) => setGhRepo((r) => ({ ...r, owner: e.target.value }))}
                                    className="flex-1 min-w-0 bg-midnight border border-surface-highlight rounded-lg px-2.5 py-1.5 text-xs text-content-strong focus:border-luxury-purple/50"
                                />
                                <input
                                    aria-label="repo"
                                    placeholder="repo"
                                    value={ghRepo.repo}
                                    onChange={(e) => setGhRepo((r) => ({ ...r, repo: e.target.value }))}
                                    className="flex-1 min-w-0 bg-midnight border border-surface-highlight rounded-lg px-2.5 py-1.5 text-xs text-content-strong focus:border-luxury-purple/50"
                                />
                            </div>
                            <button
                                onClick={handleGithubSubmit}
                                disabled={ghStatus === "loading" || !ghRepo.owner.trim() || !ghRepo.repo.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold bg-luxury-purple/20 hover:bg-luxury-purple/30 text-luxury-purple transition-colors disabled:opacity-40"
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
                                    className="flex items-center gap-1.5 text-xs text-success hover:underline"
                                >
                                    <CheckCircle2 className="h-3 w-3" /> {c.title} <ExternalLink className="h-3 w-3" />
                                </a>
                            ))}
                            {/* Éxito parcial: mostrar también los que fallaron para
                                no dar por creados items de acción que se perdieron. */}
                            {ghFailed.map((f, i) => (
                                <p key={`err-${i}`} className="flex items-center gap-1.5 text-xs text-agent-devil">
                                    <AlertCircle className="h-3 w-3" /> {f.title}: {f.error}
                                </p>
                            ))}
                        </div>
                    )}
                    {ghStatus === "error" && (
                        <InlineError
                            title="No se ha podido crear ninguna incidencia"
                            detail="No se ha creado nada a medias en el repositorio, y los próximos pasos del acta siguen tal cual. Comprueba el propietario y el repositorio, y que la conexión con GitHub siga activa."
                            reason={ghError}
                            onRetry={() => { void handleGithubSubmit(); }}
                            retryLabel="Volver a crearlas"
                        />
                    )}
                </div>
            )}
        </div>
    );
}
