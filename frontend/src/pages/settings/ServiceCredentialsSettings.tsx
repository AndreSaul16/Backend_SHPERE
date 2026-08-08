/**
 * Sección API Keys: configurar credenciales de servicios externos
 * (Google Calendar, LinkedIn, WhatsApp, Jules, Instagram).
 * Las credenciales se cifran con Fernet y se inyectan en los payloads de n8n.
 */
import { useEffect, useState, useCallback } from "react";
import { serviceCredentialsService } from "@/services/api";
import type { ServiceCredentialsResponse } from "@/services/api";
import { motivoLegible } from "@/lib/errors";
import { PasswordField, TextField } from "@/components/ui/Field";
import { InlineError, type FalloDeSeccion } from "@/components/ui/InlineError";
import { FilaDeConexion } from "@/pages/settings/FilaDeConexion";
import {
  pasaElFiltro,
  useControlDeAcordeon,
  type ControlDeAcordeon,
} from "@/pages/settings/conexionesAcordeon";
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
  SearchX,
} from "lucide-react";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  google_calendar: <Calendar className="h-5 w-5" />,
  linkedin: <Linkedin className="h-5 w-5" />,
  whatsapp: <MessageCircle className="h-5 w-5" />,
  jules: <Code2 className="h-5 w-5" />,
  instagram: <Instagram className="h-5 w-5" />,
  financial_api: <TrendingUp className="h-5 w-5" />,
};

export function ServiceCredentialsSettings({ control: controlExterno }: { control?: ControlDeAcordeon } = {}) {
  const control = useControlDeAcordeon(controlExterno);
  const [data, setData] = useState<ServiceCredentialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  // Antes era una cadena y se pintaba tal cual: el «qué se conserva» y la
  // salida no existían. Ahora el fallo se redacta donde se produce.
  const [error, setError] = useState<FalloDeSeccion | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state per service
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [metadataFields, setMetadataFields] = useState<Record<string, Record<string, string>>>({});
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await serviceCredentialsService.list());
    } catch (e) {
      setError({
        title: "No se han podido cargar tus credenciales",
        detail:
          "Ninguna se ha borrado ni se ha visto comprometida: es un fallo al traer la lista.",
        // El motivo del backend SÍ se enseña aquí, en pequeño y debajo: un
        // fallo de credenciales suele ser accionable («la clave no es válida»).
        // Lo que no se enseña es el prefijo con el código interno.
        reason: motivoLegible(e),
        onRetry: () => { void load(); },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (service: string) => {
    setSaving(service);
    setError(null);
    setSuccess(null);
    try {
      await serviceCredentialsService.save(
        service,
        apiKeys[service] || "",
        metadataFields[service] || {},
      );
      setSuccess(`${service} configurado correctamente`);
      setApiKeys((prev) => ({ ...prev, [service]: "" }));
      await load();
    } catch (e) {
      setError({
        title: `No se ha podido guardar la credencial de ${service}`,
        detail:
          "La clave que has escrito sigue en el campo y la anterior, si la había, no se ha tocado.",
        reason: motivoLegible(e),
        onRetry: () => { void handleSave(service); },
        retryLabel: "Volver a guardarla",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (service: string) => {
    setSaving(service);
    setError(null);
    try {
      await serviceCredentialsService.remove(service);
      setSuccess(`${service} eliminado correctamente`);
      await load();
    } catch (e) {
      setError({
        title: `No se ha podido eliminar la credencial de ${service}`,
        detail: "Sigue guardada y activa. Vuelve a intentarlo.",
        reason: motivoLegible(e),
        onRetry: () => { void handleDelete(service); },
        retryLabel: "Volver a eliminarla",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleTest = async (service: string) => {
    setTesting(service);
    setTestResults((prev) => ({ ...prev, [service]: undefined as any }));
    try {
      const result = await serviceCredentialsService.test(service);
      setTestResults((prev) => ({ ...prev, [service]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [service]: {
          success: false,
          message: motivoLegible(e) ?? "No se pudo probar la credencial.",
        },
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
      {/* §12.6: el resultado de guardar se anuncia. Antes cambiaba el DOM en
          silencio y quien no ve la pantalla no sabía si había funcionado. */}
      {success && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/30 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {success}
        </div>
      )}
      {error && <InlineError {...error} />}

      {/* Service cards — 6.8: plegadas, y sólo una abierta en toda la página. */}
      {(() => {
        const visibles = (data?.services ?? []).filter((svc) =>
          pasaElFiltro(control.filtro, svc.label, svc.service, svc.description),
        );
        if (visibles.length === 0) {
          /* 6.12 · §9.14: con la lista vacía esto no pintaba NADA — página en
             blanco bajo el aviso de seguridad. Son dos vacíos distintos y
             merecen dos textos distintos: «tu búsqueda no encuentra» y «el
             backend no ofrece ninguno», que es un fallo de despliegue y no
             algo que el usuario pueda arreglar. */
          return control.filtro ? (
            <EstadoVacio
              glifo={<SearchX aria-hidden="true" />}
              titulo="Ningún servicio coincide con tu búsqueda"
              frase="Prueba con otra palabra: se busca por el nombre del servicio y por lo que hace."
            />
          ) : (
            <EstadoVacio
              glifo={<Key aria-hidden="true" />}
              titulo="No hay servicios disponibles"
              frase="Tus agentes no tienen ninguna herramienta externa que configurar todavía. No has perdido nada: si tenías credenciales, siguen guardadas."
              accion={{ etiqueta: 'Volver a comprobarlo', onClick: () => { void load(); } }}
            />
          );
        }
        return visibles.map((svc) => (
          <FilaDeConexion
            key={svc.service}
            id={svc.service}
            control={control}
            icono={SERVICE_ICONS[svc.service] || <Key className="h-5 w-5" />}
            titulo={svc.label}
            descripcion={svc.description}
            estado={
              svc.connected
                ? { texto: "Configurado", tono: "ok" }
                : { texto: "Sin configurar", tono: "pendiente" }
            }
          >
            {/* Herramientas que desbloquea */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  {svc.tools && svc.tools.length > 0 && (
                    <div className="relative group/tools inline-block mt-2">
                      <span className="px-2 py-0.5 bg-surface-highlight/70 text-content-muted border border-surface-highlight rounded-full text-micro font-medium cursor-default">
                        {svc.tools.length} herramienta{svc.tools.length !== 1 ? "s" : ""}
                      </span>
                      <div className="absolute bottom-full left-0 mb-2 opacity-0 invisible group-hover/tools:opacity-100 group-hover/tools:visible transition-all duration-200 z-50 pointer-events-none">
                        <div className="bg-surface border border-surface-highlight rounded-xl p-3 shadow-2xl min-w-[200px]">
                          <p className="text-micro text-content-muted uppercase mb-2">Herramientas disponibles</p>
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
            </div>

            {/* Input fields */}
            <div className="space-y-3">
              {/* §9.2: la clave se escribe con conmutador de visibilidad. */}
              <PasswordField
                label={svc.credential_type === "oauth_token" ? "Access Token" : "API Key"}
                value={apiKeys[svc.service] || ""}
                onChange={(e) =>
                  setApiKeys((prev) => ({ ...prev, [svc.service]: e.target.value }))
                }
                placeholder={
                  svc.connected
                    ? "••••••••••••••••••••••••"
                    : `Escribe tu ${svc.credential_type === "oauth_token" ? "token" : "API key"}`
                }
              />

              {/* Metadata fields */}
              {svc.service === "whatsapp" && (
                <TextField
                  label="Phone Number ID"
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
                />
              )}

              {svc.service === "google_calendar" && (
                <TextField
                  label="Calendar ID (opcional)"
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
                />
              )}

              {svc.service === "instagram" && (
                <TextField
                  label="Instagram Account ID"
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
                />
              )}
            </div>

            {/* Test result */}
            {testResults[svc.service] && (
              <div
                role="status"
                className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                  testResults[svc.service].success
                    ? "bg-success/10 text-success"
                    : "bg-oxblood-500/10 text-danger"
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
                    className="flex items-center gap-2 px-4 py-2 bg-oxblood-500/10 text-danger border border-oxblood-500/20 rounded-xl hover:bg-oxblood-500 hover:text-content-strong transition-all text-sm disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </FilaDeConexion>
        ));
      })()}
    </div>
  );
}
