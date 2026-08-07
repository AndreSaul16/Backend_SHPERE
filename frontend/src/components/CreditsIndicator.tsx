import { useEffect } from "react";
import { Zap } from "lucide-react";
import { useBillingStore } from "@/store/useBillingStore";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  refreshMs?: number;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
};

export function CreditsIndicator({ className = "", refreshMs = 60_000 }: Props) {
  const { plan_id, pro_messages_balance, topup_messages_balance, refresh } = useBillingStore();
  const navigate = useNavigate();

  useEffect(() => {
    refresh();
    // A19: no sondear con la pestaña oculta; al volver, refrescar de inmediato.
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, refreshMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshMs]);

  const total = pro_messages_balance + topup_messages_balance;
  const isLow = total < 10;
  const isZero = total === 0;
  // §2: `dissent` (oxblood-400, 5.33:1) y `accent` (latón), no los grises y
  // rojos crudos de Tailwind, que no pasan de 2.7:1 sobre el paño.
  const color = isLow ? "text-dissent" : "text-accent";
  const planLabel = PLAN_LABELS[plan_id] || plan_id;

  // §12.6: el saldo cambia SIN interacción —lo refresca un intervalo y cada
  // turno lo consume—, así que hay que anunciarlo. Se anuncia una FRASE, no los
  // dígitos sueltos: un lector que lea «100» y luego «+50» no dice nada.
  const resumen = isZero
    ? `Sin créditos en el plan ${planLabel}. Recarga para seguir convocando juntas.`
    : `${pro_messages_balance} créditos del plan${
        topup_messages_balance > 0 ? ` y ${topup_messages_balance} comprados` : ''
      } · plan ${planLabel}`;

  return (
    // D14/§12.4: era un `<div onClick>`, o sea el acceso a recargar créditos no
    // existía por teclado. Un <button> trae foco, Enter y Espacio de serie.
    <button
      type="button"
      onClick={() => navigate('/billing')}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 bg-surface/40 hover:bg-surface/60 border border-surface-highlight rounded-xl cursor-pointer transition-colors",
        isZero && "border-dissent/30 bg-dissent/5",
        className
      )}
      data-testid="credits-indicator"
    >
      <Zap className={`h-4 w-4 ${color} shrink-0`} aria-hidden="true" />
      <span className="text-xs font-mono text-content-muted whitespace-nowrap" aria-hidden="true">
        {isZero ? (
          <span className="text-dissent font-medium">0 — Recargar</span>
        ) : (
          <>
            {pro_messages_balance}
            {topup_messages_balance > 0 && (
              <> <span className="text-success">+{topup_messages_balance}</span></>
            )}
          </>
        )}
        {" "}
        <span className={cn("text-micro uppercase", isLow ? "text-dissent" : "text-content-muted")}>
          {planLabel}
        </span>
      </span>
      {/* El desglose era sólo un `title`, que §9.6 prohíbe como única fuente de
          un dato y que en táctil no aparece nunca. Ahora es texto real, y la
          misma región lo anuncia cuando cambia. */}
      <span className="sr-only" aria-live="polite">
        {resumen}. Ir a recargar.
      </span>
    </button>
  );
}
