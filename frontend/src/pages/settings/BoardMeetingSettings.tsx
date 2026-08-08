/**
 * Sección Board Meeting: configurar si los agentes discuten entre sí
 * antes de responder. Activar/desactivar, seleccionar iteraciones.
 *
 * D47: el ajuste NO vive aquí. Vive en `useBoardSettingsStore`, que es el único
 * dueño del valor, porque `ChatSettingsPage` pinta el mismo interruptor y con
 * dos estados locales las dos pantallas podían enseñar posiciones contrarias
 * del mismo ajuste. Aquí sólo queda lo que es de esta pantalla: la advertencia
 * de coste y el rótulo de «guardado».
 */
import { useEffect, useState } from "react";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { ScheduledBoardsSection } from "./ScheduledBoardsSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineError } from "@/components/ui/InlineError";
import { useBoardSettingsStore } from "@/store/useBoardSettingsStore";

export function BoardMeetingSettings() {
  const { enabled, loaded, loading, saving, error, load, setEnabled } =
    useBoardSettingsStore();
  const [success, setSuccess] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!enabled) {
      // Activando: mostrar advertencia
      setShowWarning(true);
      return;
    }

    // Desactivando directamente
    await guardar(false);
  };

  const confirmEnable = async () => {
    setShowWarning(false);
    await guardar(true);
  };

  const guardar = async (valor: boolean) => {
    setSuccess(null);
    // §11: éxito en pasado, corto, sin exclamación.
    if (await setEnabled(valor)) setSuccess("Configuración guardada");
  };

  // Sólo el primer arranque muestra «Cargando»: un refresco posterior no puede
  // borrar de la pantalla un ajuste que ya se sabe.
  if (loading && !loaded) return <p className="text-content-muted">Cargando...</p>;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className="flex items-start gap-3 p-4 rounded-md border border-stroke-edge bg-surface-2">
        <Users className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="text-sm text-content-muted">
          <p className="font-medium text-content-strong mb-1">Modo junta directiva</p>
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
        <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/30 text-success">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <InlineError
          title={error.title}
          detail={error.detail}
          onRetry={() => { void load(); }}
          retryLabel="Volver a consultarlo"
        />
      )}

      {/* Toggle */}
      <div className="p-5 rounded-md bg-surface/30 border border-surface-highlight space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-content-strong">Activar la junta directiva</h3>
            <p className="text-xs text-content-muted mt-1">
              Los agentes discutirán entre sí antes de darte una respuesta
            </p>
          </div>
          {/* §12.7: un interruptor es `role="switch"` con `aria-checked`. */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Debate entre agentes antes de responder"
            aria-busy={saving}
            onClick={handleToggle}
            disabled={saving}
            data-testid="board-toggle-settings"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-electric-cyan" : "bg-surface-highlight"
            } ${saving ? "opacity-50" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Token cost info — solo cuando está activado */}
        {enabled && (
          <div className="pt-3 border-t border-surface-highlight">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="text-xs text-content-muted">
                <p className="font-medium text-warning mb-1">Consumo de tokens</p>
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
