/**
 * Sección Contactos: whitelist de destinatarios autorizados para tools de envío
 * externo (WhatsApp, Calendar, etc.). Sin contactos aquí, las tools bloquean.
 */
import { useEffect, useState } from "react";
import { Trash2, Plus, Users, Shield, Check, UserPlus } from "lucide-react";
import { contactsService, type Contact } from "@/services/api";
import { SelectField, TextField } from "@/components/ui/Field";
import { InlineError, type FalloDeSeccion } from "@/components/ui/InlineError";
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { EsqueletoDeFilas } from "@/components/ui/Esqueleto";

const CONTACT_TYPES: Record<string, string> = {
  email: "Email",
  phone: "Teléfono (E.164)",
  slack_channel: "Canal Slack",
  github_user: "Usuario GitHub",
  linkedin_handle: "Handle LinkedIn",
};

const AVAILABLE_PERMISSIONS = [
  "whatsapp_send_message",
  "whatsapp_send_notification",
  "calendar_create_event",
  "slack_post_message",
];

export function ContactsSettings() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  // El fallo se guarda ya redactado: quien lo escribe es quien sabe qué se
  // estaba intentando. Antes era un `String(e)` y salía «Error: TypeError».
  const [error, setError] = useState<FalloDeSeccion | null>(null);

  // Form state
  const [newType, setNewType] = useState<Contact["type"]>("email");
  const [newValue, setNewValue] = useState("");
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setContacts(await contactsService.list());
      setError(null);
    } catch {
      setError({
        title: "No se ha podido cargar tu lista de contactos",
        detail: "Ningún contacto se ha borrado: es un fallo al traer la lista.",
        onRetry: () => { void load(); },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Sólo al montar. `load` se referencia ahora a sí misma como salida del
    // aviso de fallo, así que la regla la ve reactiva; volver a cargar cada vez
    // que cambie su identidad sería un bucle de peticiones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePerm = (perm: string) => {
    setNewPerms((p) =>
      p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]
    );
  };

  const handleAdd = async () => {
    if (!newValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await contactsService.add({
        type: newType,
        value: newValue.trim(),
        display_name: newName.trim() || undefined,
        authorized_for: newPerms,
      });
      setNewValue("");
      setNewName("");
      setNewPerms([]);
      await load();
    } catch {
      setError({
        title: "No se ha podido añadir el contacto",
        detail:
          "Lo que has escrito sigue en el formulario: revísalo y vuelve a darle a añadir.",
        onRetry: () => { void handleAdd(); },
        retryLabel: "Volver a añadirlo",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await contactsService.remove(id);
      await load();
    } catch {
      setError({
        title: "No se ha podido eliminar el contacto",
        detail:
          "Sigue en la lista y sus permisos siguen activos. Vuelve a intentarlo.",
        onRetry: () => { void handleRemove(id); },
        retryLabel: "Volver a eliminarlo",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-warning/5 border border-warning/20 flex gap-3 text-sm">
        <Shield className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="text-content-muted">
          <strong className="text-warning">Whitelist obligatoria:</strong> los
          agentes solo pueden enviar mensajes o crear eventos a contactos que
          añadas aquí. Esto previene que un prompt malicioso dispare envíos no
          autorizados.
        </div>
      </div>

      {error && <InlineError {...error} />}

      {/* Añadir contacto */}
      <section className="p-5 rounded-md bg-surface/30 border border-surface-highlight space-y-4">
        <div className="flex items-center gap-3 text-content-strong font-semibold">
          <Plus className="h-5 w-5 text-electric-cyan" />
          <h3>Añadir contacto</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField
            label="Tipo"
            id="contact-type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as Contact["type"])}
          >
            {Object.entries(CONTACT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Valor"
            id="contact-value"
            placeholder={
              newType === "phone"
                ? "+34612345678"
                : newType === "email"
                ? "alguien@empresa.com"
                : "..."
            }
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
        </div>

        <TextField
          label="Nombre (opcional)"
          id="contact-name"
          placeholder="Juan Pérez"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />

        <div>
          {/* Grupo de chips, no campo: `role="group"` + aria-labelledby (§12.7).
              Y cada chip lleva `aria-pressed` y un glifo Check cuando está
              activo, porque §9.9 prohíbe que su estado sea sólo cromático —
              que es lo que era. */}
          <span id="contact-perms-label" className="text-micro uppercase font-mono text-content-muted block mb-2">
            Autorizado para
          </span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="contact-perms-label">
            {AVAILABLE_PERMISSIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePerm(p)}
                aria-pressed={newPerms.includes(p)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${
                  newPerms.includes(p)
                    ? "bg-accent/20 border-accent/50 text-accent"
                    : "bg-midnight/50 border-surface-highlight text-content-muted hover:border-accent/30"
                }`}
              >
                {newPerms.includes(p) && <Check className="h-3 w-3" aria-hidden="true" />}
                {p}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={saving || !newValue.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-electric-cyan/10 text-electric-cyan rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all font-medium disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {saving ? "Añadiendo..." : "Añadir"}
        </button>
      </section>

      {/* Lista de contactos */}
      <section className="p-5 rounded-md bg-surface/30 border border-surface-highlight space-y-3">
        <div className="flex items-center gap-3 text-content-strong font-semibold">
          <Users className="h-5 w-5 text-luxury-purple" />
          <h3>Contactos autorizados ({contacts.length})</h3>
        </div>

        {loading ? (
          <EsqueletoDeFilas etiqueta="Cargando tus contactos" />
        ) : contacts.length === 0 ? (
          /* 6.12 · §9.14: era una frase suelta en medio de un hueco. Ahora
             tiene glifo, título, la frase y UNA acción — que aquí es llevar el
             foco al campo de añadir, porque el formulario está debajo y a
             mucha gente le pasa desapercibido. */
          <EstadoVacio
            glifo={<UserPlus aria-hidden="true" />}
            titulo="Aún no tienes contactos autorizados"
            frase="Sin al menos uno, tus agentes no pueden escribir a nadie ni crear eventos: las herramientas se bloquean."
            accion={{
              etiqueta: "Añadir el primero",
              // Por id y no por `ref`: `<TextField>` no expone el control, y
              // abrirle la API entera a un componente canónico para mover un
              // foco no compensa. El id es el mismo que usa su `<label>`.
              onClick: () => document.getElementById("contact-value")?.focus(),
            }}
          />
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div
                key={c.id || c.value}
                className="flex items-center justify-between p-3 bg-midnight/40 rounded-xl border border-surface-highlight"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-content-strong truncate">
                      {c.display_name || c.value}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-highlight rounded-full text-micro text-content-muted">
                      {CONTACT_TYPES[c.type] || c.type}
                    </span>
                  </div>
                  <div className="text-xs text-content-muted font-mono mt-1 truncate">
                    {c.value}
                  </div>
                  {c.authorized_for.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.authorized_for.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-electric-cyan/10 text-electric-cyan rounded text-micro"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {c.id && (
                  <button
                    onClick={() => handleRemove(c.id!)}
                    className="p-2 text-danger hover:bg-oxblood-500/10 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

