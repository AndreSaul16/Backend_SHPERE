import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    DURACION,
    CURVA,
    SIN_MOVIMIENTO,
    STAGGER_TURNO,
    TOPE_STAGGER,
    retrasoDeEntrada,
    entradaDelTurno,
} from '../../src/lib/motion';

/**
 * Viveza-1 · §9.11 + §7.4 — la entrada del Turno, a los tokens del contrato.
 *
 * Lo que había: `transition={{ duration: 0.4, ease: "easeOut" }}` escrito a
 * pelo en `MessageBubble`. 400ms es **2,5× el techo** de `--duration-pop`
 * (160ms) y `easeOut` no es ninguna de las cuatro curvas de §7.1. Un turno que
 * tarda 400ms en aparecer no se siente cuidado: se siente lento, que es
 * exactamente la queja («un poco soso») que abre este ciclo.
 *
 * El cálculo del escalonado sale a función PURA a propósito: es la única pieza
 * con aritmética, y probarla aquí —sin DOM, sin framer, sin mocks— es lo que
 * hace que el tope de 8 esté defendido de verdad. Sin tope, una tanda de 200
 * turnos daría 8 segundos de desfile.
 */
describe('§7.4 — el escalonado de entrada tiene tope', () => {
    it('el primer turno no espera', () => {
        expect(retrasoDeEntrada(0)).toBe(0);
    });

    it('cada turno de la tanda entra 40ms después del anterior', () => {
        expect(STAGGER_TURNO).toBe(0.04);
        expect(retrasoDeEntrada(1)).toBeCloseTo(0.04, 5);
        expect(retrasoDeEntrada(2)).toBeCloseTo(0.08, 5);
        expect(retrasoDeEntrada(5)).toBeCloseTo(0.2, 5);
    });

    it('los retrasos crecen de forma estricta hasta el tope', () => {
        const hastaElTope = Array.from({ length: TOPE_STAGGER + 1 }, (_, i) => retrasoDeEntrada(i));

        for (let i = 1; i < hastaElTope.length; i++) {
            expect(hastaElTope[i], `turno ${i}`).toBeGreaterThan(hastaElTope[i - 1]);
        }
    });

    it('a partir del octavo, la tanda entra junta: el retraso se congela', () => {
        // §7.5 «máximo 8 filas con stagger (las siguientes entran juntas): una
        // lista de 200 filas no es un desfile».
        expect(TOPE_STAGGER).toBe(8);
        const tope = retrasoDeEntrada(TOPE_STAGGER);

        expect(tope).toBeCloseTo(0.32, 5);
        expect(retrasoDeEntrada(9)).toBeCloseTo(tope, 5);
        expect(retrasoDeEntrada(40)).toBeCloseTo(tope, 5);
        // El caso que motiva el tope: reabrir un debate largo de golpe.
        expect(retrasoDeEntrada(200)).toBeCloseTo(tope, 5);
    });

    it('el retraso total de una tanda nunca pasa de --duration-scene', () => {
        // 320ms contra el techo de 560ms de §7.2: el último turno de la tanda
        // sigue dentro de la ventana que el sistema considera una sola escena.
        expect(retrasoDeEntrada(200)).toBeLessThanOrEqual(DURACION.scene);
    });
});

describe('§9.11 — la entrada del Turno usa los tokens del sistema', () => {
    it('entra a --duration-pop con --ease-settle, no a 400ms con easeOut', () => {
        const { transition } = entradaDelTurno(false, 0);

        expect(transition.duration).toBe(DURACION.pop);
        expect(transition.duration).toBe(0.16);
        expect(transition.ease).toEqual(CURVA.settle);
    });

    it('el turno sube 6px al entrar, y sólo opacidad y desplazamiento', () => {
        const { initial, animate } = entradaDelTurno(false, 0);

        expect(initial).toEqual({ opacity: 0, y: 6 });
        expect(animate).toEqual({ opacity: 1, y: 0 });
        // §7.4 sólo firma `opacity` + `translateY`. El `scale: 0.97` que traía
        // antes no está en el contrato y hacía «botar» la burbuja.
        expect(initial).not.toHaveProperty('scale');
        expect(animate).not.toHaveProperty('scale');
    });

    it('el escalonado llega a la transición desde la función pura', () => {
        expect(entradaDelTurno(false, 3).transition.delay).toBeCloseTo(0.12, 5);
        expect(entradaDelTurno(false, 50).transition.delay).toBeCloseTo(0.32, 5);
    });

    /**
     * La grieta que deja una función pura: el componente puede llamarla y
     * PISARLA después (`{...entradaDelTurno(…)} transition={{ duration: 0.4 }}`),
     * y ninguna prueba de la función se entera. Medido: con esa mutación las 26
     * pruebas de este ciclo seguían en verde.
     *
     * Por eso el contrato se defiende también en el fuente, igual que hace
     * `RowActions.a11y.test.tsx` con `index.css`: la entrada del turno se toma
     * de los tokens del sistema, y una duración escrita a mano ahí es
     * exactamente el defecto que este ciclo vino a quitar.
     */
    it('el componente no escribe la transición a mano: la toma del sistema', () => {
        const fuente = readFileSync(
            resolve(__dirname, '../../src/components/chat/MessageBubble.tsx'),
            'utf8',
        );

        expect(fuente).toContain('entradaDelTurno(reducido, indice)');
        // Ni la duración de 400ms ni la curva que §7.1 no tiene.
        expect(fuente).not.toMatch(/duration:\s*0\.4\b/);
        expect(fuente).not.toMatch(/ease:\s*['"]easeOut['"]/);
    });

    it('con movimiento reducido la entrada es un corte: fade sin desplazamiento', () => {
        // §7.6: «la información nunca se pierde: sólo el tiempo». El turno
        // aparece; no viaja.
        const { initial, animate, transition } = entradaDelTurno(true, 5);

        expect(initial).not.toHaveProperty('y');
        expect(animate).not.toHaveProperty('y');
        expect(initial).toEqual({ opacity: 0 });
        expect(animate).toEqual({ opacity: 1 });
        // Y sin escalonado: nadie espera 200ms a que le pinten su turno.
        expect(transition).toBe(SIN_MOVIMIENTO);
        expect(transition.duration).toBe(0);
    });
});
