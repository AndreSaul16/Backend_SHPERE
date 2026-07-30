/**
 * Tests de <ConfirmDialog> — DESIGN §9.4 y §11.
 *
 * Criterio de la tarea 1.9: «cada acción destructiva abre un diálogo con el
 * nombre del objeto y el foco inicial en Cancelar».
 */
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../../../src/components/ui/ConfirmDialog';

function Harness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Eliminar sesión
            </button>
            <ConfirmDialog
                open={open}
                onClose={() => setOpen(false)}
                onConfirm={onConfirm}
                question="¿Eliminar"
                objectName="Precios 2026"
                consequence="Se borran el debate y su acta. No se puede deshacer."
            />
        </>
    );
}

describe('ConfirmDialog (DESIGN §9.4/§11)', () => {
    it('nombra el objeto en el título y la consecuencia en el cuerpo', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Eliminar sesión' }));

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAccessibleName(/Precios 2026/);
        expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
    });

    it('el foco inicial está en Cancelar, no en el botón destructivo', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Eliminar sesión' }));
        expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    });

    it('pulsar Enter por inercia al abrir NO confirma', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<Harness onConfirm={onConfirm} />);
        await user.click(screen.getByRole('button', { name: 'Eliminar sesión' }));
        await user.keyboard('{Enter}');
        expect(onConfirm).not.toHaveBeenCalled();
        // Y encima ha cerrado, que es lo que quería quien pulsó.
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('confirma cuando se pulsa el botón destructivo', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<Harness onConfirm={onConfirm} />);
        await user.click(screen.getByRole('button', { name: 'Eliminar sesión' }));
        await user.click(screen.getByRole('button', { name: 'Eliminar' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('el velo NO cierra: §9.4 sólo lo permite si no es destructivo', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(screen.getByRole('button', { name: 'Eliminar sesión' }));
        fireEvent.click(screen.getByTestId('modal-backdrop'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('en loading congela el ancho, marca aria-busy y bloquea Cancelar', () => {
        render(
            <ConfirmDialog
                open
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                question="¿Eliminar"
                objectName="Documento"
                consequence="Se borra."
                loading
            />,
        );
        const confirm = screen.getByRole('button', { name: /Eliminar/ });
        expect(confirm).toHaveAttribute('aria-busy', 'true');
        expect(confirm).toBeDisabled();
        // El ancho no salta: la etiqueta sigue en el flujo, sólo invisible.
        expect(confirm.querySelector('.invisible')?.textContent).toBe('Eliminar');
        expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    });

    it('destructive=false usa la variante primaria, no oxblood', () => {
        render(
            <ConfirmDialog
                open
                onClose={vi.fn()}
                onConfirm={vi.fn()}
                question="¿Activar el debate en"
                objectName="Junta Directiva"
                consequence="Cada junta cuesta 5 créditos."
                confirmLabel="Activar"
                destructive={false}
            />,
        );
        const confirm = screen.getByRole('button', { name: 'Activar' });
        expect(confirm.className).toContain('bg-accent-fill');
        expect(confirm.className).not.toContain('text-oxblood-400');
    });
});
