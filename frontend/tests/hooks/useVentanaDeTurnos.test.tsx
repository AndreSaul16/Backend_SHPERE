import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';

import {
    useVentanaDeTurnos,
    UMBRAL_DE_VENTANA,
    PASO_DE_VENTANA,
} from '../../src/hooks/useVentanaDeTurnos';

/**
 * Tarea 4.9 — la ventana del transcript.
 *
 * Lo que hay que demostrar, y en este orden de importancia:
 *
 *  1. Que por debajo del umbral NO se recorta nada. Una virtualización que se
 *     activa siempre es una fuente de bugs a cambio de nada: la inmensa mayoría
 *     de las conversaciones tienen menos de 80 turnos.
 *  2. Que lo recortado sigue siendo ALCANZABLE sin ratón. El botón es lo que
 *     separa «virtualizar» de «esconder contenido».
 *  3. Que el hilo creciendo por abajo (streaming) no revela nada por arriba.
 *  4. Que revelarlo todo lo revela todo, que es de lo que depende el salto de
 *     fase del Canto (§8.4) y la búsqueda.
 */

/** Un `IntersectionObserver` de mentira que no dispara solo. */
class ObservadorInerte {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

const original = globalThis.IntersectionObserver;

beforeEach(() => {
    globalThis.IntersectionObserver = ObservadorInerte as unknown as typeof IntersectionObserver;
});
afterEach(() => {
    globalThis.IntersectionObserver = original;
});

function Hilo({ turnos, activa = true }: { turnos: string[]; activa?: boolean }) {
    const v = useVentanaDeTurnos(turnos, { activa });
    return (
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
            {v.recortando && (
                <div ref={v.centinela}>
                    <button type="button" onClick={v.revelarMas}>
                        Mostrar los {v.ocultos} turnos anteriores
                    </button>
                    <button type="button" onClick={v.revelarTodo}>todo</button>
                </div>
            )}
            <ul>
                {v.visibles.map((t) => <li key={t}>{t}</li>)}
            </ul>
        </div>
    );
}

const turnos = (n: number, desde = 0) =>
    Array.from({ length: n }, (_, i) => `turno-${i + desde}`);

describe('por debajo del umbral no se recorta', () => {
    it(`${UMBRAL_DE_VENTANA} turnos se montan enteros y sin botón`, () => {
        render(<Hilo turnos={turnos(UMBRAL_DE_VENTANA)} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(UMBRAL_DE_VENTANA);
        expect(screen.queryByText(/turnos anteriores/)).toBeNull();
    });

    it('con búsqueda activa no se recorta aunque haya 300 turnos', () => {
        // Un resultado que está en un turno sin montar sería un resultado que no
        // existe, y el contador de «N resultados» mentiría.
        render(<Hilo turnos={turnos(300)} activa={false} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(300);
        expect(screen.queryByText(/turnos anteriores/)).toBeNull();
    });
});

describe('por encima del umbral se monta la cola', () => {
    it('300 turnos montan los 80 últimos, y son LOS ÚLTIMOS', () => {
        render(<Hilo turnos={turnos(300)} />);
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(UMBRAL_DE_VENTANA);
        // La cola, no la cabeza: lo que el usuario está mirando es el final.
        expect(items[items.length - 1]).toHaveTextContent('turno-299');
        expect(items[0]).toHaveTextContent(`turno-${300 - UMBRAL_DE_VENTANA}`);
        expect(screen.getByText(`Mostrar los ${300 - UMBRAL_DE_VENTANA} turnos anteriores`)).toBeInTheDocument();
    });

    it('el botón revela un tramo más, y es alcanzable sin scroll', () => {
        // El `IntersectionObserver` está inerte en este test A PROPÓSITO: se
        // comprueba el camino del teclado, que es el que no depende de él.
        render(<Hilo turnos={turnos(300)} />);
        fireEvent.click(screen.getByText(/turnos anteriores/));

        expect(screen.getAllByRole('listitem')).toHaveLength(UMBRAL_DE_VENTANA + PASO_DE_VENTANA);
        expect(screen.getByText(`Mostrar los ${300 - UMBRAL_DE_VENTANA - PASO_DE_VENTANA} turnos anteriores`)).toBeInTheDocument();
    });

    it('revelarlo todo lo revela todo y retira el botón', () => {
        // De esto depende el salto de fase del Canto: si la fase está en un
        // tramo sin montar, `saltarAFase` revela y luego salta.
        render(<Hilo turnos={turnos(300)} />);
        fireEvent.click(screen.getByText('todo'));

        expect(screen.getAllByRole('listitem')).toHaveLength(300);
        expect(screen.queryByText(/turnos anteriores/)).toBeNull();
    });
});

describe('el hilo creciendo por abajo no revela nada por arriba', () => {
    it('llegan 20 turnos nuevos y siguen montándose 80', () => {
        // Es el caso del streaming: si cada turno nuevo aumentara la ventana, a
        // los 300 turnos estaríamos montando los 300 y la tarea no habría
        // servido de nada.
        const { rerender } = render(<Hilo turnos={turnos(200)} />);
        expect(screen.getAllByRole('listitem')).toHaveLength(UMBRAL_DE_VENTANA);

        rerender(<Hilo turnos={turnos(220)} />);

        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(UMBRAL_DE_VENTANA);
        expect(items[items.length - 1]).toHaveTextContent('turno-219');
    });
});

describe('el observador es la comodidad, no el acceso', () => {
    it('cuando el centinela entra en vista se revela un tramo', () => {
        let disparar: (() => void) | null = null;
        class ObservadorEspia {
            constructor(private cb: IntersectionObserverCallback) {
                disparar = () => this.cb(
                    [{ isIntersecting: true } as IntersectionObserverEntry],
                    this as unknown as IntersectionObserver,
                );
            }
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        }
        globalThis.IntersectionObserver = ObservadorEspia as unknown as typeof IntersectionObserver;

        render(<Hilo turnos={turnos(300)} />);
        expect(disparar).not.toBeNull();

        act(() => disparar!());

        expect(screen.getAllByRole('listitem')).toHaveLength(UMBRAL_DE_VENTANA + PASO_DE_VENTANA);
    });

    it('sin IntersectionObserver el hilo sigue siendo navegable', () => {
        // Navegador antiguo, o un entorno sin la API: lo que NO puede pasar es
        // que el contenido quede inalcanzable.
        const guardado = globalThis.IntersectionObserver;
        // @ts-expect-error se retira a propósito para probar el camino sin API
        delete globalThis.IntersectionObserver;
        try {
            render(<Hilo turnos={turnos(300)} />);
            fireEvent.click(screen.getByText(/turnos anteriores/));
            expect(screen.getAllByRole('listitem')).toHaveLength(UMBRAL_DE_VENTANA + PASO_DE_VENTANA);
        } finally {
            globalThis.IntersectionObserver = guardado;
        }
    });
});

describe('el anclaje: lo que se está leyendo no se mueve', () => {
    it('al revelar se corrige el scroll para conservar la distancia al fondo', () => {
        // jsdom no maqueta, así que `scrollHeight` se simula: lo que se prueba
        // es la ARITMÉTICA del anclaje, que es donde estaría el bug.
        render(<Hilo turnos={turnos(300)} />);
        const scroller = screen.getByTestId('scroller');

        // El hilo mide 1000px cuando se captura el anclaje y 2500 cuando se
        // restaura: el tramo revelado ha añadido 1500px POR ARRIBA. Esa es
        // exactamente la situación que el anclaje existe para corregir.
        let lecturas = 0;
        Object.defineProperty(scroller, 'scrollHeight', {
            get: () => (lecturas++ === 0 ? 1000 : 2500),
            configurable: true,
        });
        // `overflowY` computado: el hook sube buscando el contenedor con scroll.
        scroller.style.overflowY = 'auto';
        scroller.scrollTop = 300;

        const espiaScrollTop = vi.spyOn(scroller, 'scrollTop', 'set');
        fireEvent.click(screen.getByText(/turnos anteriores/));

        // Distancia al fondo antes: 1000 - 300 = 700. Para que el texto no se
        // mueva ni un píxel, el scroll tiene que quedar en 2500 - 700 = 1800.
        expect(espiaScrollTop).toHaveBeenCalledWith(1800);
    });
});
