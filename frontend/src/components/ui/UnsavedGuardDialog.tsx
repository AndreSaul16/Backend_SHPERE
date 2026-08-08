/**
 * La guarda de cambios sin guardar, ya montada — D63 (tarea 5.15).
 *
 * Los cuatro formularios largos sólo tienen que decir DOS cosas: si hay cambios
 * y cómo se llama lo que se está editando. Todo lo demás —los escuchadores, el
 * diálogo, el foco, la navegación aplazada— vive aquí, para que los cuatro
 * pregunten exactamente igual. Cuatro diálogos escritos a mano acaban siendo
 * cuatro textos distintos, y §11 pide que la confirmación nombre el objeto y su
 * consecuencia siempre de la misma forma.
 *
 * No es destructivo en el sentido de §9.4 —no se borra nada del servidor—, pero
 * sí se pierde trabajo, así que el velo no cierra y el foco inicial está en
 * «Seguir editando»: quien pulsa Intro por inercia no tira lo que ha escrito.
 */
import { ConfirmDialog } from './ConfirmDialog';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

export function UnsavedGuardDialog({
    sucio,
    objeto,
    consecuencia = 'Se pierde lo que has cambiado y no guardado.',
}: {
    sucio: boolean;
    /** Cómo se llama lo que se está editando. §11: la confirmación lo nombra. */
    objeto: string;
    consecuencia?: React.ReactNode;
}) {
    const guarda = useUnsavedGuard(sucio);

    return (
        <ConfirmDialog
            open={guarda.preguntando}
            onClose={guarda.quedarse}
            onConfirm={guarda.salir}
            question="¿Salir sin guardar"
            objectName={objeto}
            consequence={consecuencia}
            confirmLabel="Salir sin guardar"
            confirmLoadingLabel="Saliendo"
            cancelLabel="Seguir editando"
            destructive={false}
        />
    );
}
