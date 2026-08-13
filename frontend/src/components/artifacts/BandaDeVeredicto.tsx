/**
 * La banda de veredicto del artefacto.
 *
 * Un artefacto nunca se pinta mal en silencio. Cuando el generador dice que el
 * tipo declarado no se reconoce, que el documento se cortó o que el contenido
 * no encaja con su etiqueta, aquí se cuenta — encima del visor, en un solo
 * sitio, sin tocar ninguno de los cinco visores.
 *
 * Tres reglas que no se negocian:
 *
 *  · **Nunca oculta contenido.** Enseñar un documento mal etiquetado es el
 *    fallo; esconderlo sería otro distinto. La banda etiqueta, no tapa.
 *  · **No es una caída.** `role="status"`, no `alert`: esto habla de un
 *    documento, no de la aplicación.
 *  · **Una sola.** Si coinciden dos veredictos gana el del tipo, porque explica
 *    qué estás mirando; el corte se cuenta después, en la misma frase de abajo.
 */
import { FileQuestion, Scissors, TriangleAlert } from 'lucide-react';
import type { Artifact, ArtifactType } from '@/types/artifact';
import { cn } from '@/lib/utils';

/** Cómo se llama cada tipo cuando hay que decírselo a una persona. */
const NOMBRE_DEL_TIPO: Record<ArtifactType, string> = {
    code: 'código',
    markdown: 'markdown',
    mermaid: 'diagrama',
    data_table: 'tabla',
    svg: 'imagen SVG',
};

type Tono = 'sistema' | 'contenido';

interface Veredicto {
    tono: Tono;
    Glifo: React.ComponentType<{ className?: string }>;
    texto: string;
}

/**
 * El veredicto que toca contar, o `null` si no hay nada que decir.
 *
 * Función pura y exportada a propósito: la decisión de cuándo se avisa es lo
 * que hay que poder probar sin montar un panel entero.
 */
export function veredictoDe(artifact: Artifact): Veredicto | null {
    if (artifact.typeStatus === 'unknown') {
        return {
            tono: 'sistema',
            Glifo: FileQuestion,
            texto: `El modelo declaró un tipo desconocido («${artifact.declaredType ?? 'sin tipo'}»); se muestra como texto sin formato.`,
        };
    }

    if (artifact.truncated) {
        return {
            tono: 'sistema',
            Glifo: Scissors,
            texto: artifact.truncatedReason === 'size_limit'
                ? 'Artefacto cortado a los 256 KB para proteger la sesión; el contenido está incompleto.'
                : 'La generación terminó antes de cerrar el documento; el contenido está incompleto.',
        };
    }

    if (artifact.contentStatus === 'mismatch') {
        return {
            tono: 'contenido',
            Glifo: TriangleAlert,
            texto: `El contenido no encaja con el tipo declarado («${NOMBRE_DEL_TIPO[artifact.type]}»); se muestra igualmente.`,
        };
    }

    // `unchecked` no es un aviso: es la declaración de que ese tipo no se juzga.
    return null;
}

export function BandaDeVeredicto({ artifact }: { artifact: Artifact }) {
    const veredicto = veredictoDe(artifact);
    if (!veredicto) return null;

    const { tono, Glifo, texto } = veredicto;

    return (
        <div
            role="status"
            data-testid="banda-de-veredicto"
            data-tono={tono}
            className={cn(
                'flex items-start gap-2.5 border-b border-stroke-edge bg-surface-2 px-4 py-2.5',
                // El tono separa «el sistema hizo algo con tu documento» de «lo
                // que escribió el modelo no cuadra». Ninguno de los dos es rojo:
                // el rojo de esta casa es el disenso de la junta, no un aviso.
                tono === 'sistema' ? 'border-s-[3px] border-s-brass-600' : 'border-s-[3px] border-s-brass-800',
            )}
        >
            <Glifo className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-content-muted">{texto}</p>
        </div>
    );
}
