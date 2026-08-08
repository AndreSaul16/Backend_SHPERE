/**
 * Analytics con PostHog (F6).
 *
 * No-op por defecto: si VITE_POSTHOG_KEY no está definido, todas las funciones
 * son inertes (no cargan posthog-js ni hacen peticiones). Esto mantiene el
 * desarrollo local y los tests sin telemetría accidental.
 *
 * Carga perezosa: posthog-js solo se importa (dinámicamente) cuando hay key,
 * siguiendo el patrón de imports dinámicos del repo.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

/** Eventos de negocio que trackeamos. */
export const ANALYTICS_EVENTS = {
    SIGNUP_COMPLETED: "signup_completed",
    FIRST_MESSAGE_SENT: "first_message_sent",
    BOARD_DEBATE_STARTED: "board_debate_started",
    CHECKOUT_STARTED: "checkout_started",
    PURCHASE_COMPLETED: "purchase_completed",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * El cliente de PostHog, reducido a lo único que esta app le pide.
 *
 * Era `Promise<any>`: `posthog-js` trae sus propios tipos, pero importarlos de
 * forma estática arrastraría el paquete al trozo de entrada, que es justo lo
 * que la carga perezosa de abajo evita. Con esta interfaz mínima no hace falta
 * el paquete para tipar, y si mañana se llama a un método que no está aquí, el
 * compilador lo dice en vez de tragárselo.
 */
interface ClienteDeAnalitica {
    capture(evento: string, propiedades?: Record<string, unknown>): void;
    identify(id: string, propiedades?: Record<string, unknown>): void;
    reset(): void;
}

let clientPromise: Promise<ClienteDeAnalitica | null> | null = null;

/** True si hay analytics configurada. Útil para tests y guards. */
export function isAnalyticsEnabled(): boolean {
    return !!KEY;
}

async function getClient(): Promise<ClienteDeAnalitica | null> {
    if (!KEY) return null;
    if (!clientPromise) {
        clientPromise = import("posthog-js")
            .then(({ default: posthog }) => {
                posthog.init(KEY, {
                    api_host: HOST,
                    capture_pageview: true,
                    autocapture: false,
                });
                return posthog;
            })
            .catch(() => null);
    }
    return clientPromise;
}

/** Inicializa PostHog (idempotente). No-op sin key. */
export function initAnalytics(): void {
    if (!KEY) return;
    void getClient();
}

/** Asocia los eventos al uid de Firebase tras el login. No-op sin key. */
export function identify(uid: string, props?: Record<string, unknown>): void {
    if (!KEY || !uid) return;
    void getClient().then((ph) => ph?.identify(uid, props));
}

/** Registra un evento. No-op sin key. */
export function capture(event: AnalyticsEvent, props?: Record<string, unknown>): void {
    if (!KEY) return;
    void getClient().then((ph) => ph?.capture(event, props));
}

/** Limpia la identidad (logout). No-op sin key. */
export function resetAnalytics(): void {
    if (!KEY) return;
    void getClient().then((ph) => ph?.reset());
}
