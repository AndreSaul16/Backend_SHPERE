/**
 * Sección API Keys: configurar credenciales de servicios externos
 * (Google Calendar, LinkedIn, WhatsApp, Jules, Instagram).
 * Las credenciales se cifran con Fernet y se inyectan en los payloads de n8n.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Key,
  Calendar,
  Linkedin,
  MessageCircle,
  Code2,
  Instagram,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
  TestTube2,
  TrendingUp,
} from "lucide-react";

interface ServiceDefinition {
  service: string;
  label: string;
  description: string;
  credential_type: string;
  connected: boolean;
  metadata: Record<string, string>;
  created_at: string | null;
  tools?: string[];
}

interface ServiceCredentialsResponse {
  services: ServiceDefinition[];
  available: string[];
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  google_calendar: <Calendar className="h-5 w-5" />,
  linkedin: <Linkedin className="h-5 w-5" />,
  whatsapp: <MessageCircle className="h-5 w-5" />,
  jules: <Code2 className="h-5 w-5" />,
  instagram: <Instagram className="h-5 w-5" />,
  financial_api: <TrendingUp className="h-5 w-5" />,
};

const SERVICE_COLORS: Record<string, string> = {
  google_calendar: "text-blue-400",
  linkedin: "text-sky-400",
  whatsapp: "text-emerald-400",
  jules: "text-purple-400",
  instagram: "text-pink-400",
  financial_api: "text-amber-400",
};

export function ServiceCredentialsSettings() {
  const [data, setData] = useState<ServiceCredentialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state per service
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [metadataFields, setMetadataFields] = useState<Record<string, Record<string, string>>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const resp = await fetch("/api/v1/me/service-credentials", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error cargando credenciales");
      const result = await resp.json();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getAuthToken = async () => {
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("No autenticado");
    return user.getIdToken();
  };

  const handleSave = async (service: string) => {
    setSaving(service);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const resp = await fetch("/api/v1/me/service-credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service,
          api_key: apiKeys[service] || "",
          metadata: metadataFields[service] || {},
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Error guardando credencial");
      }
      setSuccess(`${service} configurado correctamente`);
      setApiKeys((prev) => ({ ...prev, [service]: "" }));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (service: string) => {
    setSaving(service);
    setError(null);
    try {
      const token = await getAuthToken();
      const resp = await fetch(`/api/v1/me/service-credentials/${service}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error eliminando credencial");
      setSuccess(`${service} eliminado correctamente`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (service: string) => {
    setTesting(service);
    setTestResults((prev) => ({ ...prev, [service]: undefined as any }));
    try {
      const token = await getAuthToken();
      const resp = await fetch(`/api/v1/me/service-credentials/${service}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await resp.json();
      setTestResults((prev) => ({ ...prev, [service]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [service]: { success: false, message: String(e) },
      }));
    } finally {
      setTesting(null);
    }
  };

  if (loading && !data) return <p className="text-content-muted">Cargando...</p>;

  return (
    <div className="space-y-6">
      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-electric-cyan/5 border border-electric-cyan/20">
        <Shield className="h-5 w-5 text-electric-cyan mt-0.5 flex-shrink-0" />
        <div className="text-sm text-content-muted">
          <p className="font-medium text-content-strong mb-1">Seguridad de credenciales</p>
          <p>
            Todas las API keys se cifran con Fernet (AES-128-CBC) antes de almacenarse.
            Se inyectan en los payloads de n8n solo cuando los agentes ejecutan acciones
            en tu nombre. n8n no almacena tus credenciales.
          </p>
        </div>
      </div>

      {/* Success/Error banners */}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Service cards */}
      <div className="grid grid-cols-1 gap-4">
        {data?.services.map((svc) => (
          <div
            key={svc.service}
            className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={SERVICE_COLORS[svc.service] || "text-content-strong"}>
                  {SERVICE_ICONS[svc.service] || <Key className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-content-strong">{svc.label}</h3>
                  <p className="text-xs text-content-muted mt-1">{svc.description}</p>
                  {svc.tools && svc.tools.length > 0 && (
                    <div className="relative group/tools inline-block mt-2">
                      <span className="px-2 py-0.5 bg-surface-highlight/70 text-content-muted border border-surface-highlight rounded-full text-[10px] font-medium cursor-default">
                        {svc.tools.length} herramienta{svc.tools.length !== 1 ? "s" : ""}
                      </span>
                      <div className="absolute bottom-full left-0 mb-2 opacity-0 invisible group-hover/tools:opacity-100 group-hover/tools:visible transition-all duration-200 z-50 pointer-events-none">
                        <div className="bg-surface border border-surface-highlight rounded-xl p-3 shadow-2xl min-w-[200px]">
                          <p className="text-[10px] text-content-quiet uppercase tracking-widest mb-2">Herramientas disponibles</p>
                          <ul className="space-y-1">
                            {svc.tools.map((t) => (
                              <li key={t} className="text-xs text-content-strong font-mono">{t}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {svc.connected && (
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] flex-shrink-0">
                  Configurado
                </span>
              )}
            </div>

            {/* Input fields */}
            <div className="space-y-3">
              {/* API Key / Token input */}
              <div>
                <label className="block text-xs text-content-muted mb-1">
                  {svc.credential_type === "oauth_token" ? "Access Token" : "API Key"}
                </label>
                <input
                  type="password"
                  value={apiKeys[svc.service] || ""}
                  onChange={(e) =>
                    setApiKeys((prev) => ({ ...prev, [svc.service]: e.target.value }))
                  }
                  placeholder={
                    svc.connected
                      ? "••••••••••••••••••••••••"
                      : `Ingresa tu ${svc.credential_type === "oauth_token" ? "token" : "API key"}`
                  }
                  className="w-full px-3 py-2 bg-surface/50 border border-surface-highlight rounded-xl text-content-strong text-sm focus:outline-none focus:border-electric-cyan/50 placeholder:text-content-quiet"
                />
              </div>

              {/* Metadata fields */}
              {svc.service === "whatsapp" && (
                <div>
                  <label className="block text-xs text-content-muted mb-1">
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={metadataFields[svc.service]?.phone_number_id || ""}
                    onChange={(e) =>
                      setMetadataFields((prev) => ({
                        ...prev,
                        [svc.service]: {
                          ...prev[svc.service],
                          phone_number_id: e.target.value,
                        },
                      }))
                    }
                    placeholder="123456789012345"
                    className="w-full px-3 py-2 bg-surface/50 border border-surface-highlight rounded-xl text-content-strong text-sm focus:outline-none focus:border-electric-cyan/50 placeholder:text-content-quiet"
                  />
                </div>
              )}

              {svc.service === "google_calendar" && (
                <div>
                  <label className="block text-xs text-content-muted mb-1">
                    Calendar ID (opcional)
                  </label>
                  <input
                    type="text"
                    value={metadataFields[svc.service]?.calendar_id || ""}
                    onChange={(e) =>
                      setMetadataFields((prev) => ({
                        ...prev,
                        [svc.service]: {
                          ...prev[svc.service],
                          calendar_id: e.target.value,
                        },
                      }))
                    }
                    placeholder="primary"
                    className="w-full px-3 py-2 bg-surface/50 border border-surface-highlight rounded-xl text-content-strong text-sm focus:outline-none focus:border-electric-cyan/50 placeholder:text-content-quiet"
                  />
                </div>
              )}

              {svc.service === "instagram" && (
                <div>
                  <label className="block text-xs text-content-muted mb-1">
                    Instagram Account ID
                  </label>
                  <input
                    type="text"
                    value={metadataFields[svc.service]?.instagram_account_id || ""}
                    onChange={(e) =>
                      setMetadataFields((prev) => ({
                        ...prev,
                        [svc.service]: {
                          ...prev[svc.service],
                          instagram_account_id: e.target.value,
                        },
                      }))
                    }
                    placeholder="17841400123456789"
                    className="w-full px-3 py-2 bg-surface/50 border border-surface-highlight rounded-xl text-content-strong text-sm focus:outline-none focus:border-electric-cyan/50 placeholder:text-content-quiet"
                  />
                </div>
              )}
            </div>

            {/* Test result */}
            {testResults[svc.service] && (
              <div
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                  testResults[svc.service].success
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {testResults[svc.service].success ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {testResults[svc.service].message}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(svc.service)}
                disabled={saving === svc.service || !apiKeys[svc.service]?.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all text-sm font-medium disabled:opacity-50"
              >
                {saving === svc.service ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {svc.connected ? "Actualizar" : "Guardar"}
              </button>

              {svc.connected && (
                <>
                  <button
                    onClick={() => handleTest(svc.service)}
                    disabled={testing === svc.service}
                    className="flex items-center gap-2 px-4 py-2 bg-surface/50 text-content-muted border border-surface-highlight rounded-xl hover:text-content-strong transition-all text-sm disabled:opacity-50"
                  >
                    {testing === svc.service ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube2 className="h-4 w-4" />
                    )}
                    Test
                  </button>

                  <button
                    onClick={() => handleDelete(svc.service)}
                    disabled={saving === svc.service}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
