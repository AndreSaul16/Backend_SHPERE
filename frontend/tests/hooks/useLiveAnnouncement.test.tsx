/**
 * D09 (tarea 1.12) — el caudal del `aria-live` del turno en streaming.
 *
 * DESIGN §12.6: «el turno en streaming (`aria-live="polite"` con *throttle* de
 * 1s sobre un resumen, **no token a token**)». El throttle no es una
 * optimización: un `aria-live` que cambia con cada token del SSE reinicia la
 * locución del lector decenas de veces por segundo y el resultado es que no se
 * oye nada.
 *
 * Estos tests miden justo eso —cuántas veces cambia el texto publicado frente a
 * cuántas veces cambia la entrada— porque es lo único que distingue un
 * `aria-live` que funciona de uno que sólo está puesto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useLiveAnnouncement } from '../../src/hooks/useLiveAnnouncement';

function Sonda({ message, active }: { message: string; active: boolean }) {
    const anuncio = useLiveAnnouncement(message, active);
    return <p aria-live="polite" data-testid="region">{anuncio}</p>;
}

describe('useLiveAnnouncement', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('no publica un anuncio por cada token', () => {
        const { rerender } = render(<Sonda message="0 caracteres" active />);
        const region = screen.getByTestId('region');

        // 40 «tokens» en 400ms: menos de la ventana de 1s.
        for (let i = 1; i <= 40; i++) {
            rerender(<Sonda message={`${i} caracteres`} active />);
            act(() => { vi.advanceTimersByTime(10); });
        }
        // Nada aún: la ventana no se ha cumplido.
        expect(region.textContent).toBe('');

        act(() => { vi.advanceTimersByTime(600); });
        // Un solo anuncio, y con el ÚLTIMO resumen, no con el primero.
        expect(region.textContent).toBe('40 caracteres');
    });

    it('publica a cadencia de 1s mientras el turno sigue vivo', () => {
        const { rerender } = render(<Sonda message="a" active />);
        const region = screen.getByTestId('region');

        act(() => { vi.advanceTimersByTime(1000); });
        expect(region.textContent).toBe('a');

        rerender(<Sonda message="b" active />);
        act(() => { vi.advanceTimersByTime(300); });
        // Sigue diciendo lo anterior: aún no toca.
        expect(region.textContent).toBe('a');

        act(() => { vi.advanceTimersByTime(700); });
        expect(region.textContent).toBe('b');
    });

    it('el final del turno se anuncia entero y sin esperar', () => {
        const { rerender } = render(<Sonda message="escribiendo" active />);

        rerender(<Sonda message="Turno terminado." active={false} />);
        act(() => { vi.advanceTimersByTime(0); });

        // Si el cierre esperase a la siguiente ventana, el «ha terminado» se
        // perdería justo cuando más importa.
        expect(screen.getByTestId('region').textContent).toBe('Turno terminado.');
    });

    it('deja de publicar cuando el componente se desmonta', () => {
        const { unmount } = render(<Sonda message="a" active />);
        unmount();
        // Sin `clearInterval` esto dejaría un temporizador vivo por cada turno.
        expect(() => act(() => { vi.advanceTimersByTime(5000); })).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });
});
