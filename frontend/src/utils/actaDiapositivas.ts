/**
 * El acta partida en diapositivas — PLAN §6 Q1 (tarea 5.8).
 *
 * «Una sección por diapositiva, recuento de votos como diapositiva propia,
 * próximos pasos como cierre.» El corte es por encabezado de nivel 2, que es
 * como el modelo estructura el acta; lo que venga antes del primer `##` es la
 * portada, porque suele ser el `#` del título y su entradilla.
 *
 * Es una función pura y vive fuera del componente a propósito: partir un
 * documento es lo único de esta función que puede estar mal, y así se prueba
 * sin abrir pantalla completa ni montar nada.
 *
 * Los «Próximos pasos» se sacan de su sitio y se ponen al final aunque el acta
 * los traiga en medio: una presentación acaba en lo que hay que hacer, no en
 * un anexo. Es la única reordenación que se hace, y se hace por eso.
 */

export type TipoDeDiapositiva = 'portada' | 'seccion' | 'recuento' | 'pasos';

export interface Diapositiva {
    id: string;
    tipo: TipoDeDiapositiva;
    titulo: string;
    /** Markdown del cuerpo. Vacío en la de recuento, que se pinta con datos. */
    cuerpo: string;
}

const H2 = /^##\s+(.+?)\s*$/;
const H1 = /^#\s+(.+?)\s*$/;

/** Limpia la decoración que suele traer un encabezado escrito por un modelo. */
function limpiar(texto: string): string {
    return texto.replace(/[*`_]/g, '').replace(/\s*:\s*$/, '').trim();
}

function esProximosPasos(titulo: string): boolean {
    return /pr[oó]ximos\s+pasos/i.test(limpiar(titulo));
}

/**
 * Parte el markdown del acta en diapositivas.
 *
 * `tituloDelActa` es el del artefacto y se usa como portada cuando el acta no
 * trae un `#` propio: una presentación que abre sin título no se puede enseñar
 * a nadie.
 */
export function partirEnDiapositivas(markdown: string, tituloDelActa: string): Diapositiva[] {
    const lineas = (markdown ?? '').split(/\r?\n/);

    let tituloPortada = '';
    const entradilla: string[] = [];
    const secciones: { titulo: string; lineas: string[] }[] = [];
    let actual: { titulo: string; lineas: string[] } | null = null;

    for (const linea of lineas) {
        const h2 = linea.match(H2);
        if (h2) {
            actual = { titulo: limpiar(h2[1]), lineas: [] };
            secciones.push(actual);
            continue;
        }
        if (actual) {
            actual.lineas.push(linea);
            continue;
        }
        const h1 = linea.match(H1);
        if (h1 && !tituloPortada) {
            tituloPortada = limpiar(h1[1]);
            continue;
        }
        entradilla.push(linea);
    }

    const diapositivas: Diapositiva[] = [
        {
            id: 'portada',
            tipo: 'portada',
            titulo: tituloPortada || limpiar(tituloDelActa),
            cuerpo: entradilla.join('\n').trim(),
        },
    ];

    // El recuento va justo tras la portada: es la respuesta, y en una junta la
    // respuesta se da antes que el razonamiento.
    diapositivas.push({ id: 'recuento', tipo: 'recuento', titulo: 'Recuento de la junta', cuerpo: '' });

    const pasos = secciones.filter((s) => esProximosPasos(s.titulo));
    for (const [i, seccion] of secciones.entries()) {
        if (esProximosPasos(seccion.titulo)) continue;
        const cuerpo = seccion.lineas.join('\n').trim();
        // Una sección vacía no es una diapositiva: es un encabezado que el
        // modelo abrió y no rellenó, y en pantalla completa se ve muchísimo.
        if (!cuerpo) continue;
        diapositivas.push({
            id: `seccion-${i}`,
            tipo: 'seccion',
            titulo: seccion.titulo,
            cuerpo,
        });
    }

    for (const [i, seccion] of pasos.entries()) {
        const cuerpo = seccion.lineas.join('\n').trim();
        if (!cuerpo) continue;
        diapositivas.push({
            id: `pasos-${i}`,
            tipo: 'pasos',
            titulo: seccion.titulo,
            cuerpo,
        });
    }

    return diapositivas;
}
