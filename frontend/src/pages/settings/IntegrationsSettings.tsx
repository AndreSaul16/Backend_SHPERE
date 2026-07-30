/**
 * Sección Integraciones (BYO OAuth): cada usuario registra su propia OAuth app
 * (client_id + client_secret) de GitHub/Notion/Slack y luego conecta su cuenta.
 * El client_secret se cifra en el backend y nunca se devuelve.
 */
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Github,
  FileText,
  Slack as SlackIcon,
  Calendar,
  Link2,
  Unlink,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import {
  integrationsService,
  type IntegrationsList,
  type OAuthAppsList,
} from "@/services/api";
import { PasswordField, TextField } from "@/components/ui/Field";

const PROVIDER_META: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    description: string;
    createUrl: string;
    createHint: string;
  }
> = {
  github: {
    label: "GitHub",
    icon: <Github className="h-6 w-6" />,
    description: "Permite al CTO crear repos, issues y PRs en tu cuenta.",
    createUrl: "https://github.com/settings/developers",
    createHint:
      "GitHub → Settings → Developer settings → OAuth Apps → New OAuth App",
  },
  notion: {
    label: "Notion",
    icon: <FileText className="h-6 w-6" />,
    description: "Permite a los agentes crear y actualizar páginas en tu workspace.",
    createUrl: "https://www.notion.so/my-integrations",
    createHint: "Notion → My integrations → New integration (tipo: Public / OAuth)",
  },
  slack: {
    label: "Slack",
    icon: <SlackIcon className="h-6 w-6" />,
    description: "Permite enviar mensajes a canales autorizados.",
    createUrl: "https://api.slack.com/apps",
    createHint: "Slack API → Create New App → OAuth & Permissions",
  },
  google: {
    label: "Google Calendar",
    icon: <Calendar className="h-6 w-6" />,
    description: "Permite a tus agentes crear, listar y gestionar eventos en tu Google Calendar.",
    createUrl: "https://console.cloud.google.com/apis/credentials",
    createHint:
      "Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (tipo: Web). Habilita la Google Calendar API y añade la Callback URL de abajo a los 'Authorized redirect URIs'.",
  },
};

export function IntegrationsSettings() {
  const [data, setData] = useState<IntegrationsList | null>(null);
  const [apps, setApps] = useState<OAuthAppsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  // Form state por provider
  const [clientIds, setClientIds] = useState<Record<string, string>>({});
  const [clientSecrets, setClientSecrets] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, appsList] = await Promise.all([
        integrationsService.list(),
        integrationsService.listApps(),
      ]);
      setData(list);
      setApps(appsList);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Banner cuando volvemos del callback OAuth
  const justConnected = params.get("connected");
  useEffect(() => {
    if (justConnected) {
      const t = setTimeout(() => {
        params.delete("connected");
        setParams(params, { replace: true });
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [justConnected, params, setParams]);

  const copyCallback = async (provider: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(provider);
      setTimeout(() => setCopied((c) => (c === provider ? null : c)), 2000);
    } catch {
      /* clipboard no disponible */
    }
  };

  const handleRegister = async (provider: string) => {
    const cid = (clientIds[provider] || "").trim();
    const secret = (clientSecrets[provider] || "").trim();
    if (!cid || !secret) {
      setError("Introduce el Client ID y el Client Secret.");
      return;
    }
    setWorking(provider);
    setError(null);
    try {
      await integrationsService.registerApp(provider, cid, secret);
      setClientIds((p) => ({ ...p, [provider]: "" }));
      setClientSecrets((p) => ({ ...p, [provider]: "" }));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(null);
    }
  };

  const handleConnect = async (provider: string) => {
    setWorking(provider);
    setError(null);
    try {
      await integrationsService.connect(provider);
      // El flujo redirige al provider; si no, recargamos
    } catch (e) {
      setError(String(e));
      setWorking(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    setWorking(provider);
    setError(null);
    try {
      await integrationsService.disconnect(provider);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(null);
    }
  };

  const handleDeleteApp = async (provider: string) => {
    setWorking(provider);
    setError(null);
    try {
      await integrationsService.deleteApp(provider);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(null);
    }
  };

  if (loading && !data) return <p className="text-content-muted">Cargando...</p>;

  const providers = data?.available || Object.keys(PROVIDER_META);
  const appByProvider = new Map((apps?.apps || []).map((a) => [a.provider, a]));

  return (
    <div className="space-y-6">
      {justConnected && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Conectado correctamente a {justConnected}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-sm text-content-muted">
        Cada integración usa <strong>tu propia OAuth app</strong>: créala en el
        proveedor, registra aquí su <em>Client ID</em> y <em>Client Secret</em> (se
        cifran en reposo) y luego conecta tu cuenta. Los tokens se usan cuando los
        agentes actúan en tu nombre.
      </p>

      <div className="grid grid-cols-1 gap-4">
        {providers.map((p) => {
          const meta =
            PROVIDER_META[p] || {
              label: p,
              icon: <Link2 className="h-6 w-6" />,
              description: "",
              createUrl: "#",
              createHint: "",
            };
          const registered = appByProvider.get(p);
          const isConnected = data?.status?.[p] ?? false;
          const isWorking = working === p;
          const callbackUrl = apps?.callback_urls?.[p] || "";

          return (
            <div
              key={p}
              className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 text-content-strong">
                  {meta.icon}
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {meta.label}
                      {isConnected && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px]">
                          Conectado
                        </span>
                      )}
                      {registered && !isConnected && (
                        <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-full text-[10px]">
                          App registrada
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-content-muted mt-1">
                      {meta.description}
                    </p>
                  </div>
                </div>
              </div>

              {!registered ? (
                /* ---- Paso 1: registrar la OAuth app ---- */
                <div className="space-y-3 border-t border-surface-highlight pt-3">
                  <div className="text-xs text-content-muted space-y-2">
                    <p className="flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" />
                      Crea tu OAuth app:
                      <a
                        href={meta.createUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-electric-cyan hover:underline inline-flex items-center gap-1"
                      >
                        {meta.createHint}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                    {callbackUrl && (
                      <div className="space-y-1">
                        <span>
                          Usa esta <strong>Authorization callback URL</strong>:
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-2 py-1.5 bg-surface/60 border border-surface-highlight rounded-lg text-[11px] text-content-strong break-all">
                            {callbackUrl}
                          </code>
                          <button
                            onClick={() => copyCallback(p, callbackUrl)}
                            className="p-1.5 rounded-lg border border-surface-highlight hover:border-electric-cyan/50 text-content-muted hover:text-electric-cyan transition-all"
                            title="Copiar"
                          >
                            {copied === p ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <TextField
                      label="Client ID"
                      id={`oauth-client-id-${p}`}
                      value={clientIds[p] || ""}
                      onChange={(e) =>
                        setClientIds((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      placeholder="Tu Client ID"
                    />
                    <PasswordField
                      label="Client Secret"
                      id={`oauth-client-secret-${p}`}
                      value={clientSecrets[p] || ""}
                      onChange={(e) =>
                        setClientSecrets((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      placeholder="Tu Client Secret"
                    />
                  </div>

                  <button
                    onClick={() => handleRegister(p)}
                    disabled={isWorking}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all text-sm font-medium disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />
                    {isWorking ? "Guardando..." : "Guardar app"}
                  </button>
                </div>
              ) : (
                /* ---- Paso 2: conectar / desconectar + gestionar la app ---- */
                <div className="space-y-3 border-t border-surface-highlight pt-3">
                  <p className="text-xs text-content-muted">
                    Client ID:{" "}
                    <code className="text-content-strong">{registered.client_id}</code>
                  </p>

                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(p)}
                      disabled={isWorking}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <Unlink className="h-4 w-4" />
                      {isWorking ? "Desconectando..." : "Desconectar"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(p)}
                      disabled={isWorking}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 rounded-xl hover:bg-electric-cyan hover:text-midnight transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <Link2 className="h-4 w-4" />
                      {isWorking ? "Conectando..." : `Conectar ${meta.label}`}
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteApp(p)}
                    disabled={isWorking}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-content-muted hover:text-red-400 transition-all text-xs disabled:opacity-50"
                    title="Elimina el client_id/secret y revoca los tokens emitidos"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar app registrada
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
