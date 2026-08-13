import { describe, it, expect, afterEach } from 'vitest';
import { initialSidebarOpen, useChatStore } from '../../src/store/useChatStore';

/**
 * El cajón lateral nacía SIEMPRE abierto, y eso sólo es correcto en `lg+`,
 * donde la barra es fija. Por debajo de 1024px es un cajón sobre velo (§9.13),
 * así que nacer abierto dejaba al usuario de móvil aterrizando en el menú —con
 * el producto tapado— en todas las rutas. Con tráfico mayoritario móvil (§4.3)
 * eso es la primera pantalla de la aplicación.
 */
describe('estado inicial del cajón lateral', () => {
    const realWidth = window.innerWidth;

    const setWidth = (w: number) => {
        Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true });
    };

    afterEach(() => setWidth(realWidth));

    it('nace cerrado a 390px — el usuario aterriza en el producto, no en el menú', () => {
        setWidth(390);
        expect(initialSidebarOpen()).toBe(false);
    });

    it('sigue cerrado justo por debajo de lg (1023px)', () => {
        setWidth(1023);
        expect(initialSidebarOpen()).toBe(false);
    });

    it('nace abierto en lg (1024px), donde la barra es fija', () => {
        setWidth(1024);
        expect(initialSidebarOpen()).toBe(true);
    });

    it('nace abierto en escritorio', () => {
        setWidth(1440);
        expect(initialSidebarOpen()).toBe(true);
    });

    it('el store consume el helper y no un `true` clavado', () => {
        // jsdom arranca en 1024, así que el store del proceso de test nace abierto.
        expect(useChatStore.getState().isSidebarOpen).toBe(initialSidebarOpen());
    });
});
