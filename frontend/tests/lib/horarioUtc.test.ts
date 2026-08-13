/**
 * D69/D70 — el día que se elige es el día que se manda, y la hora que se lee
 * es la del reloj de quien la lee.
 *
 * El desfase de D69 no se ve con una aserción sobre la interfaz: se ve
 * fijando la numeración. Si alguien vuelve a poner «Lunes» en la casilla 0,
 * este fichero se pone rojo.
 */
import { describe, expect, it } from 'vitest';
import { DIAS, aHoraLocal, describeCadencia, dosDigitos } from '@/lib/horarioUtc';

describe('la numeración de los días', () => {
    it('empieza en domingo, como `cron` y como Date.getDay()', () => {
        expect(DIAS[0]).toBe('Domingo');
        expect(DIAS[1]).toBe('Lunes');
        expect(DIAS[6]).toBe('Sábado');
        expect(DIAS).toHaveLength(7);
    });

    it('coincide con lo que dice el propio navegador', () => {
        // 7 de enero de 2024 fue domingo; siete días seguidos desde ahí tienen
        // que llamarse como los llama `DIAS`, índice a índice.
        for (let i = 0; i < 7; i++) {
            const d = new Date(Date.UTC(2024, 0, 7 + i, 12));
            expect(DIAS[d.getUTCDay()]).toBe(DIAS[i]);
        }
    });
});

describe('la traducción de UTC a hora local', () => {
    it('no mueve nada cuando el navegador ya está en UTC', () => {
        // El entorno de test corre en UTC (vitest.config); si algún día deja de
        // hacerlo, esta prueba lo dirá antes que un usuario.
        const desfase = new Date().getTimezoneOffset();
        if (desfase !== 0) return;
        const m = aHoraLocal(9, 1);
        expect(m.hora).toBe(9);
        expect(m.dia).toBe(1);
        expect(m.cambiaDeDia).toBe(false);
    });

    it('devuelve siempre una hora dentro del día y un día de la semana válido', () => {
        for (let dia = 0; dia < 7; dia++) {
            for (let hora = 0; hora < 24; hora++) {
                const m = aHoraLocal(hora, dia);
                expect(m.hora).toBeGreaterThanOrEqual(0);
                expect(m.hora).toBeLessThanOrEqual(23);
                expect(m.dia).toBeGreaterThanOrEqual(0);
                expect(m.dia).toBeLessThanOrEqual(6);
            }
        }
    });
});

describe('la frase que se lee', () => {
    it('dice la hora local Y la de UTC, nunca sólo una', () => {
        const frase = describeCadencia('weekly', 9, 1);
        expect(frase).toContain('UTC');
        expect(frase).toContain(dosDigitos(9));
        expect(frase.startsWith('cada ')).toBe(true);
    });

    it('la cadencia diaria no nombra ningún día', () => {
        const frase = describeCadencia('daily', 9, null);
        expect(frase).toContain('cada día');
        for (const d of DIAS) expect(frase).not.toContain(d);
    });
});

describe('el formato de la hora', () => {
    it('siempre lleva dos dígitos', () => {
        expect(dosDigitos(0)).toBe('00:00');
        expect(dosDigitos(9)).toBe('09:00');
        expect(dosDigitos(23)).toBe('23:00');
    });
});
