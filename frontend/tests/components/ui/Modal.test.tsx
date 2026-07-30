/**
 * Tests de <Modal> — DESIGN §9.4.
 *
 * El criterio de la tarea 1.8 es literal: «test que abre, tabula en círculo,
 * pulsa `Escape` y comprueba que el foco vuelve al disparador». Un
 * `role="dialog"` sin test de trampa de foco se rompe en el siguiente refactor
 * sin que nadie lo note, así que aquí está cada punto del contrato de §9.4 con
 * su caso.
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../../../src/components/ui/Modal';

/** Envoltorio con disparador real: sin él no se puede probar la restauración. */
function Harness({
    dismissOnBackdrop,
    onCloseSpy,
}: {
    dismissOnBackdrop?: boolean;
    onCloseSpy?: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Abrir junta
            </button>
            <Modal
                open={open}
                onClose={() => {
                    onCloseSpy?.();
                    setOpen(false);
                }}
                title="Convocar junta"
                description="Cinco directores debatirán tu decisión."
                dismissOnBackdrop={dismissOnBackdrop}
                footer={
                    <button type="button" onClick={() => setOpen(false)}>
                        Convocar
                    </button>
                }
            >
                <input aria-label="Asunto" />
                <button type="button">Adjuntar</button>
            </Modal>
        </>
    );
}

describe('Modal (DESIGN §9.4)', () => {
    it('no pinta nada cuando está cerrado', () => {
        render(<Harness />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('declara role=dialog, aria-modal y aria-labelledby al título', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        const labelId = dialog.getAttribute('aria-labelledby')!;
        expect(document.getElementById(labelId)?.textContent).toBe('Convocar junta');
        const descId = dialog.getAttribute('aria-describedby')!;
        expect(document.getElementById(descId)?.textContent).toContain('Cinco directores');
        // El nombre accesible del diálogo es su título, no «Cerrar».
        expect(screen.getByRole('dialog', { name: 'Convocar junta' })).toBe(dialog);
    });

    it('el foco inicial va al primer control del cuerpo, NO al botón de cierre', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));
        expect(screen.getByLabelText('Asunto')).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Cerrar' })).not.toHaveFocus();
    });

    it('atrapa el foco: al tabular desde el último vuelve al primero', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));

        const close = screen.getByRole('button', { name: 'Cerrar' });
        const asunto = screen.getByLabelText('Asunto');
        const adjuntar = screen.getByRole('button', { name: 'Adjuntar' });
        const convocar = screen.getByRole('button', { name: 'Convocar' });

        // Orden del DOM: cierre (cabecera) → asunto → adjuntar → convocar.
        expect(asunto).toHaveFocus();
        await user.tab();
        expect(adjuntar).toHaveFocus();
        await user.tab();
        expect(convocar).toHaveFocus();
        // Último → primero, sin escaparse al documento de detrás.
        await user.tab();
        expect(close).toHaveFocus();
    });

    it('atrapa el foco hacia atrás: Shift+Tab desde el primero va al último', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));

        screen.getByRole('button', { name: 'Cerrar' }).focus();
        await user.tab({ shift: true });
        expect(screen.getByRole('button', { name: 'Convocar' })).toHaveFocus();
    });

    it('nunca deja el foco en el disparador de detrás mientras está abierto', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: 'Abrir junta' });
        await user.click(trigger);

        const dialog = screen.getByRole('dialog');
        for (let i = 0; i < 6; i++) {
            await user.tab();
            expect(dialog.contains(document.activeElement)).toBe(true);
        }
    });

    it('Escape cierra y el foco vuelve al disparador', async () => {
        const user = userEvent.setup();
        const onCloseSpy = vi.fn();
        render(<Harness onCloseSpy={onCloseSpy} />);
        const trigger = screen.getByRole('button', { name: 'Abrir junta' });
        await user.click(trigger);
        expect(trigger).not.toHaveFocus();

        await user.keyboard('{Escape}');
        expect(onCloseSpy).toHaveBeenCalledTimes(1);
        expect(trigger).toHaveFocus();
    });

    it('el clic en el velo cierra por defecto', async () => {
        const user = userEvent.setup();
        const onCloseSpy = vi.fn();
        render(<Harness onCloseSpy={onCloseSpy} />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));

        fireEvent.click(screen.getByTestId('modal-backdrop'));
        expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('con dismissOnBackdrop=false el velo NO cierra (§9.4: destructivo)', async () => {
        const user = userEvent.setup();
        const onCloseSpy = vi.fn();
        render(<Harness dismissOnBackdrop={false} onCloseSpy={onCloseSpy} />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));

        fireEvent.click(screen.getByTestId('modal-backdrop'));
        expect(onCloseSpy).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('bloquea el scroll del fondo mientras está abierto y lo devuelve al cerrar', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        expect(document.body.style.overflow).toBe('');
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));
        expect(document.body.style.overflow).toBe('hidden');
        await user.keyboard('{Escape}');
        expect(document.body.style.overflow).toBe('');
    });

    it('el botón de cierre tiene nombre accesible y área táctil de 44px', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Abrir junta' }));
        const close = screen.getByRole('button', { name: 'Cerrar' });
        // §12.11: ≥44×44. h-11/w-11 = 44px con la escala de 4px.
        expect(close.className).toMatch(/\bh-11\b/);
        expect(close.className).toMatch(/\bw-11\b/);
    });

    it('honra initialFocusRef cuando se le pasa', async () => {
        const user = userEvent.setup();
        function WithRef() {
            const [open, setOpen] = useState(false);
            const ref = { current: null } as { current: HTMLButtonElement | null };
            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>
                        Abrir
                    </button>
                    <Modal
                        open={open}
                        onClose={() => setOpen(false)}
                        title="Con ref"
                        initialFocusRef={ref}
                        footer={
                            <button type="button" ref={ref}>
                                Cancelar
                            </button>
                        }
                    >
                        <input aria-label="Primero" />
                    </Modal>
                </>
            );
        }
        render(<WithRef />);
        await user.click(screen.getByRole('button', { name: 'Abrir' }));
        expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    });
});
