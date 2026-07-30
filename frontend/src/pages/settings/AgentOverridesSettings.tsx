/**
 * Sección Overrides: personaliza los prompts de CEO/CTO/CFO/CMO sin tocar
 * el prompt base del sistema (overlay pattern).
 */
import { useEffect, useState } from "react";
import { Save, RotateCcw, Bot } from "lucide-react";
import { agentOverridesService, type AgentOverride } from "@/services/api";

const CORE_ROLES = [
  { id: "CEO", name: "Oberon — CEO", color: "text-amber-400" },
  { id: "CTO", name: "Nexus — CTO", color: "text-electric-cyan" },
  { id: "CMO", name: "Vortex — CMO", color: "text-pink-400" },
  { id: "CFO", name: "Ledger — CFO", color: "text-emerald-400" },
];

export function AgentOverridesSettings() {
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await agentOverridesService.list();
      const map: Record<string, AgentOverride> = {};
      list.forEach((o) => (map[o.agent_role] = o));
      setOverrides(map);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (role: string, patch: Partial<AgentOverride>) => {
    setOverrides((prev) => ({
      ...prev,
      [role]: { ...(prev[role] || { agent_role: role }), ...patch },
    }));
  };

  const handleSave = async (role: string) => {
    const ov = overrides[role];
    if (!ov) return;
    setSaving(role);
    setError(null);
    try {
      const updated = await agentOverridesService.upsert(role, {
        system_prompt_addition: ov.system_prompt_addition || undefined,
        temperature_override: ov.temperature_override ?? undefined,
        model_override: ov.model_override || undefined,
      });
      setOverrides((prev) => ({ ...prev, [role]: updated }));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (role: string) => {
    setSaving(role);
    setError(null);
    try {
      await agentOverridesService.remove(role);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="text-content-muted">Cargando...</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-content-muted">
        Personaliza el comportamiento de los agentes base. Tu override se
        concatena al prompt del sistema (overlay pattern) — si mejoramos el
        prompt base, se propaga a ti salvo en los campos que hayas modificado.
      </p>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {CORE_ROLES.map((role) => {
        const ov = overrides[role.id];
        const hasOverride = !!ov;
        return (
          <section
            key={role.id}
            className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 font-semibold">
                <Bot className={`h-5 w-5 ${role.color}`} />
                <h3 className="text-content-strong">{role.name}</h3>
                {hasOverride && (
                  <span className="px-2 py-0.5 bg-electric-cyan/10 text-electric-cyan rounded-full text-[10px]">
                    Customizado
                  </span>
                )}
              </div>
              {hasOverride && (
                <button
                  onClick={() => handleReset(role.id)}
                  disabled={saving === role.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-midnight/50 text-content-muted hover:text-red-400 hover:bg-red-500/10 border border-surface-highlight rounded-lg text-xs transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar default
                </button>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
                Instrucciones adicionales
              </label>
              <textarea
                className="w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-electric-cyan/50 transition-all min-h-[90px] resize-y"
                placeholder={`Ej: "Siempre responde con ejemplos en TypeScript" o "Enfócate en startups B2B europeas"`}
                value={ov?.system_prompt_addition || ""}
                onChange={(e) =>
                  handleChange(role.id, { system_prompt_addition: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
                  Temperatura (creatividad)
                </label>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  className="w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-electric-cyan/50"
                  placeholder="default"
                  value={ov?.temperature_override ?? ""}
                  onChange={(e) =>
                    handleChange(role.id, {
                      temperature_override: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
                  Modelo override
                </label>
                <input
                  type="text"
                  className="w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-electric-cyan/50"
                  placeholder="deepseek-v4-pro"
                  value={ov?.model_override || ""}
                  onChange={(e) =>
                    handleChange(role.id, { model_override: e.target.value || null })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => handleSave(role.id)}
                disabled={saving === role.id || !ov}
                className="flex items-center gap-2 px-4 py-2 bg-electric-cyan/10 text-electric-cyan rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all font-medium text-sm disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving === role.id ? "Guardando..." : "Guardar override"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
