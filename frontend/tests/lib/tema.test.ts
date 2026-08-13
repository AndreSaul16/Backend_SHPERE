/**
 * 6.11 · D61 — el tema claro deja de ser CSS muerto.
 *
 * Lo que se prueba es la máquina de estados, que es donde están las decisiones:
 * que `system` siga al aparato **en caliente** y que los otros dos no; que lo
 * local mande sobre lo que diga la cuenta; y que un `localStorage` que lanza
 * (Safari privado) no tire la app.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    CLAVE_TEMA,
    adoptarTemaDelPerfil,
    aplicarTema,
    esTema,
    inicializarTema,
    leerTema,
    leerTemaGuardado,
    temaEfectivo,
} from '@/lib/tema';

/** Un `matchMedia` de mentira con interruptor y oyentes de verdad. */
function fingirMatchMedia(claro: boolean) {
    const oyentes = new Set<() => void>();
    const mql = {
        matches: claro,
        addEventListener: (_: string, f: () => void) => oyentes.add(f),
        removeEventListener: (_: string, f: () => void) => oyentes.delete(f),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => mql));
    return {
        cambiarA(nuevoClaro: boolean) {
            mql.matches = nuevoClaro;
            oyentes.forEach((f) => f());
        },
        get oyentes() { return oyentes.size; },
    };
}

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('lectura y validación', () => {
    it('sin nada guardado, el tema es «system»', () => {
        expect(leerTemaGuardado()).toBeNull();
        expect(leerTema()).toBe('system');
    });

    it('la basura del almacén no se cree', () => {
        localStorage.setItem(CLAVE_TEMA, 'neón');
        expect(leerTemaGuardado()).toBeNull();
        expect(leerTema()).toBe('system');
        expect(esTema('neón')).toBe(false);
        expect(esTema('light')).toBe(true);
    });
});

describe('aplicar', () => {
    it('escribe el atributo también para el oscuro, no sólo para el claro', () => {
        aplicarTema('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        aplicarTema('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('«system» se resuelve al del aparato', () => {
        fingirMatchMedia(true);
        aplicarTema('system');
        expect(temaEfectivo('system')).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('recuerda la elección, no el resultado', () => {
        fingirMatchMedia(true);
        aplicarTema('system');
        // Lo guardado es «system»: si guardáramos «light», mañana por la noche
        // el aparato pediría oscuro y la app se quedaría en claro.
        expect(localStorage.getItem(CLAVE_TEMA)).toBe('system');
    });

    it('un almacén que lanza no rompe nada: el tema se aplica igual', () => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };
        try {
            expect(() => aplicarTema('light')).not.toThrow();
            expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        } finally {
            Storage.prototype.setItem = original;
        }
    });

    it('la barra del navegador acompaña al tema', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
        try {
            aplicarTema('light');
            expect(meta.getAttribute('content')).toBe('#F2EDE3');
            aplicarTema('dark');
            expect(meta.getAttribute('content')).toBe('#060F09');
        } finally {
            meta.remove();
        }
    });
});

describe('seguir al sistema en caliente', () => {
    it('en «system», cambiar la preferencia del aparato recolorea sin recargar', () => {
        const media = fingirMatchMedia(false);
        aplicarTema('system');
        const baja = inicializarTema();
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        media.cambiarA(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        baja();
        expect(media.oyentes).toBe(0);
    });

    it('con una elección explícita, el aparato ya no manda', () => {
        const media = fingirMatchMedia(false);
        aplicarTema('dark');
        const baja = inicializarTema();
        media.cambiarA(true);
        // El reloj del móvil no le cambia la pantalla a quien ya eligió.
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        baja();
    });
});

describe('precedencia con el perfil de la cuenta', () => {
    it('un aparato sin elección propia hereda la de la cuenta', () => {
        adoptarTemaDelPerfil('light');
        expect(leerTemaGuardado()).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('un aparato con elección propia NO se deja pisar por la cuenta', () => {
        aplicarTema('dark');
        adoptarTemaDelPerfil('light');
        expect(leerTemaGuardado()).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('un valor imposible del backend se ignora', () => {
        adoptarTemaDelPerfil('turquesa');
        expect(leerTemaGuardado()).toBeNull();
    });
});
