/**
 * <ConfirmDialog> — DESIGN §9.4, último párrafo:
 *
 *   «`<ConfirmDialog>` se construye sobre `<Modal>`: título en pregunta, cuerpo
 *   **con el nombre del objeto**, botón destructivo a la derecha, foco inicial
 *   en Cancelar. Cubre las **8 acciones destructivas que hoy no tienen
 *   confirmación**.»
 *
 * Y §11, fila «La confirmación nombra el objeto y su consecuencia»:
 *   Bien: «¿Eliminar «Precios 2026»? Se borran el debate y su acta. No se puede
 *   deshacer.»  ·  Mal: «¿Confirmar borrado?» + Sí/No.
 *
 * De ahí la forma de la API: `objectName` es obligatorio y `consequence`
 * también. Un `<ConfirmDialog>` sin nombre de objeto no se puede escribir, que
 * es exactamente lo que se quiere.
 *
 * Dos detalles que son de accesibilidad, no de estilo:
 * - `dismissOnBackdrop={false}`: §9.4 dice que el velo cierra «sólo si no es
 *   destructivo», y este diálogo lo es por definición.
 * - El foco inicial va en Cancelar, no en Confirmar: quien pulsa Enter por
 *   inercia no borra nada. Y §12.16 pide además que las dos acciones no sean
 *   contiguas sin separación, de ahí el `gap-3` del pie.
 */
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    /** Título en pregunta. Sin signo final: lo pone el componente. */
    question: string;
    /** El nombre del objeto. Se pinta entrecomillado y destacado. */
    objectName: string;
    /** Qué pasa si se confirma. §11: «y su consecuencia». */
    consequence: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Gerundio del estado `loading` del botón de confirmar (§9.1). */
    confirmLoadingLabel?: string;
    loading?: boolean;
    /**
     * `false` para confirmaciones que no destruyen nada (activar un ajuste con
     * coste, por ejemplo): el botón deja de ser oxblood.
     */
    destructive?: boolean;
}

export function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    question,
    objectName,
    consequence,
    confirmLabel = 'Eliminar',
    cancelLabel = 'Cancelar',
    confirmLoadingLabel = 'Eliminando',
    loading,
    destructive = true,
}: ConfirmDialogProps) {
    const cancelRef = useRef<HTMLButtonElement>(null);

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="sm"
            dismissOnBackdrop={false}
            initialFocusRef={cancelRef}
            title={
                <>
                    {question} «
                    <span className="text-content-strong">{objectName}</span>»?
                </>
            }
            footer={
                <div className="flex w-full items-center justify-end gap-3">
                    <Button ref={cancelRef} variant="ghost" onClick={onClose} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'primary'}
                        onClick={() => void onConfirm()}
                        loading={loading}
                        loadingLabel={confirmLoadingLabel}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            <p className="text-sm text-content">{consequence}</p>
        </Modal>
    );
}
