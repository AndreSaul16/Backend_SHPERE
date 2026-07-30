/**
 * Panel de administración (F4 + F5).
 * Solo accesible para emails admin: si el backend devuelve 403 muestra "Sin acceso".
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, Search, ShieldAlert, Users, BarChart3 } from "lucide-react";
import {
    adminService,
    type AdminUser,
    type AdminMetrics,
} from "@/services/api";

type Tab = "users" | "metrics";

export function AdminPage() {
    const [denied, setDenied] = useState(false);
    const [tab, setTab] = useState<Tab>("users");

    // Usuarios
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [query, setQuery] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [selected, setSelected] = useState<AdminUser | null>(null);
    const [txs, setTxs] = useState<any[]>([]);

    // Ajuste
    const [adjustDelta, setAdjustDelta] = useState<number>(0);
    const [adjustReason, setAdjustReason] = useState("");
    const [adjusting, setAdjusting] = useState(false);

    // Métricas
    const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

    const loadUsers = useCallback(async (q?: string) => {
        setLoadingUsers(true);
        try {
            setUsers(await adminService.users(q));
        } catch (e) {
            if (e instanceof Error && e.message.includes("403")) setDenied(true);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    useEffect(() => {
        if (tab === "metrics" && !metrics && !denied) {
            adminService
                .metrics(30)
                .then(setMetrics)
                .catch((e) => {
                    if (e instanceof Error && e.message.includes("403")) setDenied(true);
                });
        }
    }, [tab, metrics, denied]);

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
            await loadUsers(query);
            await selectUser(selected);
        } finally {
            setAdjusting(false);
        }
    };

    if (denied) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                <ShieldAlert className="h-12 w-12 text-rose-400" />
                <h2 className="text-lg font-bold text-content-strong">Sin acceso</h2>
                <p className="text-sm text-content-muted">No tienes permisos para ver el panel de administración.</p>
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
                                className="w-full bg-surface border border-surface-highlight rounded-xl py-2 pl-9 pr-4 text-sm text-content-strong focus:outline-none focus:border-electric-cyan/50"
                            />
                        </form>

                        {loadingUsers ? (
                            <Loader2 className="h-5 w-5 animate-spin text-content-muted" />
                        ) : (
                            <div className="space-y-1">
                                {users.map((u) => (
                                    <button
                                        key={u.uid}
                                        onClick={() => selectUser(u)}
                                        className={`w-full text-left p-3 rounded-xl border transition-colors ${
                                            selected?.uid === u.uid
                                                ? "border-electric-cyan/40 bg-electric-cyan/5"
                                                : "border-surface-highlight hover:bg-surface-highlight/40"
                                        }`}
                                    >
                                        <p className="text-sm text-content-strong truncate">{u.email || u.uid}</p>
                                        <p className="text-[11px] text-content-muted font-mono">
                                            plan: {u.plan} · pro: {u.pro_messages_balance} · topup: {u.topup_messages_balance}
                                        </p>
                                    </button>
                                ))}
                                {users.length === 0 && (
                                    <p className="text-xs text-content-muted">Sin resultados.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Detalle usuario seleccionado */}
                    <div className="space-y-4">
                        {selected ? (
                            <>
                                <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight space-y-3">
                                    <h3 className="text-sm font-semibold text-content-strong">Ajustar créditos</h3>
                                    <p className="text-[11px] text-content-muted">{selected.email || selected.uid}</p>
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
                                        <button
                                            onClick={submitAdjust}
                                            disabled={adjusting || !adjustDelta || !adjustReason.trim()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 hover:bg-electric-cyan/20 disabled:opacity-40"
                                        >
                                            {adjusting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aplicar"}
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight">
                                    <h3 className="text-sm font-semibold text-content-strong mb-2">Transacciones</h3>
                                    <div className="space-y-1 max-h-80 overflow-y-auto">
                                        {txs.map((t, i) => (
                                            <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                                                <span className="text-content-muted truncate">{t.reason}</span>
                                                <span className={t.delta < 0 ? "text-rose-400" : "text-emerald-400"}>
                                                    {t.delta > 0 ? "+" : ""}{t.delta}
                                                </span>
                                            </div>
                                        ))}
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
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="p-4 rounded-xl bg-surface/40 border border-surface-highlight">
            <p className="text-[11px] uppercase tracking-widest text-content-quiet">{label}</p>
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
