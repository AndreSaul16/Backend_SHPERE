/**
 * Tests de <ToastProvider> y del bus — DESIGN §9.5 y §12.6.
 *
 * §12.6 exige que «todo lo que cambia sin interacción se anuncia». Un toast sin
 * `role`/`aria-live` es decoración: aparece, se va y el usuario de lector de
 * pantalla no se entera de que su acta no se ha guardado. Así que lo que se
 * prueba aquí es el anuncio y las duraciones, no el aspecto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../../src/components/ui/Toast';
import { __resetToastBus, notify, toast } from '../../../src/lib/toastBus';

describe('Toast (DESIGN §9.5)', () => {
    beforeEach(() => {
        __resetToastBus();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('la región viva existe antes de que llegue el primer aviso', () => {
        render(<ToastProvider />);
        // Sin avisos no hay `role`, pero sí el contenedor: un aria-live que se
        // monta junto a su contenido no se anuncia en varios lectores.
        expect(document.querySelector('.fixed.z-\\[200\\]')).toBeTruthy();
    });

    it('un éxito se anuncia con role=status y aria-live=polite', () => {
        render(<ToastProvider />);
        act(() => {
            toast.success('Acta enviada a Notion');
        });
        const item = screen.getByRole('status');
        expect(item).toHaveAttribute('aria-live', 'polite');
        expect(item).toHaveTextContent('Acta enviada a Notion');
    });

    it('un error se anuncia con role=alert y aria-live=assertive', () => {
        render(<ToastProvider />);
        act(() => {
            toast.error('No se pudo guardar el nombre', 'Tu texto sigue en el campo.');
        });
        const item = screen.getByRole('alert');
        expect(item).toHaveAttribute('aria-live', 'assertive');
        expect(item).toHaveTextContent('Tu texto sigue en el campo.');
    });

    it('un aviso emitido antes de montar el provider no se pierde', () => {
        act(() => {
            toast.error('Fallo durante el arranque');
        });
        render(<ToastProvider />);
        expect(screen.getByRole('alert')).toHaveTextContent('Fallo durante el arranque');
    });

    it('success se cierra solo a los 4s; error NO se cierra nunca solo', async () => {
        vi.useFakeTimers();
        render(<ToastProvider />);
        act(() => {
            toast.success('Guardado');
            toast.error('Roto');
        });
        expect(screen.getByRole('status')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(4100);
        });
        expect(screen.queryByRole('status')).toBeNull();

        await act(async () => {
            vi.advanceTimersByTime(60_000);
        });
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('info dura 6s y warning 8s', async () => {
        vi.useFakeTimers();
        render(<ToastProvider />);
        act(() => {
            toast.info('Informativo');
            toast.warning('Cuidado');
        });
        await act(async () => {
            vi.advanceTimersByTime(6100);
        });
        expect(screen.queryByText('Informativo')).toBeNull();
        expect(screen.getByText('Cuidado')).toBeInTheDocument();
        await act(async () => {
            vi.advanceTimersByTime(2100);
        });
        expect(screen.queryByText('Cuidado')).toBeNull();
    });

    it('siempre hay botón de cierre, y cierra', async () => {
        const user = userEvent.setup();
        render(<ToastProvider />);
        act(() => {
            toast.error('No se pudo subir el documento');
        });
        await user.click(
            screen.getByRole('button', { name: 'Cerrar aviso: No se pudo subir el documento' }),
        );
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('la acción se ejecuta y cierra el aviso', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<ToastProvider />);
        act(() => {
            toast.error('No se pudo enviar', 'La conexión falló.', {
                label: 'Reintentar',
                onClick,
            });
        });
        await user.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('apila 3 como máximo y cuenta el resto en «+N más»', () => {
        render(<ToastProvider />);
        act(() => {
            for (let i = 1; i <= 5; i++) toast.info(`Aviso ${i}`);
        });
        expect(screen.getAllByRole('status')).toHaveLength(3);
        expect(screen.getByText('+2 más')).toBeInTheDocument();
        // Se ven los tres ÚLTIMOS: el aviso reciente es el que importa.
        expect(screen.getByText('Aviso 5')).toBeInTheDocument();
        expect(screen.queryByText('Aviso 1')).toBeNull();
    });

    it('dedupeKey sustituye en vez de apilar el mismo fallo en bucle', () => {
        render(<ToastProvider />);
        act(() => {
            for (let i = 0; i < 4; i++) {
                notify({ title: 'El stream falló', variant: 'error', dedupeKey: 'stream' });
            }
        });
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByText(/más$/)).toBeNull();
    });

    it('el auto-cierre se pausa con el ratón encima y se retoma al salir', async () => {
        vi.useFakeTimers();
        render(<ToastProvider />);
        act(() => {
            toast.success('Guardado');
        });
        const item = screen.getByRole('status');

        await act(async () => {
            vi.advanceTimersByTime(2000);
        });
        // `fireEvent` y no `userEvent`: con temporizadores falsos, user-event
        // espera a un reloj que sólo avanza cuando se lo pide el test, y se
        // queda colgado. Para un hover puro el evento crudo dice lo mismo.
        fireEvent.mouseEnter(item);
        await act(async () => {
            vi.advanceTimersByTime(30_000);
        });
        // Con el ratón encima no se ha ido, aunque hayan pasado 30 segundos.
        expect(screen.getByRole('status')).toBeInTheDocument();

        fireEvent.mouseLeave(item);
        await act(async () => {
            vi.advanceTimersByTime(2100);
        });
        // Al salir retoma los ~2s que le quedaban, no reinicia los 4.
        expect(screen.queryByRole('status')).toBeNull();
    });
});
