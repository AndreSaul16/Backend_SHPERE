import React, { useEffect, useState } from 'react';
import { CreditCard, Zap, Sparkles, ArrowLeft, Loader2, HardDrive, FileText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBillingStore } from '../store/useBillingStore';
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
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-electric-cyan';
}

/** Extrae un mensaje de error legible de una respuesta HTTP fallida. */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            return json?.detail?.message || json?.detail || json?.message || fallback;
        } catch {
            return text || fallback;
        }
    } catch {
        return fallback;
    }
}

/** Skeleton para el estado de carga del panel de facturación */
const BillingSkeleton: React.FC = () => (
    <div data-testid="billing-loading" className="p-6 sm:p-8 w-full max-w-5xl mx-auto animate-pulse">
        <div className="h-9 bg-surface-highlight/50 rounded-lg w-64 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {[0, 1].map((i) => (
                <div key={i} className="glass-panel p-6 rounded-2xl border border-surface-highlight space-y-4">
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

    const [actionError, setActionError] = useState<string | null>(null);
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
            setActionError('Debes aceptar las condiciones de compra antes de continuar.');
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
                const msg = await readErrorMessage(response, 'No se pudo iniciar el pago. Inténtalo de nuevo.');
                setActionError(msg);
                return;
            }
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                setActionError('Respuesta inesperada del servidor de pagos.');
            }
        } catch {
            // Sin aviso: el mensaje sale bajo los planes, a un palmo del botón
            // que se acaba de pulsar. §11 pide decir además qué se conservó, y
            // en un pago lo que importa es que no se ha cobrado nada.
            setActionError('No se pudo abrir la pasarela de pago. No se te ha cobrado nada; vuelve a intentarlo.');
        } finally {
            setPendingPlan(null);
        }
    };

    const totalBalance = pro_messages_balance + topup_messages_balance;
    const storagePct = storage?.percent_used ?? 0;

    // Loading state: skeleton mientras se obtienen los datos por primera vez
    if (isLoading && !loaded) {
        return <BillingSkeleton />;
    }

    // Error state: mostrar error con botón de reintento
    if (error) {
        return (
            <div className="p-8 w-full max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-6">
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center max-w-md">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-red-400 mb-2">Error de conexión</h2>
                    <p className="text-content-muted mb-6">{error}</p>
                    <button
                        onClick={refresh}
                        className="px-6 py-3 bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30 hover:bg-electric-cyan hover:text-midnight rounded-xl transition-all font-medium"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-midnight/40 overflow-y-auto">
            {/* Header */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center gap-3 bg-midnight/90 backdrop-blur-md sticky top-0 z-10">
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
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-8 flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <p className="text-amber-400 text-sm font-medium">
                            Pagos no disponibles temporalmente. El sistema de pagos no está configurado en este momento.
                        </p>
                    </div>
                )}

                {/* Error de acción (checkout) */}
                {actionError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-8 flex items-center justify-between gap-3">
                        <p className="text-red-400 text-sm">{actionError}</p>
                        <button onClick={() => setActionError(null)} className="text-red-400 hover:text-content-strong text-sm">✕</button>
                    </div>
                )}

                {/* Resumen: Balance de créditos + Almacenamiento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {/* Balance */}
                    <div className="glass-panel p-6 rounded-2xl border border-surface-highlight">
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

                    {/* Almacenamiento de documentos (GridFS) */}
                    <div className="glass-panel p-6 rounded-2xl border border-surface-highlight">
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
                        <label htmlFor="billing-consent" className="flex items-start gap-3 mb-6 p-4 glass-panel rounded-2xl border border-surface-highlight cursor-pointer select-none">
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
                                    className={`glass-panel p-6 rounded-2xl border flex flex-col relative overflow-hidden ${
                                        pack.popular ? 'border-luxury-purple/50' : 'border-surface-highlight'
                                    }`}
                                >
                                    {pack.popular && (
                                        <div className="absolute top-0 right-0 bg-luxury-purple text-white text-micro font-bold px-3 py-1 rounded-bl-lg">
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
                                                ? 'bg-luxury-purple text-white hover:bg-luxury-purple/80'
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
                                <div key={t.id} className="glass-panel p-6 rounded-2xl border border-surface-highlight flex items-center justify-between gap-4">
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
