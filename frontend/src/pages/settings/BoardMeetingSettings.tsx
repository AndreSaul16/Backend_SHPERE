/**
 * Sección Board Meeting: configurar si los agentes discuten entre sí
 * antes de responder. Activar/desactivar, seleccionar iteraciones.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ScheduledBoardsSection } from "./ScheduledBoardsSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

interface BoardSettings {
  board_meeting_enabled: boolean;
  board_iterations: number;
}

export function BoardMeetingSettings() {
  const [settings, setSettings] = useState<BoardSettings>({
    board_meeting_enabled: false,
    board_iterations: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const getAuthToken = async () => {
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) throw new Error("No autenticado");
    return user.getIdToken();
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const resp = await fetch(`${API_URL}/me/board-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error cargando configuración");
      const result = await resp.json();
      setSettings(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!settings.board_meeting_enabled) {
      // Activando: mostrar advertencia
      setShowWarning(true);
      return;
    }

    // Desactivando directamente
    await updateSettings({ board_meeting_enabled: false });
  };

  const confirmEnable = async () => {
    setShowWarning(false);
    await updateSettings({ board_meeting_enabled: true });
  };

  const updateSettings = async (updates: Partial<BoardSettings>) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const resp = await fetch(`${API_URL}/me/board-settings`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || "Error actualizando configuración");
      }
      const result = await resp.json();
      setSettings(result);
      setSuccess("Configuración actualizada");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-content-muted">Cargando...</p>;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
        <Users className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-content-muted">
          <p className="font-medium text-content-strong mb-1">Board Meeting Mode</p>
          <p>
            Cuando está activado, los agentes discuten entre sí antes de responderte.
            El CEO abre la discusión, el CTO, CFO y CMO aportan sus perspectivas,
            y el CEO concluye con una síntesis ejecutiva.
          </p>
          <p className="mt-2">
            Es como un "reasoning con esteroides" — cada agente lee las respuestas
            de los anteriores y construye sobre ellas.
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

      {/* Toggle */}
      <div className="p-5 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-content-strong">Activar Board Meeting</h3>
            <p className="text-xs text-content-muted mt-1">
              Los agentes discutirán entre sí antes de darte una respuesta
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.board_meeting_enabled
                ? "bg-electric-cyan"
                : "bg-surface-highlight"
            } ${saving ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.board_meeting_enabled
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Token cost info — solo cuando está activado */}
        {settings.board_meeting_enabled && (
          <div className="pt-3 border-t border-surface-highlight">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-content-muted">
                <p className="font-medium text-yellow-400 mb-1">Consumo de tokens</p>
                <p>
                  1 iteración = ~5 llamadas al LLM (~15k tokens por mensaje).
                  Todos los directores participan: CEO abre, CTO/CFO/CMO analizan,
                  CEO concluye.
                </p>
                <p className="mt-1">
                  Se activa solo en sesiones de "Junta Directiva". Los chats individuales
                  con agentes específicos no se ven afectados.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Juntas programadas (F3) */}
      <ScheduledBoardsSection />

      {/* §9.4: era un <div> sin role="dialog", sin trampa de foco y sin Escape.
          `destructive={false}` porque activar el debate no destruye nada: es una
          confirmación de coste (§P4), así que el botón es primario, no oxblood. */}
      <ConfirmDialog
        open={showWarning}
        onClose={() => setShowWarning(false)}
        onConfirm={confirmEnable}
        question="¿Activar el debate de la"
        objectName="Junta Directiva"
        consequence={
          <>
            Cada mensaje a la Junta Directiva lo procesan{" "}
            <strong className="text-content-strong">los cuatro directores</strong> (CEO, CTO,
            CFO y CMO) en una ronda: el CEO abre, CTO, CFO y CMO aportan su
            perspectiva y el CEO cierra con una síntesis. Consume más créditos que
            el modo normal, donde responde un solo agente.
          </>
        }
        confirmLabel="Activar"
        confirmLoadingLabel="Activando"
        loading={saving}
        destructive={false}
      />
    </div>
  );
}
