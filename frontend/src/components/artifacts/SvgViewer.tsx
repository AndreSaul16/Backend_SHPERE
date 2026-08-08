/**
 * El visor de SVG (tarea 4.2).
 *
 * Vivía como una rama JSX en línea dentro de `ArtifactRenderer`, y por eso
 * `dompurify` —que es LO QUE HACE SEGURA esa rama— se importaba de forma
 * estática en el conmutador y viajaba en el chunk de entrada de todo el mundo.
 * Sacándolo a su propio fichero, el saneador viaja con el único código que lo
 * usa y sólo baja cuando hay un SVG que enseñar.
 *
 * El perfil de saneado es el de antes, literal: `svg` + `svgFilters`. Un
 * artefacto SVG lo escribe un modelo, así que es contenido no confiable y el
 * `dangerouslySetInnerHTML` sólo es defendible detrás del saneador.
 */
import DOMPurify from 'dompurify';
import type { Artifact } from '@/types/artifact';

export function SvgViewer({ artifact }: { artifact: Artifact }) {
    return (
        <div className="flex-1 flex items-center justify-center p-4">
            <div
                className="max-w-full max-h-full"
                dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(artifact.content, {
                        USE_PROFILES: { svg: true, svgFilters: true },
                    }),
                }}
            />
        </div>
    );
}
