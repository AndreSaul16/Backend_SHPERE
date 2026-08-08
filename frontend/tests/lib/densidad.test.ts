import { describe, it, expect, beforeEach } from 'vitest';
import {
    CLAVE_DENSIDAD,
    aplicarDensidad,
    esDensidad,
    inicializarDensidad,
    leerDensidad,
} from '../../src/lib/densidad';

/**
 * Tarea 5.7 · Q11 · DESIGN §4.4 — densidad configurable.
 *
 * Lo que se fija:
 *  · «cómoda» NO escribe atributo. Es el valor de `:root`, y un
 *    `data-density="comfortable"` sería una segunda fuente de verdad para el
 *    mismo estado; además, el fallo seguro con el atributo ausente tiene que
 *    ser el modo que cumple el mínimo táctil de 44px (§12.11).
 *  · un valor corrupto en `localStorage` no rompe nada ni deja la interfaz en
 *    un estado inventado.
 */

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-density');
});

describe('leer y validar', () => {
    it('sin nada guardado, la densidad es la cómoda', () => {
        expect(leerDensidad()).toBe('comfortable');
    });

    it('un valor corrupto se ignora en vez de aplicarse', () => {
        localStorage.setItem(CLAVE_DENSIDAD, 'diminuta');
        expect(leerDensidad()).toBe('comfortable');
    });

    it('reconoce las dos densidades y sólo esas', () => {
        expect(esDensidad('compact')).toBe(true);
        expect(esDensidad('comfortable')).toBe(true);
        expect(esDensidad('cozy')).toBe(false);
        expect(esDensidad(null)).toBe(false);
    });
});

describe('aplicar', () => {
    it('compacta escribe el atributo y lo recuerda', () => {
        aplicarDensidad('compact');
        expect(document.documentElement.getAttribute('data-density')).toBe('compact');
        expect(localStorage.getItem(CLAVE_DENSIDAD)).toBe('compact');
    });

    it('cómoda QUITA el atributo: el valor por defecto no se declara', () => {
        aplicarDensidad('compact');
        aplicarDensidad('comfortable');
        expect(document.documentElement.hasAttribute('data-density')).toBe(false);
        expect(localStorage.getItem(CLAVE_DENSIDAD)).toBe('comfortable');
    });

    it('sobrevive a la recarga', () => {
        aplicarDensidad('compact');
        document.documentElement.removeAttribute('data-density');
        inicializarDensidad();
        expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    });

    it('arrancar sin preferencia no ensucia el elemento raíz', () => {
        inicializarDensidad();
        expect(document.documentElement.hasAttribute('data-density')).toBe(false);
    });
});
