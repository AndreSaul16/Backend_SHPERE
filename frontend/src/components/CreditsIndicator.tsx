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
  const color = isLow ? "text-red-400" : "text-electric-cyan";
  const planLabel = PLAN_LABELS[plan_id] || plan_id;

  return (
    <div
      onClick={() => navigate('/billing')}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 bg-surface/40 hover:bg-surface/60 border border-surface-highlight rounded-xl cursor-pointer transition-colors",
        isZero && "border-rose-500/30 bg-rose-500/5",
        className
      )}
      title={`Créditos del plan: ${pro_messages_balance} (30 gratis cada mes) · Comprados: ${topup_messages_balance} (no caducan) · Clic para recargar`}
      data-testid="credits-indicator"
    >
      <Zap className={`h-4 w-4 ${color} shrink-0`} />
      <span className="text-xs font-mono text-content-muted whitespace-nowrap">
        {isZero ? (
          <span className="text-rose-400 font-medium">0 — Recargar</span>
        ) : (
          <>
            {pro_messages_balance}
            {topup_messages_balance > 0 && (
              <> <span className="text-emerald-400">+{topup_messages_balance}</span></>
            )}
          </>
        )}
        {" "}
        <span className={cn("text-[10px] uppercase tracking-wider", isLow ? "text-red-400/60" : "text-content-quiet")}>
          {planLabel}
        </span>
      </span>
    </div>
  );
}
