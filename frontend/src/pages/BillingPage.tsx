import React, { useEffect, useState } from 'react';
import { CreditCard, Zap, Sparkles, ArrowLeft, Loader2, HardDrive, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBillingStore } from '../store/useBillingStore';
import { Button } from '@/components/ui/Button';
import { InlineError, type FalloDeSeccion } from '@/components/ui/InlineError';
import { authHeaders, profileService, type StorageUsage } from '../services/api';
import { capture, ANALYTICS_EVENTS } from '@/lib/analytics';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/** Packs de recarga: compras puntuales de créditos (no caducan). */
const PACKS: Array<{ id: string; name: string; credits: string; price: string; blurb: string; popular?: boolean }> = [
    { id: 'executive', name: 'Executive Pack', credits: '150 créditos', price: '€39', blurb: 'Para seguir trabajando ese mismo día tras quedarte a medias.' },
    { id: 'director', name: 'Director Pack', credits: '500 créditos', price: '€139', blurb: 'Uso recurrente durante la semana. El más popular.', popular: true },
    { id: 'boardroom', name: 'Boardroom Pack', credits: '2.000 créditos', price: '€550', blurb: 'Uso intensivo de herramientas y board completo.' },
];

/** Top-ups rápidos: compras pequeñas de impulso. */
const TOPUPS: Array<{ id: string; name: string; credits: string; price: string; blurb: string }> = [
    { id: 'quick_meeting', name: 'Quick Meeting', credits: '25 créditos', price: '€7,99', blurb: '5 interacciones extra con la Junta completa.' },
    { id: 'deep_dive', name: 'Deep Dive', credits: '50 créditos', price: '€14,99', blurb: '10 interacciones con el board o una investigación con n8n.' },
];

function formatBytes(bytes: number): string {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function barColor(pct: number): string {
    if (pct >= 90) return 'bg-oxblood-500';
    if (pct >= 70) return 'bg-warning';
    return 'bg-electric-cyan';
}

/**
 * Motivo del fallo, SÓLO si el backend lo ha redactado.
 *
 * Esto devolvía `text || fallback`, o sea que un 502 de un proxy pintaba HTML
 * crudo en la pantalla de pagos, y un `detail` de FastAPI escupía la excepción.
 * §11 prohíbe volcar el mensaje crudo del backend: aquí se acepta únicamente
 * `detail.message`, que es el campo que el backend redacta a propósito para que
 * lo lea una persona (ver `services/errorHandler.ts`). Todo lo demás se
 * descarta y el motivo se queda sin decir, que es mejor que decir un volcado.
 */
async function readErrorMessage(response: Response): Promise<string | undefined> {
    try {
        const json = await response.json();
        const msg = json?.detail?.message;
        return typeof msg === 'string' && msg.trim() ? msg : undefined;
    } catch {
        return undefined;
    }
}

/**
 * F7 — cuánto se espera antes de admitir que esto no carga.
 *
 * Una consulta de saldo sana tarda menos de un segundo (`useBillingStore`
 * espera al estado de auth por evento, no sondeando). Ocho segundos son ya el
 * territorio de los reintentos: pasado ese margen, seguir enseñando bloques
 * grises es mentir. Un esqueleto que no termina no dice nada y no ofrece
 * salida; §11 pide decir qué pasó, qué hacer y qué se conservó.
 *
 * No cancela nada: si un reintento tardío acaba trayendo el saldo, la página se
 * pinta con sus datos y esta pantalla desaparece sola.
 */
const ESPERA_MAXIMA_MS = 8000;

/** Skeleton para el estado de carga del panel de facturación */
const BillingSkeleton: React.FC = () => (
    <div data-testid="billing-loading" aria-busy="true" className="p-6 sm:p-8 w-full max-w-5xl mx-auto animate-pulse">
        <div className="h-9 bg-surface-highlight/50 rounded-lg w-64 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {[0, 1].map((i) => (
                <div key={i} className="glass-panel p-6 rounded-md border border-surface-highlight space-y-4">
                    <div className="h-6 bg-surface-highlight/50 rounded w-40" />
                    <div className="h-10 bg-surface-highlight/50 rounded w-24" />
                    <div className="h-4 bg-surface-highlight/50 rounded w-32" />
                </div>
            ))}
        </div>
    </div>
);

export const BillingPage: React.FC = () => {
    const {
        pro_messages_balance,
        topup_messages_balance,
        loaded,
        isLoading,
        error,
        stripe_configured,
        refresh,
    } = useBillingStore();

    // Redactado aquí, con su «no se te ha cobrado nada»: en una pantalla de
    // pagos eso es lo primero que el usuario necesita saber.
    const [actionError, setActionError] = useState<FalloDeSeccion | null>(null);
    // F7: se agotó la espera del esqueleto (ver `ESPERA_MAXIMA_MS`).
    const [tardaDemasiado, setTardaDemasiado] = useState(false);
    const [pendingPlan, setPendingPlan] = useState<string | null>(null);
    const [storage, setStorage] = useState<StorageUsage | null>(null);
    // Consentimiento UE (servicios digitales de ejecución inmediata): sin marcar
    // la casilla no se puede iniciar ningún checkout.
    const [consentAccepted, setConsentAccepted] = useState(false);

    useEffect(() => {
        refresh();
        profileService.getStorage().then(setStorage).catch(() => setStorage(null));
        // Si volvemos de Stripe (success=true), refrescamos varias veces
        // porque el webhook puede tardar unos segundos en procesar el pago.
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            capture(ANALYTICS_EVENTS.PURCHASE_COMPLETED);
            const intervals = [2000, 5000, 10000];
            intervals.forEach((ms) => setTimeout(() => refresh(), ms));
        }
    }, [refresh]);

    const handleCheckout = async (planId: string) => {
        if (pendingPlan) return;
        if (!consentAccepted) {
            setActionError({
                title: 'Falta aceptar las condiciones de compra',
                detail: 'Marca la casilla de arriba y vuelve a elegir tu plan. No se ha iniciado ningún pago.',
                tone: 'warning',
            });
            return;
        }
        setActionError(null);
        setPendingPlan(planId);
        capture(ANALYTICS_EVENTS.CHECKOUT_STARTED, { plan_id: planId });
        try {
            const headers = await authHeaders();
            const response = await fetch(`${API_URL}/billing/checkout`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ plan_id: planId }),
            });
            if (!response.ok) {
                setActionError({
                    title: 'No se ha podido iniciar el pago',
                    detail: 'No se te ha cobrado nada y tu plan sigue igual. Vuelve a elegirlo dentro de un momento.',
                    reason: await readErrorMessage(response),
                    onDismiss: () => setActionError(null),
                });
                return;
            }
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                setActionError({
                    title: 'La pasarela de pago no ha respondido como esperábamos',
                    detail: 'No se te ha cobrado nada. Vuelve a intentarlo; si se repite, escríbenos antes de reintentar más veces.',
                    onDismiss: () => setActionError(null),
                });
            }
        } catch {
            // Sin aviso: el mensaje sale bajo los planes, a un palmo del botón
            // que se acaba de pulsar. §11 pide decir además qué se conservó, y
            // en un pago lo que importa es que no se ha cobrado nada.
            setActionError({
                title: 'No se ha podido abrir la pasarela de pago',
                detail: 'No se te ha cobrado nada y tu plan sigue igual. Vuelve a intentarlo.',
                onDismiss: () => setActionError(null),
            });
        } finally {
            setPendingPlan(null);
        }
    };

    const totalBalance = pro_messages_balance + topup_messages_balance;
    const storagePct = storage?.percent_used ?? 0;

    const cargandoPorPrimeraVez = isLoading && !loaded;

    // F7: el esqueleto tiene cuenta atrás. Sin ella, una consulta que no
    // termina —dos `refresh()` solapados bastaban— dejaba la pantalla en tres
    // bloques grises para siempre: sin mensaje, sin reintento y sin salida.
    useEffect(() => {
        if (!cargandoPorPrimeraVez) {
            setTardaDemasiado(false);
            return;
        }
        const id = setTimeout(() => setTardaDemasiado(true), ESPERA_MAXIMA_MS);
        return () => clearTimeout(id);
    }, [cargandoPorPrimeraVez]);

    // Loading state: skeleton mientras se obtienen los datos por primera vez
    if (cargandoPorPrimeraVez && !tardaDemasiado) {
        return <BillingSkeleton />;
    }

    // Sin nada que enseñar: o falló, o lleva demasiado esperando. Los dos casos
    // acaban en la misma salida, que es lo único útil aquí — decirlo y ofrecer
    // reintentar (§11). Si YA hay datos cargados la página se pinta igual y el
    // fallo se cuenta arriba en una banda, en vez de esconder el saldo.
    if ((error || tardaDemasiado) && !loaded) {
        return (
            <div className="p-8 w-full max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-6">
                <div className="bg-dissent/12 border border-dissent/30 rounded-md p-8 text-center max-w-md">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm border border-dissent/40 text-dissent">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h2 className="text-xl font-bold text-content-strong mb-2">No hemos podido cargar tus créditos</h2>
                    <p className="text-content-muted mb-6">
                        {error
                            ? 'El servidor de facturación no responde. Tu saldo y tus compras no han cambiado.'
                            : 'La consulta está tardando más de lo normal. Tu saldo y tus compras no han cambiado.'}
                    </p>
                    <Button onClick={() => { setTardaDemasiado(false); void refresh(); }}>
                        Reintentar
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-midnight/40 overflow-y-auto">
            {/* Header */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center gap-3 bg-surface-0 sticky top-0 z-10">
                <Link to="/" className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-base sm:text-xl font-bold text-content-strong flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-electric-cyan" />
                    Créditos y Facturación
                </h1>
            </div>

            <div className="flex-1 p-4 sm:p-8 w-full max-w-5xl mx-auto">
                {/* Aviso: Stripe no configurado */}
                {!stripe_configured && (
                    <div className="bg-warning/10 border border-warning/30 rounded-md p-4 mb-8 flex items-center gap-3">
                        {/* D53 · §10: glifo de línea, no emoji. El emoji lo pinta
                            cada sistema operativo con su propia paleta a todo
                            color, y aquí choca con el ámbar del aviso. */}
                        <AlertTriangle className="h-6 w-6 shrink-0 text-warning" aria-hidden="true" />
                        <p className="text-warning text-sm font-medium">
                            Pagos no disponibles temporalmente. El sistema de pagos no está configurado en este momento.
                        </p>
                    </div>
                )}

                {/* F7: si el saldo ya estaba cargado, un refresco fallido no
                    esconde la página — la envejece. Se dice, con salida. */}
                {error && loaded && (
                    <div className="bg-warning/10 border border-warning/30 rounded-md p-4 mb-8 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-warning text-sm">
                            Estas cifras pueden no estar al día: no hemos podido consultar tu saldo.
                        </p>
                        <Button variant="ghost" onClick={() => { void refresh(); }}>Reintentar</Button>
                    </div>
                )}

                {/* Error de acción (checkout) */}
                {actionError && <InlineError className="mb-8" {...actionError} />}

                {/* Resumen: Balance de créditos + Almacenamiento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {/* Balance */}
                    <div className="glass-panel p-6 rounded-md border border-surface-highlight">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="h-4 w-4 text-electric-cyan" />
                            <h2 className="text-xs uppercase tracking-widest font-mono text-content-muted">Tus Créditos</h2>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-baseline">
                                <span className="text-content-muted text-sm">Plan Free (30/mes)</span>
                                <span className="text-2xl font-bold text-content-strong">{pro_messages_balance}</span>
                            </div>
                            <div className="flex justify-between items-baseline">
                                <span className="text-content-muted text-sm">Comprados</span>
                                <span className="text-2xl font-bold text-electric-cyan">{topup_messages_balance}</span>
                            </div>
                            <div className="border-t border-surface-highlight pt-3 flex justify-between items-baseline">
                                <span className="text-content-strong font-medium">Total disponible</span>
                                <span className="text-3xl font-bold text-content-strong">{totalBalance}</span>
                            </div>
                        </div>
                    </div>

                    {/* Almacenamiento de documentos (GridFS).
                        El `id` no es decorativo: es el destino de la razón
                        `rag_full` del muro (6.3), que trae aquí a quien se ha
                        quedado sin espacio. `scroll-mt-20` lo despega de la
                        cabecera adherida al saltar. */}
                    <div id="almacenamiento" className="glass-panel p-6 rounded-md border border-surface-highlight scroll-mt-20">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <HardDrive className="h-4 w-4 text-luxury-purple" />
                                <h2 className="text-xs uppercase tracking-widest font-mono text-content-muted">Almacenamiento</h2>
                            </div>
                            <button
                                onClick={() => profileService.getStorage().then(setStorage).catch(() => {})}
                                className="p-1.5 text-content-muted hover:text-electric-cyan transition-colors"
                                title="Actualizar"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {storage ? (
                            <div className="space-y-3">
                                <div className="flex items-end justify-between text-sm">
                                    <span className="text-content-strong font-mono">
                                        {formatBytes(storage.used_bytes)} <span className="text-content-muted">/ {formatBytes(storage.quota_bytes)}</span>
                                    </span>
                                    <span className="text-content-muted text-xs font-mono">{storagePct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2.5 bg-midnight/50 rounded-full overflow-hidden border border-surface-highlight">
                                    <div className={`h-full rounded-full transition-all ${barColor(storagePct)}`} style={{ width: `${storagePct}%` }} />
                                </div>
                                <div className="flex items-center gap-2 text-xs text-content-muted">
                                    <FileText className="h-3.5 w-3.5" />
                                    {storage.file_count} {storage.file_count === 1 ? 'documento' : 'documentos'} en tus agentes
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-content-muted">No se pudo obtener el uso de almacenamiento.</p>
                        )}
                    </div>
                </div>

                {/* Catálogo: solo si Stripe está configurado */}
                {stripe_configured && (
                    <>
                        <h2 className="text-lg font-bold mb-1 text-content-strong">Packs de recarga</h2>
                        <p className="text-xs text-content-muted mb-4">
                            1 mensaje a un agente = 1 crédito · 1 mensaje al Consejo (board meeting) = 5 créditos. Los créditos comprados no caducan.
                        </p>

                        {/* Consentimiento UE: ejecución inmediata + renuncia al desistimiento */}
                        <label htmlFor="billing-consent" className="flex items-start gap-3 mb-6 p-4 glass-panel rounded-md border border-surface-highlight cursor-pointer select-none">
                            <input
                                id="billing-consent"
                                type="checkbox"
                                checked={consentAccepted}
                                onChange={(e) => setConsentAccepted(e.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                            />
                            <span className="text-xs text-content-muted leading-relaxed">
                                Solicito que los créditos se abonen en mi cuenta inmediatamente tras el pago y{' '}
                                <span className="text-content-strong font-medium">
                                    acepto perder mi derecho de desistimiento de 14 días
                                </span>{' '}
                                una vez comience la ejecución del servicio digital (art. 103.m LGDCU / Directiva 2011/83/UE).
                            </span>
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
                            {PACKS.map((pack) => (
                                <div
                                    key={pack.id}
                                    className={`glass-panel p-6 rounded-md border flex flex-col relative overflow-hidden ${
                                        pack.popular ? 'border-luxury-purple/50' : 'border-surface-highlight'
                                    }`}
                                >
                                    {pack.popular && (
                                        <div className="absolute top-0 right-0 bg-luxury-purple text-content-strong text-micro font-bold px-3 py-1 rounded-bl-lg">
                                            POPULAR
                                        </div>
                                    )}
                                    <h3 className="text-lg font-bold mb-1 text-content-strong">{pack.name}</h3>
                                    <p className="text-sm text-electric-cyan font-medium mb-2">{pack.credits}</p>
                                    <p className="text-3xl font-bold mb-3 text-content-strong">{pack.price}</p>
                                    <p className="text-content-muted text-sm mb-8 flex-1">{pack.blurb}</p>
                                    <button
                                        onClick={() => handleCheckout(pack.id)}
                                        disabled={pendingPlan === pack.id || !consentAccepted}
                                        title={!consentAccepted ? 'Acepta las condiciones de compra para continuar' : undefined}
                                        className={`w-full py-2.5 rounded-xl transition-all font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                            pack.popular
                                                ? 'bg-luxury-purple text-content-strong hover:bg-luxury-purple/80'
                                                : 'bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 hover:bg-electric-cyan hover:text-midnight'
                                        }`}
                                    >
                                        {pendingPlan === pack.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Comprar
                                    </button>
                                </div>
                            ))}
                        </div>

                        <h2 className="text-lg font-bold mb-2 text-content-strong flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-electric-cyan" />
                            Top-ups rápidos
                        </h2>
                        <p className="text-sm text-content-muted mb-6">Recargas pequeñas para cuando solo necesitas un empujón.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {TOPUPS.map((t) => (
                                <div key={t.id} className="glass-panel p-6 rounded-md border border-surface-highlight flex items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-base font-bold text-content-strong">{t.name}</h3>
                                        <p className="text-sm text-electric-cyan font-medium">{t.credits}</p>
                                        <p className="text-xs text-content-muted mt-1">{t.blurb}</p>
                                    </div>
                                    <button
                                        onClick={() => handleCheckout(t.id)}
                                        disabled={pendingPlan === t.id || !consentAccepted}
                                        title={!consentAccepted ? 'Acepta las condiciones de compra para continuar' : undefined}
                                        className="shrink-0 px-4 py-2.5 bg-surface-highlight hover:bg-surface-highlight/70 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold flex items-center gap-2 text-content-strong transition-colors"
                                    >
                                        {pendingPlan === t.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {t.price}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
