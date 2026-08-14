/**
 * El Atril — el documento a pantalla grande (DESIGN §9.15).
 *
 * El panel de artefactos abre a 480px y no pasa de 760px (`MainLayout`), así
 * que descontados los paddings a un documento le quedan ~370px de texto: la
 * medida de 60ch que §4.2 le exige a `.doc-prose` no se alcanza NUNCA en el
 * panel, y una tabla de más de tres columnas se lee a base de scroll
 * horizontal. Hasta ahora la única salida era arrastrar el tirador de §9.13
 * hasta el tope —y aun en el tope no llegaba.
 *
 * El Atril no es un visor nuevo: es el mismo `DocumentoDelArtefacto` que pinta
 * el tabpanel, montado sobre el primitivo `<Modal>` de §9.4. De ahí salen ya
 * hechos la trampa de foco, `Escape`, el `aria-modal`, el bloqueo del scroll de
 * fondo y la restauración del foco al disparador. Nada de eso se reimplementa
 * aquí, que es justo el motivo de que §9.4 exija un solo primitivo.
 *
 * `open` llega ya resuelto por quien abre —él es quien sabe si todavía queda
 * documento que ampliar— y aquí NO se vuelve a comprobar: un segundo guardián
 * escondería que el primero se hubiera roto, y el fallo que taparía es un
 * diálogo en blanco que atrapa el foco.
 */
import { Modal } from '@/components/ui/Modal';
import { DocumentoDelArtefacto } from './DocumentoDelArtefacto';
import type { Artifact } from '@/types/artifact';

interface ArtifactExpandedProps {
    /** El documento activo, o nada si el panel se ha quedado sin ninguno. */
    artifact: Artifact | undefined;
    open: boolean;
    onClose: () => void;
}

export function ArtifactExpanded({ artifact, open, onClose }: ArtifactExpandedProps) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            size="full"
            title={artifact?.title ?? ''}
            closeLabel="Cerrar el documento ampliado"
            /* El cuerpo del Atril no lleva el padding del modal ni scroll
               propio. Los cinco visores ya traen el suyo (`flex-1 overflow-auto`
               en `MarkdownViewer`, `CodeBlock` y `DataGrid`), y dos contenedores
               con scroll anidados hacen que la rueda mueva el que no toca.
               `overflow-y-hidden` y no `overflow-hidden`: el primero choca con
               el `overflow-y-auto` de la base y `tailwind-merge` lo sustituye;
               el segundo es de otro grupo y sobrevivirían los dos, dejando el
               resultado a merced del orden del CSS generado. */
            bodyClassName="flex flex-col overflow-y-hidden p-0"
        >
            {artifact && <DocumentoDelArtefacto artifact={artifact} />}
        </Modal>
    );
}
