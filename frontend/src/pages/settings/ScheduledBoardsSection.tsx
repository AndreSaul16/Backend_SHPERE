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
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { DIAS, aHoraLocal, describeCadencia, dosDigitos, husoLocal } from "@/lib/horarioUtc";
import { InlineError, type FalloDeSeccion } from "@/components/ui/InlineError";

/* D69/D70 — la tabla de días y la traducción de UTC a hora local viven en
   `lib/horarioUtc.ts`, con su test. Aquí había un array que empezaba en lunes
   mientras el valor que se enviaba lo interpretaba `cron` empezando en
   domingo, y todas las horas se pintaban en UTC sin decirlo dos veces. */

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
    return describeCadencia(b.cadence, b.hour_utc, b.weekday);
}

export function ScheduledBoardsSection() {
    const [boards, setBoards] = useState<ScheduledBoard[]>([]);
    const [loading, setLoading] = useState(true);
    // Redactado donde se produce: antes era `e.message`, o sea el volcado
    // «500 common.internal_error: …» que envuelve `api.ts`, pintado en un <p>
    // suelto sin ninguna salida.
    const [error, setError] = useState<FalloDeSeccion | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<ScheduledBoardInput>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    /* D70 — a qué hora de TU reloj cae lo que estás tecleando. Va como `hint`,
       o sea atado con aria-describedby: quien usa lector de pantalla lo oye al
       enfocar el campo, no como un texto suelto al lado. */
    const localDelFormulario = aHoraLocal(form.hour_utc, form.weekday ?? 0);
    const horaLocalDelFormulario =
        form.cadence === "weekly" && localDelFormulario.cambiaDeDia
            ? `${DIAS[localDelFormulario.dia]} a las ${dosDigitos(localDelFormulario.hora)} en ${husoLocal()}`
            : `${dosDigitos(localDelFormulario.hora)} en ${husoLocal()}`;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setBoards(await scheduledBoardsService.list());
        } catch {
            setError({
                title: "No se han podido cargar tus juntas programadas",
                detail: "Ninguna se ha cancelado: seguirán ejecutándose a su hora. Es un fallo al traer la lista.",
                onRetry: () => { void load(); },
            });
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
        } catch {
            setError({
                title: editingId
                    ? "No se han podido guardar los cambios de la junta programada"
                    : "No se ha podido programar la junta",
                detail: "El formulario sigue abierto con todo lo que has escrito. Vuelve a guardarlo.",
                onRetry: () => { void submit(); },
                retryLabel: "Volver a guardar",
            });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        try {
            await scheduledBoardsService.remove(id);
            await load();
        } catch {
            setError({
                title: "No se ha podido eliminar la junta programada",
                detail: "Sigue en la lista y se ejecutará a su hora. Vuelve a intentarlo.",
                onRetry: () => { void remove(id); },
                retryLabel: "Volver a eliminarla",
            });
        }
    };

    return (
        <div className="p-5 rounded-md bg-surface/30 border border-surface-highlight space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-electric-cyan" />
                    <div>
                        <h3 className="font-semibold text-content-strong">Juntas programadas</h3>
                        <p className="text-xs text-content-muted mt-0.5">
                            Ejecuta un debate del board de forma recurrente. Cada junta consume{" "}
                            <strong className="text-warning">5 créditos</strong>.
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

            {error && <InlineError {...error} />}
            {loading && <Loader2 className="h-4 w-4 animate-spin text-content-muted" />}

            {!loading && boards.length === 0 && !showForm && (
                <p className="text-xs text-content-muted">
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
                            <p className="text-sm text-content-strong truncate">{b.query}</p>
                            <p className="text-xs text-content-muted">
                                {describe(b)} · {b.channel === "none" ? "sin notificación" : b.channel}
                                {!b.enabled && " · (pausada)"}
                            </p>
                            {b.last_status && (
                                <p className="text-xs text-content-quiet mt-0.5">
                                    Último: {b.last_status}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => openEdit(b)}
                                className="p-1.5 rounded-lg text-content-muted hover:text-electric-cyan hover:bg-surface-highlight transition-colors"
                                aria-label="Editar"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => remove(b.id)}
                                className="p-1.5 rounded-lg text-content-muted hover:text-agent-devil hover:bg-agent-devil/10 transition-colors"
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
                    {/* Los `aria-label` de estos seis controles NO eran
                        equivalentes a su etiqueta visible («Hora (UTC)» frente a
                        «Hora UTC»), lo que rompe WCAG 2.5.3: quien dicta por voz
                        lee la etiqueta de la pantalla y el control no responde a
                        ese nombre. Con <Field> la etiqueta visible ES el nombre
                        accesible, así que no hay dos verdades. */}
                    <TextAreaField
                        label="Pregunta"
                        id="scheduled-query"
                        placeholder="¿Qué debe debatir la junta? (ej: revisar métricas y prioridades de la semana)"
                        value={form.query}
                        onChange={(e) => setForm((f) => ({ ...f, query: e.target.value }))}
                        rows={2}
                    />
                    <div className="flex flex-wrap gap-3">
                        <SelectField
                            label="Cadencia"
                            id="scheduled-cadence"
                            value={form.cadence}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, cadence: e.target.value as "daily" | "weekly" }))
                            }
                        >
                            <option value="daily">Diaria</option>
                            <option value="weekly">Semanal</option>
                        </SelectField>
                        {form.cadence === "weekly" && (
                            <SelectField
                                label="Día"
                                id="scheduled-weekday"
                                value={form.weekday ?? 0}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, weekday: Number(e.target.value) }))
                                }
                            >
                                {DIAS.map((d, i) => (
                                    <option key={i} value={i}>{d}</option>
                                ))}
                            </SelectField>
                        )}
                        {/* D70 — la hora se teclea en UTC porque es lo que el
                            servidor guarda, pero debajo se lee a qué hora de TU
                            reloj cae. Sin esto, «9» podía ser tu mediodía o tu
                            madrugada y no había forma de saberlo. */}
                        <TextField
                            label="Hora (UTC)"
                            id="scheduled-hour"
                            type="number"
                            min={0}
                            max={23}
                            value={form.hour_utc}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, hour_utc: Number(e.target.value) }))
                            }
                            hint={horaLocalDelFormulario}
                            controlClassName="w-24"
                        />
                        <SelectField
                            label="Canal"
                            id="scheduled-channel"
                            value={form.channel}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    channel: e.target.value as "none" | "slack" | "whatsapp",
                                }))
                            }
                        >
                            <option value="none">Ninguno</option>
                            <option value="slack">Slack</option>
                            <option value="whatsapp">WhatsApp</option>
                        </SelectField>
                    </div>
                    {form.channel !== "none" && (
                        <TextField
                            label="Destino"
                            id="scheduled-target"
                            placeholder={form.channel === "slack" ? "#canal o ID" : "teléfono / grupo"}
                            value={form.channel_target ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, channel_target: e.target.value }))}
                        />
                    )}
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-3 py-1.5 rounded-lg text-xs text-content-muted hover:text-content-strong border border-surface-highlight"
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
