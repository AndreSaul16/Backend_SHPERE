/**
 * Sección Perfil: edita professional_profile, communication_style,
 * financial_preferences, ui_preferences.
 */
import { cloneElement, useEffect, useState } from "react";
import { Save, User, Briefcase, MessageSquare, Wallet, Palette } from "lucide-react";
import { profileService, type UserProfile } from "@/services/api";
import { Field as FormField } from "@/components/ui/Field";
import { fieldControlClass } from "@/components/ui/fieldStyles";

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    profileService
      .getProfile()
      .then((p) => setProfile(p))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  };

  const updateSection = <T extends keyof UserProfile>(
    section: T,
    patch: Partial<NonNullable<UserProfile[T]>>
  ) => {
    setProfile((p) =>
      p ? { ...p, [section]: { ...((p[section] as any) || {}), ...patch } } : p
    );
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await profileService.updateProfile({
        display_name: profile.display_name,
        ui_preferences: profile.ui_preferences,
        professional_profile: profile.professional_profile,
        communication_style: profile.communication_style,
        financial_preferences: profile.financial_preferences,
        personal_kb_enabled: profile.personal_kb_enabled,
      });
      setProfile(updated);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-content-muted">Cargando perfil...</p>;
  if (error && !profile)
    return <p className="text-red-400">Error: {error}</p>;
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <Section icon={<User className="h-5 w-5 text-electric-cyan" />} title="Identidad">
        <Field label="Nombre público">
          <input
            type="text"
            className={inputCls}
            value={profile.display_name || ""}
            onChange={(e) => update("display_name", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input type="email" className={inputCls + " opacity-60"} value={profile.email} disabled />
        </Field>
      </Section>

      <Section
        icon={<Briefcase className="h-5 w-5 text-luxury-purple" />}
        title="Perfil profesional"
        hint="Se inyecta en el system prompt de los agentes (USER_CONTEXT)."
      >
        <Field label="Rol">
          <input
            type="text"
            className={inputCls}
            placeholder="Founder, PM, Developer..."
            value={profile.professional_profile?.role || ""}
            onChange={(e) => updateSection("professional_profile", { role: e.target.value })}
          />
        </Field>
        <Field label="Empresa">
          <input
            type="text"
            className={inputCls}
            value={profile.professional_profile?.company_name || ""}
            onChange={(e) =>
              updateSection("professional_profile", { company_name: e.target.value })
            }
          />
        </Field>
        <Field label="Industria">
          <input
            type="text"
            className={inputCls}
            placeholder="SaaS B2B, e-commerce..."
            value={profile.professional_profile?.industry || ""}
            onChange={(e) =>
              updateSection("professional_profile", { industry: e.target.value })
            }
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <select
              className={inputCls}
              value={profile.professional_profile?.company_stage || ""}
              onChange={(e) =>
                updateSection("professional_profile", { company_stage: e.target.value })
              }
            >
              <option value="">—</option>
              <option value="idea">Idea</option>
              <option value="mvp">MVP</option>
              <option value="seed">Seed</option>
              <option value="series-A">Series A</option>
              <option value="series-B+">Series B+</option>
              <option value="growth">Growth</option>
            </select>
          </Field>
          <Field label="Tamaño del equipo">
            <input
              type="number"
              min={1}
              className={inputCls}
              value={profile.professional_profile?.team_size ?? ""}
              onChange={(e) =>
                updateSection("professional_profile", {
                  team_size: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={<MessageSquare className="h-5 w-5 text-emerald-400" />}
        title="Estilo de comunicación"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tono">
            <select
              className={inputCls}
              value={profile.communication_style?.tone || "casual"}
              onChange={(e) =>
                updateSection("communication_style", { tone: e.target.value as any })
              }
            >
              <option value="casual">Casual</option>
              <option value="formal">Formal</option>
            </select>
          </Field>
          <Field label="Verbosidad">
            <select
              className={inputCls}
              value={profile.communication_style?.verbosity || "concise"}
              onChange={(e) =>
                updateSection("communication_style", { verbosity: e.target.value as any })
              }
            >
              <option value="concise">Conciso</option>
              <option value="detailed">Detallado</option>
            </select>
          </Field>
        </div>
        <Field label="Instrucción adicional (opcional)">
          <input
            type="text"
            className={inputCls}
            placeholder="Ej: 'usa tuteo, prefiero respuestas con ejemplos'"
            value={profile.communication_style?.language_register || ""}
            onChange={(e) =>
              updateSection("communication_style", { language_register: e.target.value })
            }
          />
        </Field>
      </Section>

      <Section icon={<Wallet className="h-5 w-5 text-amber-400" />} title="Finanzas">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moneda base">
            <select
              className={inputCls}
              value={profile.financial_preferences?.base_currency || "EUR"}
              onChange={(e) =>
                updateSection("financial_preferences", { base_currency: e.target.value })
              }
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
            </select>
          </Field>
          <Field label="Inicio año fiscal (mes)">
            <input
              type="number"
              min={1}
              max={12}
              className={inputCls}
              value={profile.financial_preferences?.fiscal_year_start_month ?? 1}
              onChange={(e) =>
                updateSection("financial_preferences", {
                  fiscal_year_start_month: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </Section>

      <Section icon={<Palette className="h-5 w-5 text-pink-400" />} title="Interfaz">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tema">
            <select
              className={inputCls}
              value={profile.ui_preferences?.theme || "system"}
              onChange={(e) =>
                updateSection("ui_preferences", { theme: e.target.value as any })
              }
            >
              <option value="system">Sistema</option>
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </Field>
          <Field label="Idioma">
            <select
              className={inputCls}
              value={profile.ui_preferences?.locale || "es-ES"}
              onChange={(e) =>
                updateSection("ui_preferences", { locale: e.target.value })
              }
            >
              <option value="es-ES">Español (ES)</option>
              <option value="en-US">English (US)</option>
            </select>
          </Field>
        </div>
        <Field label="Confirmación antes de ejecutar herramientas">
          <select
            className={inputCls}
            value={profile.ui_preferences?.tool_confirmation_level || "destructive_only"}
            onChange={(e) =>
              updateSection("ui_preferences", {
                tool_confirmation_level: e.target.value as any,
              })
            }
          >
            <option value="always">Siempre preguntar</option>
            <option value="destructive_only">Solo acciones destructivas (recomendado)</option>
            <option value="never">No preguntar</option>
          </select>
        </Field>
      </Section>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-electric-cyan/10 text-electric-cyan rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-emerald-400">Guardado ✓</span>
        )}
      </div>
    </div>
  );
}

/**
 * §9.2: los 9 `<select>` de esta página heredaban el desplegable del sistema
 * operativo (a menudo blanco sobre blanco). El `[&>option]` lo arregla.
 */
const inputCls = fieldControlClass({
  className: "[&>option]:bg-surface-1 [&>option]:text-content",
});

/**
 * Envoltorio local, ahora sobre el `<Field>` canónico: clona el control para
 * inyectarle el `id` y el `aria-describedby` que el `<label htmlFor>` necesita.
 *
 * Se conserva el envoltorio en vez de reescribir sus 19 sitios de uso porque el
 * problema no era la forma, era que la etiqueta no apuntaba a nada. Con esto,
 * los 19 controles de la página quedan etiquetados de golpe.
 */
function Field({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <FormField label={label}>
      {(control) => cloneElement(children, control)}
    </FormField>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-3">
      <div className="flex items-center gap-3 text-content-strong font-semibold">
        {icon}
        <h3>{title}</h3>
      </div>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
