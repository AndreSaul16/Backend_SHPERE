/**
 * Sección Contactos: whitelist de destinatarios autorizados para tools de envío
 * externo (WhatsApp, Calendar, etc.). Sin contactos aquí, las tools bloquean.
 */
import { useEffect, useState } from "react";
import { Trash2, Plus, Users, Shield } from "lucide-react";
import { contactsService, type Contact } from "@/services/api";

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
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newType, setNewType] = useState<string>("email");
  const [newValue, setNewValue] = useState("");
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setContacts(await contactsService.list());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
        type: newType as any,
        value: newValue.trim(),
        display_name: newName.trim() || undefined,
        authorized_for: newPerms,
      });
      setNewValue("");
      setNewName("");
      setNewPerms([]);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await contactsService.remove(id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex gap-3 text-sm">
        <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-content-muted">
          <strong className="text-amber-400">Whitelist obligatoria:</strong> los
          agentes solo pueden enviar mensajes o crear eventos a contactos que
          añadas aquí. Esto previene que un prompt malicioso dispare envíos no
          autorizados.
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Añadir contacto */}
      <section className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4">
        <div className="flex items-center gap-3 text-content-strong font-semibold">
          <Plus className="h-5 w-5 text-electric-cyan" />
          <h3>Añadir contacto</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
              Tipo
            </label>
            <select
              className={inputCls}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              {Object.entries(CONTACT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
              Valor
            </label>
            <input
              type="text"
              className={inputCls}
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
        </div>

        <div>
          <label className="text-[10px] uppercase font-mono text-content-muted block mb-1">
            Nombre (opcional)
          </label>
          <input
            type="text"
            className={inputCls}
            placeholder="Juan Pérez"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase font-mono text-content-muted block mb-2">
            Autorizado para
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_PERMISSIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePerm(p)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  newPerms.includes(p)
                    ? "bg-electric-cyan/20 border-electric-cyan/50 text-electric-cyan"
                    : "bg-midnight/50 border-surface-highlight text-content-muted hover:border-electric-cyan/30"
                }`}
              >
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
      <section className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-3">
        <div className="flex items-center gap-3 text-content-strong font-semibold">
          <Users className="h-5 w-5 text-luxury-purple" />
          <h3>Contactos autorizados ({contacts.length})</h3>
        </div>

        {loading ? (
          <p className="text-content-muted text-sm">Cargando...</p>
        ) : contacts.length === 0 ? (
          <p className="text-content-muted text-sm">
            Aún no tienes contactos. Añade al menos uno para que los agentes
            puedan enviar mensajes o crear eventos.
          </p>
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
                    <span className="px-2 py-0.5 bg-surface-highlight rounded-full text-[10px] text-content-muted">
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
                          className="px-2 py-0.5 bg-electric-cyan/10 text-electric-cyan rounded text-[10px]"
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
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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

const inputCls =
  "w-full bg-midnight/50 border border-surface-highlight rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-electric-cyan/50 transition-all";
