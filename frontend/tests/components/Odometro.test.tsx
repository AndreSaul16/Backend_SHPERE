import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Odometro } from '../../src/components/ui/Odometro';

/**
 * §8.12 «Las Cifras que Asientan» — el odómetro de contaduría.
 *
 * Lo que este fichero defiende, y por qué cada cosa se mira donde se mira:
 *
 *  · **Rueda por CAMBIO DE VALOR, jamás por reloj.** Es la diferencia entre un
 *    contador que asienta un hecho y una animación decorativa que corre sola.
 *    Se prueba por la AUSENCIA de temporizadores con relojes falsos: si algún
 *    día alguien mete un setTimeout o un setInterval para «suavizar» el
 *    rodillo, `vi.getTimerCount()` deja de ser 0 y este test cae.
 *  · **El saliente sigue en el DOM mientras rueda.** Es lo que hace que el
 *    dígito de arriba suba y el de abajo llegue; sin los dos, no hay rodillo,
 *    hay reemplazo.
 *  · **Movimiento reducido: cambio seco y subrayado que se mantiene** (§8.12,
 *    literal: «el dígito cambia sin rodillo; el subrayado de latón se
 *    mantiene»). La información de «esto acaba de cambiar» no se pierde: se
 *    pierde el tiempo.
 *
 * No se asertan nombres de clase: el contrato observable son los atributos de
 * datos, el texto y la presencia de los nodos.
 */

/** Fuerza la respuesta del sistema a la consulta de movimiento reducido. */
function conMovimientoReducido(reducido: boolean) {
    vi.stubGlobal('matchMedia', (consulta: string) => ({
        matches: consulta.includes('prefers-reduced-motion') ? reducido : false,
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }));
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('Odometro — §8.12', () => {
    it('rueda al cambiar el valor y no monta ningún temporizador', () => {
        vi.useFakeTimers();

        const { rerender } = render(<Odometro valor={12} />);

        // En reposo no hay rodillo: nadie ha cambiado nada todavía.
        expect(screen.getByTestId('odometro')).toHaveTextContent('12');
        expect(screen.queryAllByTestId('odometro-saliente')).toHaveLength(0);

        rerender(<Odometro valor={13} />);

        expect(screen.getByTestId('odometro')).toHaveTextContent('13');

        // Sólo el dígito que cambió rueda: el «1» de las decenas se queda quieto.
        // El saliente viaja en un atributo y no como texto — ver el comentario
        // de cabecera de `Odometro`: como texto, el odómetro «diría» 123.
        const salientes = screen.getAllByTestId('odometro-saliente');
        expect(salientes.map((s) => s.getAttribute('data-saliente'))).toEqual(['2']);
        expect(
            screen.getAllByTestId('odometro-digito').map((d) => d.getAttribute('data-rueda')),
        ).toEqual(['no', 'si']);

        // Y el subrayado de latón dice «esto acaba de cambiar», desvaneciéndose.
        expect(screen.getByTestId('odometro-senal')).toHaveAttribute('data-persistente', 'no');

        expect(vi.getTimerCount()).toBe(0);
    });

    it('rueda todos los dígitos que cambian cuando la cifra gana ancho', () => {
        vi.useFakeTimers();

        const { rerender } = render(<Odometro valor={9} />);
        rerender(<Odometro valor={10} />);

        expect(screen.getByTestId('odometro')).toHaveTextContent('10');

        // 9 → 10: las unidades pasan de 9 a 0 y las decenas nacen de la nada.
        const salientes = screen.getAllByTestId('odometro-saliente');
        expect(salientes.map((s) => s.getAttribute('data-saliente'))).toEqual(['', '9']);
        expect(
            screen.getAllByTestId('odometro-digito').map((d) => d.getAttribute('data-rueda')),
        ).toEqual(['si', 'si']);

        expect(vi.getTimerCount()).toBe(0);
    });

    it('con movimiento reducido el dígito cambia seco y el subrayado se mantiene', () => {
        conMovimientoReducido(true);

        const { rerender } = render(<Odometro valor={12} />);
        rerender(<Odometro valor={13} />);

        // La cifra nueva está, entera y sola: sin rodillo no hay saliente.
        expect(screen.getByTestId('odometro')).toHaveTextContent('13');
        expect(screen.queryAllByTestId('odometro-saliente')).toHaveLength(0);
        expect(
            screen.getAllByTestId('odometro-digito').map((d) => d.getAttribute('data-rueda')),
        ).toEqual(['no', 'no']);

        // La señal de cambio sí sigue: es información, no adorno.
        expect(screen.getByTestId('odometro-senal')).toHaveAttribute('data-persistente', 'si');
    });

    it('con movimiento reducido y sin cambio no hay señal que dar', () => {
        conMovimientoReducido(true);

        render(<Odometro valor={12} />);

        expect(screen.getByTestId('odometro')).toHaveTextContent('12');
        expect(screen.queryByTestId('odometro-senal')).toBeNull();
    });
});
