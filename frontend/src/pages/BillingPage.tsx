import React, { useEffect, useState } from 'react';
import { CreditCard, Zap, Sparkles, ArrowLeft, HardDrive, FileText, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBillingStore, skuComprable } from '../store/useBillingStore';
import { Button } from '@/components/ui/Button';
import { RUTA_DE_INICIO } from '@/lib/rutas';
import { InlineError, type FalloDeSeccion } from '@/components/ui/InlineError';
import { Odometro } from '@/components/ui/Odometro';
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

/** `id` de la casilla de consentimiento UE. Es el destino del aviso de los top-ups. */
const ID_CASILLA_CONSENTIMIENTO = 'billing-consent';

/**
 * QA-3 — llevar a quien lee el aviso hasta la casilla que lo desbloquea.
 *
 * La casilla vive en la sección de packs, unas cincuenta líneas de página más
 * arriba, y la sección de top-ups no la mencionaba: sus botones nacían
 * deshabilitados y el único motivo estaba en un `title`, que un botón
 * deshabilitado no muestra en ningún navegador. Enfocar además de desplazar no
 * es adorno: quien navega por teclado necesita el foco ahí, no la vista ahí.
 *
 * `scrollIntoView` se llama con encadenamiento opcional porque jsdom no lo
 * implementa, y perder el foco por eso sería cambiar comportamiento real para
 * complacer al entorno de test.
 */
function irALaCasillaDeConsentimiento(): void {
    const casilla = document.getElementById(ID_CASILLA_CONSENTIMIENTO);
    casilla?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    casilla?.focus();
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

/**
 * QA-3 — lo que se dice de un SKU que el backend no puede cobrar.
 *
 * Los `STRIPE_PRICE_*` viven en el entorno con default `""` y nadie los valida
 * al arranque, así que el catálogo se podía pintar entero comprable con cero
 * precios configurados. El motivo va en TEXTO, no en un `title`: el botón está
 * deshabilitado, y sobre un botón deshabilitado ningún navegador pinta el
 * tooltip.
 */
const MOTIVO_SIN_PRECIO = 'Pago no disponible temporalmente';

const AvisoSinPrecio: React.FC = () => (
    <p className="mt-2 text-xs text-warning">{MOTIVO_SIN_PRECIO}</p>
);

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
        purchasable_skus,
        refresh,
    } = useBillingStore();

    // Redactado aquí, con su «no se te ha cobrado nada»: en una pantalla de
    // pagos eso es lo primero que el usuario necesita saber.
    const [actionError, setActionError] = useState<FalloDeSeccion | null>(null);
    // F7: se agotó la espera del esqueleto (ver `ESPERA_MAXIMA_MS`).
    const [tardaDemasiado, setTardaDemasiado] = useState(false);
    const [pendingPlan, setPendingPlan] = useState<string | null>(null);
    // 6.10: el portal de Stripe. `POST /billing/portal` existía en el backend
    // desde el principio y no lo llamaba nadie: quien había comprado no tenía
    // dónde ver sus facturas ni cambiar su método de pago.
    const [abriendoPortal, setAbriendoPortal] = useState(false);
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
        /* D49 — estos tres temporizadores no se cancelaban nunca. Salir de
           facturación antes de diez segundos —que es lo normal: se mira el
           saldo y se vuelve al chat— dejaba tres peticiones pendientes
           escribiendo en un store cuya pantalla ya no existe. */
        const pendientes: ReturnType<typeof setTimeout>[] = [];
        if (params.get('success') === 'true') {
            capture(ANALYTICS_EVENTS.PURCHASE_COMPLETED);
            for (const ms of [2000, 5000, 10000]) {
                pendientes.push(setTimeout(() => refresh(), ms));
            }
        }
        return () => { pendientes.forEach(clearTimeout); };
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

    /**
     * 6.10 — abrir el portal de facturación de Stripe.
     *
     * Aquí sí se sale con `window.location.href`, y a propósito: el destino es
     * un dominio de Stripe, no una ruta del SPA. Lo que no puede pasar es lo de
     * `PaywallModal` —una recarga para ir a una página propia—; salir del sitio
     * a la pasarela es exactamente lo que se pretende.
     *
     * El 404 tiene su propio mensaje: significa «esta cuenta nunca ha comprado
     * nada», que no es un fallo sino un estado, y decirle «ha fallado» a quien
     * simplemente no tiene facturas es mentirle.
     */
    const abrirPortal = async () => {
        if (abriendoPortal) return;
        setActionError(null);
        setAbriendoPortal(true);
        try {
            const headers = await authHeaders();
            const response = await fetch(`${API_URL}/billing/portal`, { method: 'POST', headers });
            if (response.status === 404) {
                setActionError({
                    title: 'Todavía no tienes facturación que gestionar',
                    detail:
                        'El portal aparece en cuanto haces tu primera compra: es donde Stripe guarda tus facturas y tu método de pago. Tus créditos gratuitos no pasan por él.',
                    tone: 'warning',
                    onDismiss: () => setActionError(null),
                });
                return;
            }
            if (!response.ok) {
                setActionError({
                    title: 'No se ha podido abrir el portal de facturación',
                    detail: 'No se te ha cobrado nada y tus datos de pago siguen igual. Vuelve a intentarlo.',
                    reason: await readErrorMessage(response),
                    onRetry: () => { void abrirPortal(); },
                    retryLabel: 'Volver a intentarlo',
                });
                return;
            }
            const data = await response.json();
            if (typeof data?.url === 'string' && data.url) {
                window.location.href = data.url;
            } else {
                setActionError({
                    title: 'El portal de facturación no ha respondido como esperábamos',
                    detail: 'No se te ha cobrado nada. Vuelve a intentarlo dentro de un momento.',
                    onRetry: () => { void abrirPortal(); },
                    retryLabel: 'Volver a intentarlo',
                });
            }
        } catch {
            setActionError({
                title: 'No se ha podido abrir el portal de facturación',
                detail: 'No se te ha cobrado nada y tus datos de pago siguen igual. Comprueba tu conexión y vuelve a intentarlo.',
                onRetry: () => { void abrirPortal(); },
                retryLabel: 'Volver a intentarlo',
            });
        } finally {
            setAbriendoPortal(false);
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
                <Link to={RUTA_DE_INICIO} aria-label="Volver al chat" className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong">
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
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
                    {/* Balance — 6.10: el total es LA cifra, no el tercer
                        renglón de una lista. La pregunta que trae a alguien a
                        esta página es «¿cuánto me queda?», y estaba escrita al
                        mismo tamaño que sus dos sumandos y debajo de ellos. */}
                    <div className="glass-panel p-6 rounded-md border border-surface-highlight">
                        <div className="flex items-center gap-2 mb-4">
                            <Zap className="h-4 w-4 text-electric-cyan" aria-hidden="true" />
                            <h2 className="text-xs uppercase tracking-widest font-mono text-content-muted">Tus Créditos</h2>
                        </div>
                        <p className="flex items-baseline gap-2">
                            {/* §8.12 — es LA cifra de esta pantalla, y la
                                pantalla existe para cambiarla: se recarga y el
                                saldo sube. Rodando, la recarga se ve ocurrir. */}
                            <Odometro
                                valor={totalBalance}
                                className="text-5xl font-semibold text-content-strong sm:text-6xl"
                            />
                            <span className="text-sm text-content-muted">
                                {totalBalance === 1 ? 'crédito disponible' : 'créditos disponibles'}
                            </span>
                        </p>
                        <dl className="mt-4 space-y-1.5 border-t border-surface-highlight pt-3 text-sm">
                            <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-content-muted">Del plan gratuito (30/mes)</dt>
                                <dd className="font-mono tabular-nums text-content">{pro_messages_balance}</dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-content-muted">Comprados (no caducan)</dt>
                                <dd className="font-mono tabular-nums text-content">{topup_messages_balance}</dd>
                            </div>
                        </dl>

                        {/* 6.10 · El portal de Stripe. El endpoint existía desde
                            el principio y no lo llamaba nadie: quien compraba no
                            tenía dónde ver sus facturas ni cambiar su tarjeta. */}
                        {stripe_configured && (
                            <Button
                                variant="secondary"
                                size="sm"
                                className="mt-4 w-full"
                                onClick={() => { void abrirPortal(); }}
                                loading={abriendoPortal}
                                loadingLabel="Abriendo el portal"
                            >
                                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                Facturas y método de pago
                            </Button>
                        )}
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
                                {/* §12: una barra que sólo existe como ancho de
                                    un div no existe para quien no la ve. Con
                                    `role="progressbar"` y su `aria-valuetext`,
                                    el lector dice «Almacenamiento, 43% usado,
                                    430 MB de 1 GB» en vez de callarse. */}
                                <div
                                    role="progressbar"
                                    aria-label="Almacenamiento usado"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(storagePct)}
                                    aria-valuetext={`${storagePct.toFixed(1)} % usado — ${formatBytes(storage.used_bytes)} de ${formatBytes(storage.quota_bytes)}`}
                                    className="h-2.5 bg-surface-inset rounded-full overflow-hidden border border-surface-highlight"
                                >
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
                        <label htmlFor={ID_CASILLA_CONSENTIMIENTO} className="flex items-start gap-3 mb-6 p-4 glass-panel rounded-md border border-surface-highlight cursor-pointer select-none scroll-mt-20">
                            <input
                                id={ID_CASILLA_CONSENTIMIENTO}
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
                            {PACKS.map((pack) => {
                                const comprable = skuComprable(pack.id, purchasable_skus);
                                return (
                                <div
                                    key={pack.id}
                                    className={`glass-panel p-6 rounded-md border flex flex-col relative overflow-hidden ${
                                        pack.popular ? 'border-luxury-purple/50' : 'border-surface-highlight'
                                    }`}
                                >
                                    {pack.popular && (
                                        <div className="absolute top-0 right-0 bg-luxury-purple text-baize-950 text-micro font-bold px-3 py-1 rounded-bl-lg">
                                            POPULAR
                                        </div>
                                    )}
                                    <h3 className="text-lg font-bold mb-1 text-content-strong">{pack.name}</h3>
                                    <p className="text-sm text-electric-cyan font-medium mb-2">{pack.credits}</p>
                                    <p className="text-3xl font-bold mb-3 text-content-strong">{pack.price}</p>
                                    <p className="text-content-muted text-sm mb-8 flex-1">{pack.blurb}</p>
                                    {/* QA-3 · §9.1: el CTA es el botón del sistema
                                        en latón, no dos juegos de clases del shim
                                        legado (`bg-luxury-purple`,
                                        `bg-electric-cyan/10`) que §2.3 retiró. El
                                        distintivo de «popular» lo llevan la placa
                                        y el filete de la tarjeta, no el botón: la
                                        acción primaria tiene UN solo aspecto. */}
                                    <Button
                                        variant="primary"
                                        className="w-full"
                                        aria-label={`Comprar ${pack.name}`}
                                        onClick={() => handleCheckout(pack.id)}
                                        disabled={!consentAccepted || !comprable}
                                        loading={pendingPlan === pack.id}
                                        loadingLabel="Abriendo el pago"
                                    >
                                        Comprar
                                    </Button>
                                    {!comprable && <AvisoSinPrecio />}
                                </div>
                                );
                            })}
                        </div>

                        <h2 className="text-lg font-bold mb-2 text-content-strong flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-electric-cyan" />
                            Top-ups rápidos
                        </h2>
                        <p className="text-sm text-content-muted mb-4">Recargas pequeñas para cuando solo necesitas un empujón.</p>

                        {/* QA-3 · el motivo por el que estos botones nacen
                            deshabilitados, dicho aquí y en texto. La casilla que
                            los desbloquea está en la sección de packs, fuera de
                            la vista, y el `title` que lo explicaba no lo pinta
                            ningún navegador en un botón deshabilitado. */}
                        {!consentAccepted && (
                            <p className="mb-6 text-sm text-warning">
                                Marca las condiciones de compra para activar estos botones.{' '}
                                <Button variant="link" onClick={irALaCasillaDeConsentimiento}>
                                    Ir a la casilla
                                </Button>
                            </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {TOPUPS.map((t) => {
                                const comprable = skuComprable(t.id, purchasable_skus);
                                return (
                                <div key={t.id} className="glass-panel p-6 rounded-md border border-surface-highlight flex items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-base font-bold text-content-strong">{t.name}</h3>
                                        <p className="text-sm text-electric-cyan font-medium">{t.credits}</p>
                                        {/* QA-3 · el precio, en su propio elemento
                                            como en los packs. Era la etiqueta del
                                            botón: un precio no es una acción, y
                                            nadie deduce de «€7,99» que eso se pulsa. */}
                                        <p className="text-2xl font-bold mt-1 text-content-strong">{t.price}</p>
                                        <p className="text-xs text-content-muted mt-1">{t.blurb}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <Button
                                            variant="primary"
                                            aria-label={`Comprar ${t.name}`}
                                            onClick={() => handleCheckout(t.id)}
                                            disabled={!consentAccepted || !comprable}
                                            loading={pendingPlan === t.id}
                                            loadingLabel="Abriendo el pago"
                                        >
                                            Comprar
                                        </Button>
                                        {!comprable && <AvisoSinPrecio />}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
