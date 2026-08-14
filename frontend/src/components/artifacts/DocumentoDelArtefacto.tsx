/**
 * El documento de un artefacto: acciones de acta + veredicto + visor.
 *
 * Esta pila vivía escrita a mano dentro del tabpanel de `ArtifactPanel`. En
 * cuanto el Atril (§9.15) pasó a enseñar «lo mismo, pero grande», copiarla era
 * garantizar que las dos se separaran: el fallo que este proyecto ya se comió
 * una vez fue justo ese —un visor que se olvidaba de reenviar el veredicto—, y
 * la respuesta entonces fue la misma que ahora, un solo sitio.
 *
 * Devuelve un fragmento, no un contenedor: quien lo monta decide si la columna
 * es el tabpanel del panel o el cuerpo del Atril. Lo que NO se negocia es el
 * orden —las acciones del acta arriba, el veredicto pegado al visor y el visor
 * dentro de su propio `RegionBoundary`— porque ese orden es el contrato.
 */
import { ArtifactRenderer } from './ArtifactRenderer';
import { RegionBoundary } from '@/components/shared/RegionBoundary';
import { ActaActions } from './ActaActions';
import { BandaDeVeredicto } from './BandaDeVeredicto';
import { esActa } from '@/utils/acta';
import type { Artifact } from '@/types/artifact';

export function DocumentoDelArtefacto({ artifact }: { artifact: Artifact }) {
    return (
        <>
            {esActa(artifact) && (
                <ActaActions title={artifact.title} content={artifact.content} />
            )}
            {/* El veredicto del generador, en UN sitio. Se lee del propio
                artefacto, así que ningún visor tiene que acordarse de
                reenviarlo —y olvidarse es justo el fallo que evita. */}
            <BandaDeVeredicto artifact={artifact} />
            {/* Eje 3 · el visor es el vecindario peligroso del panel: un mermaid
                mal formado o una tabla con una fila rara lanzan al renderizar.
                Aislado aquí, lo que se cae es el documento; la tira de pestañas
                sigue, y cambiar de artefacto lo recompone solo (`resetKeys`). */}
            <div className="flex-1 min-h-0">
                <RegionBoundary
                    region="este artefacto"
                    reassurance="El resto de artefactos y la conversación siguen intactos. Prueba con otra pestaña."
                    resetKeys={[artifact.id]}
                >
                    <ArtifactRenderer artifact={artifact} />
                </RegionBoundary>
            </div>
        </>
    );
}
