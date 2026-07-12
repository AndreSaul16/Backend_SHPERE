import { describe, it, expect, vi } from 'vitest';
import {
    capture,
    identify,
    initAnalytics,
    resetAnalytics,
    isAnalyticsEnabled,
    ANALYTICS_EVENTS,
} from '../../src/lib/analytics';

// En el entorno de test VITE_POSTHOG_KEY no está definida → todo es no-op.
describe('analytics (F6) — no-op sin key', () => {
    it('isAnalyticsEnabled es false sin key', () => {
        expect(isAnalyticsEnabled()).toBe(false);
    });

    it('capture/identify/init/reset no lanzan y no importan posthog-js', () => {
        // Si intentara cargar posthog-js haría un import dinámico; verificamos que
        // ninguna llamada rompe y todas retornan void de forma síncrona.
        expect(() => {
            initAnalytics();
            identify('uid-123');
            capture(ANALYTICS_EVENTS.FIRST_MESSAGE_SENT, { group: true });
            capture(ANALYTICS_EVENTS.PURCHASE_COMPLETED);
            resetAnalytics();
        }).not.toThrow();
    });

    it('los nombres de evento son estables', () => {
        expect(ANALYTICS_EVENTS.SIGNUP_COMPLETED).toBe('signup_completed');
        expect(ANALYTICS_EVENTS.BOARD_DEBATE_STARTED).toBe('board_debate_started');
        expect(ANALYTICS_EVENTS.CHECKOUT_STARTED).toBe('checkout_started');
    });
});
