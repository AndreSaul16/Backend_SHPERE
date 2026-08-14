import { useEffect } from "react";
import { Zap } from "lucide-react";
import { useBillingStore } from "@/store/useBillingStore";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Odometro } from "@/components/ui/Odometro";

interface Props {
  className?: string;
  refreshMs?: number;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
};

export function CreditsIndicator({ className = "", refreshMs = 60_000 }: Props) {
  const { plan_id, pro_messages_balance, topup_messages_balance, loaded, error, refresh } =
    useBillingStore();
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
  const planLabel = PLAN_LABELS[plan_id] || plan_id;

  // D33 — el saldo aún no se sabe.
  //
  // El estado inicial del store es `pro=0, topup=0, loaded=false`, así que
  // entre el primer render y el momento en que `refresh()` resuelve —que puede
  // tardar segundos: `waitForAuthReady` espera a Firebase hasta 5s y hay tres
  // reintentos con backoff— esto pintaba «0 — Recargar». Un usuario CON saldo
  // leía que no le quedaba nada y podía acabar recargando de más.
  //
  // La condición mira el total y no sólo `loaded` a propósito: cuando un
  // refresco de fondo falla, el store baja `loaded` a false pero DEJA el saldo
  // anterior en su sitio, y una cifra vieja informa más que un hueco. El único
  // caso en que de verdad no sabemos nada es no haber cargado y no tener cifra.
  const saldoDesconocido = !loaded && total === 0;
  // Y si ya se agotaron los reintentos, seguir enseñando el esqueleto sería
  // otra mentira («sigo cargando»): se dice que no se ha podido consultar.
  const consultaFallida = saldoDesconocido && error !== null;

  const isLow = !saldoDesconocido && total < 10;
  const isZero = !saldoDesconocido && total === 0;
  // §2: `dissent` (oxblood-400, 5.33:1) y `accent` (latón), no los grises y
  // rojos crudos de Tailwind, que no pasan de 2.7:1 sobre el paño.
  const color = saldoDesconocido ? "text-content-muted" : isLow ? "text-dissent" : "text-brass-800 dark:text-accent";

  // §12.6: el saldo cambia SIN interacción —lo refresca un intervalo y cada
  // turno lo consume—, así que hay que anunciarlo. Se anuncia una FRASE, no los
  // dígitos sueltos: un lector que lea «100» y luego «+50» no dice nada.
  // §11: el error dice qué pasó y qué hacer.
  const resumen = consultaFallida
    ? `No se ha podido consultar tu saldo de créditos. Abre facturación para reintentarlo.`
    : saldoDesconocido
      ? `Consultando tu saldo de créditos`
      : isZero
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
      aria-busy={saldoDesconocido && !consultaFallida}
    >
      <Zap className={`h-4 w-4 ${color} shrink-0`} aria-hidden="true" />
      <span className="text-xs font-mono text-content-muted whitespace-nowrap" aria-hidden="true">
        {saldoDesconocido ? (
          // §9.12: la forma del contenido se conoce (una cifra corta), así que
          // esqueleto y no spinner, y con la altura real para que no salte el
          // layout cuando llegue el dato. Si la consulta ya ha fallado del todo,
          // un guion: no sabemos la cifra y no fingimos que sigue viniendo.
          consultaFallida ? (
            <span className="text-content-muted">—</span>
          ) : (
            <span
              data-testid="credits-skeleton"
              className="inline-block h-3 w-8 translate-y-px overflow-hidden rounded-xs bg-baize-850 align-middle"
            >
              <span className="block h-full w-full bg-stroke-hairline animate-(--animate-sweep) motion-reduce:animate-none" />
            </span>
          )
        ) : isZero ? (
          <span className="text-dissent font-medium">0 — Recargar</span>
        ) : (
          /* §8.12 — el saldo es dinero y cambia en vivo: cada turno lo gasta y
             el intervalo de arriba lo refresca. Rodando, el usuario ve QUE se
             ha contabilizado algo; teletransportado, la cifra nueva es
             indistinguible de un repintado. El odómetro además trae los
             números tabulares que a esta línea le faltaban, así que la caja
             deja de bailar al pasar de 9 a 10. */
          <>
            <Odometro valor={pro_messages_balance} />
            {topup_messages_balance > 0 && (
              <> <Odometro valor={topup_messages_balance} prefijo="+" className="text-success" /></>
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
