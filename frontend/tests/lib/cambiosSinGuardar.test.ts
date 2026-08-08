/**
 * 6.5 — el recuento de lo que falta por guardar.
 *
 * Lo que importa aquí no es que cuente, es que NO cuente de más: el contador
 * sube solo en cuanto el backend devuelve una sección ausente y el formulario
 * la materializa vacía, y un «7 cambios sin guardar» falso es peor que no decir
 * nada, porque manda al usuario a buscar seis campos que no existen.
 */
import { describe, expect, it } from 'vitest';
import { contarCambios, frasePendiente } from '@/lib/cambiosSinGuardar';

describe('contarCambios', () => {
    it('sin diferencias, cero', () => {
        expect(contarCambios({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(0);
        expect(contarCambios(null, null)).toBe(0);
    });

    it('cuenta un campo por cada hoja distinta, no por rama', () => {
        const guardado = {
            display_name: 'Ana',
            professional_profile: { role: 'PM', company_name: 'Acme' },
            financial_preferences: { base_currency: 'EUR' },
        };
        const actual = {
            display_name: 'Ana María',
            professional_profile: { role: 'Founder', company_name: 'Acme' },
            financial_preferences: { base_currency: 'USD' },
        };
        // Tres campos cambiados en tres secciones: tres, no seis ni dos.
        expect(contarCambios(guardado, actual)).toBe(3);
    });

    it('no cuenta el vacío como cambio: null, undefined y cadena vacía son lo mismo', () => {
        expect(contarCambios({ role: undefined }, { role: '' })).toBe(0);
        expect(contarCambios({}, { role: null })).toBe(0);
        expect(contarCambios({ perfil: { role: null } }, { perfil: { role: undefined } })).toBe(0);
    });

    it('una lista es una sola decisión, aunque cambien varios elementos', () => {
        expect(contarCambios({ tags: ['a', 'b'] }, { tags: ['c', 'd', 'e'] })).toBe(1);
        expect(contarCambios({ tags: ['a'] }, { tags: ['a'] })).toBe(0);
    });

    it('una sección que aparece entera cuenta por sus campos, que es lo que se ve', () => {
        expect(contarCambios({}, { perfil: { role: 'PM', empresa: 'Acme' } })).toBe(2);
    });

    it('los números y los booleanos cuentan como cualquier otro campo', () => {
        expect(contarCambios({ temperature: 0.7, activo: true }, { temperature: 0.9, activo: true })).toBe(1);
    });
});

describe('frasePendiente', () => {
    it('concuerda en singular y en plural', () => {
        expect(frasePendiente(1)).toBe('1 cambio sin guardar');
        expect(frasePendiente(3)).toBe('3 cambios sin guardar');
    });
});
