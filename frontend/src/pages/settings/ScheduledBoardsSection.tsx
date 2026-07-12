/**
 * Juntas programadas (F3): CRUD de board meetings recurrentes.
 * Cada junta consume 5 créditos por ejecución.
 */
import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Loader2, Trash2, Plus, Pencil } from "lucide-react";
import {
    scheduledBoardsService,
    type ScheduledBoard,
    type ScheduledBoardInput,
} from "@/services/api";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const EMPTY_FORM: ScheduledBoardInput = {
    query: "",
    cadence: "weekly",
    hour_utc: 9,
    weekday: 0,
    channel: "none",
    channel_target: "",
    enabled: true,
};

function describe(b: ScheduledBoard): string {
    const when =
        b.cadence === "daily"
            ? `cada día a las ${b.hour_utc}:00 UTC`
            : `cada ${WEEKDAYS[b.weekday ?? 0]} a las ${b.hour_utc}:00 UTC`;
    return when;
}

export function ScheduledBoardsSection() {
    const [boards, setBoards] = useState<ScheduledBoard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ScheduledBoardInput>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setBoards(await scheduledBoardsService.list());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error cargando juntas");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (b: ScheduledBoard) => {
        setEditingId(b.id);
        setForm({
            query: b.query,
            cadence: b.cadence,
            hour_utc: b.hour_utc,
            weekday: b.weekday ?? 0,
            channel: b.channel,
            channel_target: b.channel_target ?? "",
            enabled: b.enabled,
        });
        setShowForm(true);
    };

    const submit = async () => {
        setSaving(true);
        setError(null);
        try {
            const payload: ScheduledBoardInput = {
                ...form,
                weekday: form.cadence === "weekly" ? form.weekday : null,
                channel_target: form.channel === "none" ? null : form.channel_target,
            };
            if (editingId) {
                await scheduledBoardsService.update(editingId, payload);
            } else {
                await scheduledBoardsService.create(payload);
            }
            setShowForm(false);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error guardando junta");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        try {
            await scheduledBoardsService.remove(id);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error eliminando junta");
        }
    };

    return (
        <div className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-electric-cyan" />
                    <div>
                        <h3 className="font-semibold text-text-primary">Juntas programadas</h3>
                        <p className="text-xs text-text-secondary mt-0.5">
                            Ejecuta un debate del board de forma recurrente. Cada junta consume{" "}
                            <strong className="text-yellow-400">5 créditos</strong>.
                        </p>
                    </div>
                </div>
                <button
                    onClick={openCreate}
                    disabled={boards.length >= 3}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 hover:bg-electric-cyan/20 transition-colors disabled:opacity-40"
                    title={boards.length >= 3 ? "Máximo 3 juntas programadas" : ""}
                >
                    <Plus className="h-3.5 w-3.5" /> Nueva
                </button>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />}

            {!loading && boards.length === 0 && !showForm && (
                <p className="text-xs text-text-secondary">
                    No tienes juntas programadas. Crea una para recibir análisis del board automáticamente.
                </p>
            )}

            {/* Lista */}
            <div className="space-y-2">
                {boards.map((b) => (
                    <div
                        key={b.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-xl bg-midnight/40 border border-surface-highlight"
                    >
                        <div className="min-w-0">
                            <p className="text-sm text-text-primary truncate">{b.query}</p>
                            <p className="text-[11px] text-text-secondary">
                                {describe(b)} · {b.channel === "none" ? "sin notificación" : b.channel}
                                {!b.enabled && " · (pausada)"}
                            </p>
                            {b.last_status && (
                                <p className="text-[10px] text-text-secondary/70 mt-0.5">
                                    Último: {b.last_status}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => openEdit(b)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-electric-cyan hover:bg-surface-highlight transition-colors"
                                aria-label="Editar"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => remove(b.id)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                aria-label="Eliminar"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Formulario crear/editar */}
            {showForm && (
                <div className="p-4 rounded-xl bg-midnight/50 border border-surface-highlight space-y-3">
                    <textarea
                        aria-label="Pregunta"
                        placeholder="¿Qué debe debatir el board? (ej: Revisar métricas y prioridades de la semana)"
                        value={form.query}
                        onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
                        rows={2}
                        className="w-full bg-surface border border-surface-highlight rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-electric-cyan/50"
                    />
                    <div className="flex flex-wrap gap-3">
                        <label className="text-xs text-text-secondary space-y-1">
                            <span className="block">Cadencia</span>
                            <select
                                aria-label="Cadencia"
                                value={form.cadence}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, cadence: e.target.value as "daily" | "weekly" }))
                                }
                                className="bg-surface border border-surface-highlight rounded-lg px-2 py-1.5 text-text-primary"
                            >
                                <option value="daily">Diaria</option>
                                <option value="weekly">Semanal</option>
                            </select>
                        </label>
                        {form.cadence === "weekly" && (
                            <label className="text-xs text-text-secondary space-y-1">
                                <span className="block">Día</span>
                                <select
                                    aria-label="Día"
                                    value={form.weekday ?? 0}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, weekday: Number(e.target.value) }))
                                    }
                                    className="bg-surface border border-surface-highlight rounded-lg px-2 py-1.5 text-text-primary"
                                >
                                    {WEEKDAYS.map((d, i) => (
                                        <option key={i} value={i}>{d}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <label className="text-xs text-text-secondary space-y-1">
                            <span className="block">Hora (UTC)</span>
                            <input
                                aria-label="Hora UTC"
                                type="number"
                                min={0}
                                max={23}
                                value={form.hour_utc}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, hour_utc: Number(e.target.value) }))
                                }
                                className="w-20 bg-surface border border-surface-highlight rounded-lg px-2 py-1.5 text-text-primary"
                            />
                        </label>
                        <label className="text-xs text-text-secondary space-y-1">
                            <span className="block">Canal</span>
                            <select
                                aria-label="Canal"
                                value={form.channel}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        channel: e.target.value as "none" | "slack" | "whatsapp",
                                    }))
                                }
                                className="bg-surface border border-surface-highlight rounded-lg px-2 py-1.5 text-text-primary"
                            >
                                <option value="none">Ninguno</option>
                                <option value="slack">Slack</option>
                                <option value="whatsapp">WhatsApp</option>
                            </select>
                        </label>
                    </div>
                    {form.channel !== "none" && (
                        <input
                            aria-label="Destino"
                            placeholder={form.channel === "slack" ? "#canal o ID" : "teléfono / grupo"}
                            value={form.channel_target ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, channel_target: e.target.value }))}
                            className="w-full bg-surface border border-surface-highlight rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-electric-cyan/50"
                        />
                    )}
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary border border-surface-highlight"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={submit}
                            disabled={saving || !form.query.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 hover:bg-electric-cyan/20 disabled:opacity-40"
                        >
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {editingId ? "Guardar" : "Crear"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
