/**
 * Sección Perfil: edita professional_profile, communication_style,
 * financial_preferences, ui_preferences.
 */
import { cloneElement, useEffect, useState } from "react";
import { User, Briefcase, MessageSquare, Wallet, Palette } from "lucide-react";
import { profileService, type UserProfile } from "@/services/api";
import { Field as FormField } from "@/components/ui/Field";
import { fieldControlClass } from "@/components/ui/fieldStyles";
import { InlineError, type FalloDeSeccion } from "@/components/ui/InlineError";
import { aplicarDensidad, leerDensidad, type Densidad } from "@/lib/densidad";
import { UnsavedGuardDialog } from "@/components/ui/UnsavedGuardDialog";
import { BarraDeGuardado } from "@/components/ui/BarraDeGuardado";
import { contarCambios } from "@/lib/cambiosSinGuardar";
import { ConmutadorDeTema } from "@/components/ui/ConmutadorDeTema";
import { adoptarTemaDelPerfil } from "@/lib/tema";
import { EsqueletoDeFormulario } from "@/components/ui/Esqueleto";

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Redactado donde se produce. Antes era `String(e)` y la pantalla de carga
  // fallida se resolvía con un `<p>Error: TypeError: Failed to fetch</p>` y
  // nada más: sin reintentar, sin volver, sin nada.
  const [error, setError] = useState<FalloDeSeccion | null>(null);
  /* 5.15 · D63 — la referencia es lo último que dijo el servidor. Este
     formulario tiene diecinueve controles repartidos en cinco secciones, y
     salir de la pestaña era perderlos todos sin una palabra. Se compara el
     objeto entero serializado: los cambios son anidados (`ui_preferences`,
     `professional_profile`…) y una lista de campos sueltos se queda corta en
     cuanto alguien añade uno. */
  const [guardado, setGuardado] = useState<string>("");

  const cargar = () => {
    setLoading(true);
    profileService
      .getProfile()
      .then((p) => {
        setProfile(p);
        setGuardado(JSON.stringify(p));
        setError(null);
        // 6.11: sólo si este aparato no tiene ya su propia elección — ver la
        // regla de precedencia en `lib/tema.ts`.
        adoptarTemaDelPerfil(p.ui_preferences?.theme);
      })
      .catch(() =>
        setError({
          title: "No se ha podido cargar tu perfil",
          detail:
            "Tus datos siguen guardados en tu cuenta: esto es un fallo al traerlos, no una pérdida.",
          onRetry: cargar,
        }),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar();
    // Sólo al montar: `cargar` es la salida del propio aviso, no una dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setGuardado(JSON.stringify(updated));
      setSavedAt(Date.now());
      setError(null);
    } catch {
      setError({
        title: "No se han podido guardar los cambios de tu perfil",
        detail:
          "Todo lo que has escrito sigue en pantalla, sin perderse. Vuelve a guardar.",
        onRetry: () => { void handleSave(); },
        retryLabel: "Volver a guardar",
      });
    } finally {
      setSaving(false);
    }
  };

  /* 6.5 — cuántos campos difieren de lo último que dijo el servidor. Se
     compara contra `guardado`, que es la misma referencia que ya usaba el
     diálogo de salida de D63: una sola verdad para «qué está sin guardar». */
  const cambiosPendientes =
    guardado === "" || !profile ? 0 : contarCambios(JSON.parse(guardado), profile);

  /** Volver a lo último guardado. Sin confirmación: es reversible guardando. */
  const descartar = () => {
    if (guardado === "") return;
    setProfile(JSON.parse(guardado) as UserProfile);
  };

  if (loading) return <EsqueletoDeFormulario etiqueta="Cargando tu perfil" filas={5} />;
  if (error && !profile) return <InlineError {...error} />;
  if (!profile) return null;

  return (
    <div className="space-y-6">
      <UnsavedGuardDialog
        sucio={cambiosPendientes > 0}
        objeto="tus ajustes de perfil"
      />
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        icon={<MessageSquare className="h-5 w-5 text-success" />}
        title="Estilo de comunicación"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Section icon={<Wallet className="h-5 w-5 text-warning" />} title="Finanzas">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Section icon={<Palette className="h-5 w-5 text-accent" aria-hidden="true" />} title="Interfaz">
        {/* 6.11 · D61 — el `<select>` de tema ofrecía «Claro» y «Sistema» y
            ninguna de las dos hacía nada: el CSS del tema claro llevaba cinco
            fases escrito y nadie ponía el atributo. Ahora es el conmutador de
            tres estados, se aplica al elegir y se recuerda en este aparato; el
            campo del perfil se sigue escribiendo para que una sesión en un
            aparato nuevo herede la última elección de la cuenta. */}
        <ConmutadorDeTema onElegir={(t) => updateSection("ui_preferences", { theme: t })} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        {/* 5.7 · Q11 · §4.4 — la densidad. Es del DISPOSITIVO, no de la
            cuenta, así que no viaja en `ui_preferences` ni se guarda con el
            botón de abajo: se aplica al elegirla y ya está guardada. */}
        <DensidadDeLaInterfaz />

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

      {error && <InlineError {...error} />}

      {/* 6.5 · La barra va adherida al canto inferior: este formulario tiene
          cinco secciones y diecinueve controles, y el botón de guardar vivía al
          final de todas ellas. Quien cambiaba la moneda base tenía que bajar
          hasta el fondo, y si se le olvidaba, el diálogo de salida le decía
          «hay cambios» sin decirle cuántos. */}
      <BarraDeGuardado
        cambios={cambiosPendientes}
        guardando={saving}
        onGuardar={() => { void handleSave(); }}
        onDescartar={descartar}
        guardadoEn={savedAt}
        objeto="tu perfil"
      />

      {/* §12.6: «el resultado de guardar» se anuncia. El check verde de al lado
          no dice nada a un lector de pantalla, y el error tampoco: era un <p>
          normal que aparece y se queda mudo. La región vive SIEMPRE en el DOM,
          porque una que se monta con su contenido no la anuncian varios
          lectores. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-save">
        {saving
          ? "Guardando los cambios del perfil…"
          : error
            ? `${error.title}. ${error.detail}`
            : savedAt
              ? "Cambios del perfil guardados."
              : ""}
      </p>
    </div>
  );
}

/**
 * Conmutador de densidad (Q11 · §4.4).
 *
 * Dos radios de verdad dentro de un `<fieldset>` y no dos botones con
 * `aria-pressed`: son opciones excluyentes de un mismo ajuste, y los radios
 * traen de serie el recorrido con flechas y el anuncio «2 de 2» que un par de
 * botones no da. La etiqueta del grupo es el `<legend>`.
 *
 * No hay botón de guardar: se aplica al elegir. Una preferencia visual que hay
 * que confirmar aparte se queda sin confirmar la mitad de las veces, y el
 * usuario cree que no funciona.
 */
const OPCIONES_DE_DENSIDAD: { valor: Densidad; etiqueta: string; detalle: string }[] = [
  { valor: 'comfortable', etiqueta: 'Cómoda', detalle: 'Filas de 44px. Es la de partida.' },
  { valor: 'compact', etiqueta: 'Compacta', detalle: 'Filas de 34px: más historial de un vistazo.' },
];

function DensidadDeLaInterfaz() {
  const [densidad, setDensidad] = useState<Densidad>(() => leerDensidad());

  const elegir = (valor: Densidad) => {
    setDensidad(valor);
    aplicarDensidad(valor);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-content-muted">Densidad de la interfaz</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES_DE_DENSIDAD.map((opcion) => (
          <label
            key={opcion.valor}
            className={`grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 rounded-sm border p-3 transition-colors duration-(--duration-tap) ${
              densidad === opcion.valor
                ? 'border-brass-600 bg-accent/12'
                : 'border-stroke-hairline hover:border-stroke-control'
            }`}
          >
            {/* El texto va DIRECTO bajo la etiqueta, sin envoltorio: anidarlo un
                nivel más deja al `<label>` sin texto accesible para la regla de
                jsx-a11y, y con ella para varios lectores. La composición la
                hace la rejilla, no un `<span>` de más. */}
            <input
              type="radio"
              name="densidad"
              value={opcion.valor}
              checked={densidad === opcion.valor}
              onChange={() => elegir(opcion.valor)}
              className="row-span-2 mt-0.5 accent-brass-500"
            />
            <span className="min-w-0 text-sm text-content-strong">{opcion.etiqueta}</span>
            <span className="col-start-2 min-w-0 text-xs text-content-muted">{opcion.detalle}</span>
          </label>
        ))}
      </div>
      {/* §12.11/§12.16: en táctil la fila nunca baja de 44px, lo decida quien lo
          decida. Se dice, porque si no el conmutador parece roto en el móvil. */}
      <p className="text-xs text-content-quiet">
        En pantallas táctiles las filas se mantienen a 44px, para que el dedo siga acertando.
      </p>
    </fieldset>
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
    <section className="p-5 rounded-md bg-surface/30 border border-surface-highlight space-y-3">
      <div className="flex items-center gap-3 text-content-strong font-semibold">
        {icon}
        <h3>{title}</h3>
      </div>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
