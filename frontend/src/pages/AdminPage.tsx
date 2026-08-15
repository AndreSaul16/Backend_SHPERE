/**
 * Panel de administración (F4 + F5).
 * Solo accesible para emails admin: si el backend devuelve 403 muestra "Sin acceso".
 *
 * **6.9 — los tres arreglos.**
 *
 * 1. **La lista de usuarios era una pila de botones**, no una tabla: cuatro
 *    datos por usuario (correo, plan, saldo de plan, saldo comprado) metidos en
 *    una línea de texto con dos puntos y separadores de punto medio. Sin
 *    encabezados, sin poder ordenar y sin forma de comparar dos filas. Ahora es
 *    una `<table>` de verdad, con `<caption>`, `scope="col"`/`scope="row"` y
 *    `aria-sort` en la columna por la que se está ordenando (§9.7, §12.12).
 * 2. **Mover créditos no pedía confirmación.** «Aplicar» movía el saldo real de
 *    la cuenta de otra persona, con una sola pulsación y sin decir de cuánto a
 *    cuánto. Ahora pasa por `ConfirmDialog` y el diálogo dice el saldo de
 *    partida, el movimiento y el saldo resultante.
 * 3. **La guarda de rol era un callejón sin salida, y encima cobraba.** Visto
 *    en el navegador: entrar a `/admin` con una cuenta normal pintaba «Sin
 *    acceso» **y sobre ella el muro «Te has quedado sin créditos»**. La causa
 *    es que la página disparaba `adminService.users()` —una acción deliberada,
 *    que por contrato SÍ avisa al manejador global— antes de saber si esta
 *    cuenta tiene panel; y ese 403 se traduce a `perm.plan_not_allowed` →
 *    `openPaywall`. Arreglar la sonda de la barra lateral (F1) no cubría esto:
 *    la ruta sigue siendo alcanzable escribiendo la URL.
 *
 *    La guarda va ahora ANTES de la primera llamada, con la sonda que no tiene
 *    efectos globales (`useEsAdmin`). Cuesta una petición de más para el
 *    administrador de verdad, y a cambio ningún usuario normal ve un muro de
 *    pago por escribir `/admin`. Además la negativa ofrece una salida: antes
 *    era el mensaje y nada más.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import type { TransaccionAPI } from "@/types/api";
import { Loader2, Search, ShieldAlert, Users, BarChart3, ArrowUpDown, Home } from "lucide-react";
import {
    adminService,
    type AdminUser,
    type AdminMetrics,
} from "@/services/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RUTA_DE_INICIO } from "@/lib/rutas";
import { useEsAdminConEspera } from "@/hooks/useEsAdmin";
import { cn } from "@/lib/utils";

type Tab = "users" | "metrics";

/** Columnas ordenables de la tabla de usuarios. */
type ClaveDeOrden = "email" | "plan" | "pro_messages_balance" | "topup_messages_balance";
type Sentido = "asc" | "desc";

const COLUMNAS: { clave: ClaveDeOrden; rotulo: string; numerica?: boolean }[] = [
    { clave: "email", rotulo: "Usuario" },
    { clave: "plan", rotulo: "Plan" },
    { clave: "pro_messages_balance", rotulo: "Créditos del plan", numerica: true },
    { clave: "topup_messages_balance", rotulo: "Comprados", numerica: true },
];

/**
 * ¿Es esto una negativa del backend?
 *
 * Se miraba `e.message.includes("403")`, que depende de que `api.ts` siga
 * metiendo el estado en el texto. Se comprueban las dos formas para que un
 * cambio de redacción no convierta un «no eres admin» en una pantalla en blanco.
 */
function esDenegado(e: unknown): boolean {
    if (typeof e === "object" && e !== null && "status" in e) {
        return (e as { status?: number }).status === 403;
    }
    return e instanceof Error && /\b403\b/.test(e.message);
}

export function AdminPage() {
    /* `undefined` mientras la sonda contesta: sin este tercer estado, la
       pantalla parpadeaba «Sin acceso» durante un instante a los que SÍ lo
       tienen. */
    const permiso = useEsAdminConEspera();
    const [denied, setDenied] = useState(false);
    const [tab, setTab] = useState<Tab>("users");

    // Usuarios
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [query, setQuery] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [selected, setSelected] = useState<AdminUser | null>(null);
    const [txs, setTxs] = useState<TransaccionAPI[]>([]);

    // Orden de la tabla
    const [orden, setOrden] = useState<{ clave: ClaveDeOrden; sentido: Sentido }>({
        clave: "email",
        sentido: "asc",
    });

    // Ajuste
    const [adjustDelta, setAdjustDelta] = useState<number>(0);
    const [adjustReason, setAdjustReason] = useState("");
    const [adjusting, setAdjusting] = useState(false);
    // 6.9: mover el saldo de otra persona exige confirmar. El diálogo no vive
    // en el manejador para que el resumen («de 10 a 25») se calcule al pintarlo.
    const [confirmandoAjuste, setConfirmandoAjuste] = useState(false);

    // Métricas
    const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

    const loadUsers = useCallback(async (q?: string) => {
        setLoadingUsers(true);
        try {
            setUsers(await adminService.users(q));
        } catch (e) {
            if (esDenegado(e)) setDenied(true);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    useEffect(() => {
        // La primera llamada no sale hasta saber que hay permiso.
        if (permiso === true) loadUsers();
    }, [loadUsers, permiso]);

    useEffect(() => {
        if (tab === "metrics" && !metrics && !denied) {
            adminService
                .metrics(30)
                .then(setMetrics)
                .catch((e) => {
                    if (esDenegado(e)) setDenied(true);
                });
        }
    }, [tab, metrics, denied]);

    /* La tabla se ordena en cliente: la lista viene de una búsqueda ya acotada
       por el backend y ordenar en servidor pediría un parámetro que no existe. */
    const usuariosOrdenados = useMemo(() => {
        const factor = orden.sentido === "asc" ? 1 : -1;
        return [...users].sort((a, b) => {
            const va = a[orden.clave] ?? "";
            const vb = b[orden.clave] ?? "";
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
            return String(va).localeCompare(String(vb), "es") * factor;
        });
    }, [users, orden]);

    const ordenarPor = (clave: ClaveDeOrden) =>
        setOrden((o) =>
            o.clave === clave
                ? { clave, sentido: o.sentido === "asc" ? "desc" : "asc" }
                : { clave, sentido: "asc" },
        );

    const selectUser = async (u: AdminUser) => {
        setSelected(u);
        setAdjustDelta(0);
        setAdjustReason("");
        try {
            const { transactions } = await adminService.transactions(u.uid, 25);
            setTxs(transactions);
        } catch {
            setTxs([]);
        }
    };

    const submitAdjust = async () => {
        if (!selected || !adjustDelta || !adjustReason.trim()) return;
        setAdjusting(true);
        try {
            await adminService.adjust(selected.uid, adjustDelta, adjustReason.trim());
            setConfirmandoAjuste(false);
            await loadUsers(query);
            await selectUser(selected);
        } finally {
            setAdjusting(false);
        }
    };

    if (permiso === undefined) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p role="status" className="flex items-center gap-2 text-sm text-content-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Comprobando tus permisos…
                </p>
            </div>
        );
    }

    if (permiso === false || denied) {
        // §11: qué pasó, qué se conserva y una salida. Antes era un callejón:
        // el mensaje y nada más, con la única salida de dar atrás en el
        // navegador o reescribir la URL.
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                <ShieldAlert className="h-12 w-12 text-dissent" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-content-strong">Sin acceso</h2>
                <p className="max-w-sm text-sm text-content-muted">
                    Esta cuenta no tiene el panel de administración. No has hecho nada mal y
                    tu sesión sigue abierta: esta pantalla simplemente no es para tu cuenta.
                </p>
                <Link
                    to={RUTA_DE_INICIO}
                    className="mt-2 inline-flex items-center gap-2 rounded-sm border border-stroke-control px-4 py-2 text-sm text-content-strong hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                >
                    <Home className="h-4 w-4" aria-hidden="true" />
                    Volver al chat
                </Link>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-center gap-4 border-b border-surface-highlight pb-3">
                <h1 className="text-xl font-bold text-content-strong">Administración</h1>
                <div className="flex gap-1">
                    <button
                        onClick={() => setTab("users")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            tab === "users" ? "bg-electric-cyan/10 text-electric-cyan" : "text-content-muted hover:text-content-strong"
                        }`}
                    >
                        <Users className="h-3.5 w-3.5" /> Usuarios
                    </button>
                    <button
                        onClick={() => setTab("metrics")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            tab === "metrics" ? "bg-electric-cyan/10 text-electric-cyan" : "text-content-muted hover:text-content-strong"
                        }`}
                    >
                        <BarChart3 className="h-3.5 w-3.5" /> Métricas
                    </button>
                </div>
            </div>

            {tab === "users" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Lista + búsqueda */}
                    <div className="space-y-3">
                        <form
                            onSubmit={(e) => { e.preventDefault(); loadUsers(query); }}
                            className="relative"
                        >
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
                            <input
                                aria-label="Buscar usuario"
                                placeholder="Buscar por email o UID…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full bg-surface border border-surface-highlight rounded-xl py-2 pl-9 pr-4 text-sm text-content-strong focus:border-electric-cyan/50"
                            />
                        </form>

                        {loadingUsers ? (
                            <Loader2 className="h-5 w-5 animate-spin text-content-muted" aria-label="Cargando usuarios" />
                        ) : users.length === 0 ? (
                            <p className="text-xs text-content-muted">Sin resultados.</p>
                        ) : (
                            /* §9.7/§12.12: contenedor propio con scroll horizontal,
                               `tabindex` y `role="region"` — una tabla que se
                               desplaza y no admite foco es contenido inalcanzable
                               para quien no usa ratón. */
                            <div
                                role="region"
                                aria-label="Usuarios, tabla desplazable en horizontal"
                                tabIndex={0}
                                className="overflow-x-auto rounded-md border border-stroke-edge focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                            >
                                <table className="w-full border-collapse text-sm">
                                    <caption className="px-3 py-2 text-start text-xs text-content-muted">
                                        {users.length === 1
                                            ? "1 usuario"
                                            : `${users.length} usuarios`}
                                        {query ? ` que coinciden con «${query}»` : ""}. Pulsa una
                                        cabecera para ordenar; pulsa una fila para ver su detalle.
                                    </caption>
                                    <thead>
                                        <tr className="border-y border-stroke-hairline bg-surface-1">
                                            {COLUMNAS.map((col) => {
                                                const activa = orden.clave === col.clave;
                                                return (
                                                    <th
                                                        key={col.clave}
                                                        scope="col"
                                                        aria-sort={
                                                            activa
                                                                ? orden.sentido === "asc"
                                                                    ? "ascending"
                                                                    : "descending"
                                                                : "none"
                                                        }
                                                        className={cn(
                                                            "px-3 py-2 text-micro font-medium uppercase text-content-muted",
                                                            col.numerica ? "text-end" : "text-start",
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => ordenarPor(col.clave)}
                                                            className={cn(
                                                                "inline-flex items-center gap-1 rounded-xs hover:text-content-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
                                                                activa && "text-content-strong",
                                                            )}
                                                        >
                                                            {col.rotulo}
                                                            <ArrowUpDown
                                                                aria-hidden="true"
                                                                className={cn("h-3 w-3", activa ? "opacity-100" : "opacity-40")}
                                                            />
                                                        </button>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usuariosOrdenados.map((u) => (
                                            <tr
                                                key={u.uid}
                                                className={cn(
                                                    "border-b border-stroke-hairline last:border-0",
                                                    selected?.uid === u.uid && "bg-accent/12",
                                                )}
                                            >
                                                {/* La celda de identidad es el encabezado de su fila:
                                                    es lo que da nombre a los tres números de al lado. */}
                                                <th scope="row" className="max-w-[16rem] px-3 py-2 text-start font-normal">
                                                    <button
                                                        type="button"
                                                        onClick={() => selectUser(u)}
                                                        aria-current={selected?.uid === u.uid ? "true" : undefined}
                                                        className="block w-full truncate text-start text-content-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                                    >
                                                        {u.email || u.uid}
                                                    </button>
                                                </th>
                                                <td className="px-3 py-2 text-content-muted">{u.plan}</td>
                                                <td className="px-3 py-2 text-end font-mono tabular-nums text-content">
                                                    {u.pro_messages_balance}
                                                </td>
                                                <td className="px-3 py-2 text-end font-mono tabular-nums text-content">
                                                    {u.topup_messages_balance}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Detalle usuario seleccionado */}
                    <div className="space-y-4">
                        {selected ? (
                            <>
                                <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight space-y-3">
                                    <h3 className="text-sm font-semibold text-content-strong">Ajustar créditos</h3>
                                    <p className="text-xs text-content-muted">{selected.email || selected.uid}</p>
                                    <div className="flex gap-2">
                                        <input
                                            aria-label="Delta de créditos"
                                            type="number"
                                            value={adjustDelta}
                                            onChange={(e) => setAdjustDelta(Number(e.target.value))}
                                            placeholder="delta (+/-)"
                                            className="w-28 bg-midnight border border-surface-highlight rounded-lg px-2 py-1.5 text-sm text-content-strong"
                                        />
                                        <input
                                            aria-label="Motivo"
                                            value={adjustReason}
                                            onChange={(e) => setAdjustReason(e.target.value)}
                                            placeholder="Motivo"
                                            className="flex-1 min-w-0 bg-midnight border border-surface-highlight rounded-lg px-2 py-1.5 text-sm text-content-strong"
                                        />
                                        {/* 6.9: «Aplicar» ya no aplica. Abre la
                                            confirmación, que es donde se ve de
                                            cuánto a cuánto se mueve el saldo de
                                            una cuenta que no es la tuya. */}
                                        <button
                                            onClick={() => setConfirmandoAjuste(true)}
                                            disabled={adjusting || !adjustDelta || !adjustReason.trim()}
                                            className="rounded-sm border border-stroke-control px-3 py-1.5 text-xs font-medium text-content-strong hover:bg-surface-1 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                        >
                                            Revisar y aplicar
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight">
                                    <h3 className="text-sm font-semibold text-content-strong mb-2">Transacciones</h3>
                                    <div className="space-y-1 max-h-80 overflow-y-auto">
                                        {txs.map((t, i) => {
                                            // D43 — `delta` puede faltar. Con
                                            // `any` esto pintaba «undefined»
                                            // en verde, que es peor que un 0.
                                            const delta = t.delta ?? 0;
                                            return (
                                                <div key={i} className="flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
                                                    <span className="text-content-muted truncate">{t.reason ?? "Sin motivo"}</span>
                                                    <span className={delta < 0 ? "text-agent-devil" : "text-success"}>
                                                        {delta > 0 ? "+" : ""}{delta}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {txs.length === 0 && <p className="text-xs text-content-muted">Sin transacciones.</p>}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-content-muted">Selecciona un usuario para ver detalles.</p>
                        )}
                    </div>
                </div>
            )}

            {tab === "metrics" && <MetricsView metrics={metrics} />}

            {/* Confirmación del ajuste de créditos (§9.4). El resumen es el
                punto: «+15» no dice nada, «de 10 a 25» sí. */}
            <ConfirmDialog
                open={confirmandoAjuste && selected !== null}
                onClose={() => setConfirmandoAjuste(false)}
                onConfirm={submitAdjust}
                question={`¿${adjustDelta >= 0 ? "Añadir" : "Retirar"} ${Math.abs(adjustDelta)} créditos a`}
                objectName={selected?.email || selected?.uid || ""}
                consequence={
                    <>
                        Su saldo comprado pasa de{" "}
                        <strong className="text-content-strong">{selected?.topup_messages_balance ?? 0}</strong> a{" "}
                        <strong className="text-content-strong">
                            {(selected?.topup_messages_balance ?? 0) + adjustDelta}
                        </strong>{" "}
                        créditos, con el motivo «{adjustReason.trim()}». El movimiento queda
                        registrado en sus transacciones y no se puede deshacer desde aquí:
                        haría falta otro ajuste en sentido contrario.
                    </>
                }
                confirmLabel={adjustDelta >= 0 ? "Añadir créditos" : "Retirar créditos"}
                confirmLoadingLabel="Aplicando"
                loading={adjusting}
                destructive={adjustDelta < 0}
            />
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight">
            <p className="text-micro uppercase text-content-quiet">{label}</p>
            <p className="text-xl font-bold text-content-strong mt-1">{value}</p>
        </div>
    );
}

function MetricsView({ metrics }: { metrics: AdminMetrics | null }) {
    if (!metrics) return <Loader2 className="h-5 w-5 animate-spin text-content-muted" />;

    const t = metrics.totals;
    const maxConsumed = Math.max(1, ...metrics.by_day.map((d) => d.credits_consumed));

    return (
        <div className="space-y-6">
            {/* Tarjetas de totales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Créditos consumidos" value={t.credits_consumed} />
                <StatCard label="Debates" value={t.debates} />
                <StatCard label="Chats" value={t.chats} />
                <StatCard label="Refunds" value={t.refunds} />
                <StatCard label="Coste USD (est.)" value={`$${t.cost_usd_estimated.toFixed(2)}`} />
                <StatCard label="Coste USD (real)" value={`$${t.cost_usd_actual.toFixed(2)}`} />
                <StatCard label="Compras" value={t.purchases_count} />
                <StatCard label="Créditos otorgados" value={t.credits_granted} />
            </div>

            {/* Gráfico de barras: créditos consumidos por día (SVG/divs a mano) */}
            <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight">
                <h3 className="text-sm font-semibold text-content-strong mb-4">
                    Créditos consumidos / día (últimos {metrics.days} días)
                </h3>
                <div className="flex items-end gap-1 h-40" role="img" aria-label="Créditos consumidos por día">
                    {metrics.by_day.map((d) => (
                        <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.date}: ${d.credits_consumed}`}>
                            <div
                                className="w-full bg-electric-cyan/60 rounded-t group-hover:bg-electric-cyan transition-colors"
                                style={{ height: `${(d.credits_consumed / maxConsumed) * 100}%` }}
                            />
                        </div>
                    ))}
                    {metrics.by_day.length === 0 && (
                        <p className="text-xs text-content-muted">Sin datos en el periodo.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
