/**
 * El turno, partido en piezas (tarea 4.7 · D21).
 *
 * ── De dónde viene ─────────────────────────────────────────────────────────
 * Esto eran ~180 líneas de expresión regular y construcción de array DENTRO
 * del JSX de `MessageBubble`, en una función anónima invocada en el sitio.
 * Consecuencias medidas:
 *
 *  - **Intestable.** No había forma de llamarlo sin montar una burbuja entera
 *    con su store, su avatar y su framer-motion. Cero tests sobre el código que
 *    decide qué se ve en el hilo.
 *  - **Corría por token.** El parseo vive en el cuerpo del componente, así que
 *    se rehacía en cada render — y durante el streaming eso es una vez por
 *    token, por burbuja, sobre el contenido COMPLETO acumulado hasta ese
 *    momento. O sea coste cuadrático en la longitud del turno.
 *
 * ── Qué hace y qué NO ──────────────────────────────────────────────────────
 * Devuelve DATOS, no nodos de React. Es lo que lo hace testable y lo que
 * permite memoizarlo: un array de objetos planos se compara y se cachea; un
 * array de elementos de React, no.
 *
 * El texto de los cuatro marcadores lo escribe el propio store cuando llegan
 * los eventos del stream (`streamHandlers.ts`), así que este formato es un
 * contrato interno de la app, no algo que venga del modelo.
 */

/**
 * Qué puede hacer el usuario ante un fallo de herramienta. Vocabulario CERRADO de tres
 * valores porque la tarjeta tiene tres afordancias, y lo decide el backend: el cliente
 * no mantiene una lista de códigos de error ajenos ni deduce nada del texto del mensaje.
 */
export type RemedioDeFallo = 'retry' | 'connect' | 'none';

/** Una pieza del turno, ya decidida. */
export type ParteDelTurno =
    | { tipo: 'texto'; texto: string }
    | { tipo: 'artefacto'; artifactId: string; titulo: string }
    | {
        tipo: 'utensilio';
        nombre: string;
        estado: 'running' | 'completed' | 'failed' | 'awaiting_confirmation';
        /** Salida recortada, si terminó bien. */
        resultado?: string;
        /** Motivo, si falló. */
        error?: string;
        /** Qué se puede hacer al respecto, si falló. Lo decide el backend. */
        remedio?: RemedioDeFallo;
        /** Qué se hará si el usuario confirma. Solo en `awaiting_confirmation`. */
        resumen?: string;
    };

/**
 * Los cinco marcadores, en un solo barrido.
 *
 * Se conserva LITERAL el patrón que había en el JSX, incluida la asimetría de
 * `[^:]+` para el nombre y `[^\]]*` para la carga: cambiarlo aquí cambiaría en
 * silencio qué se pinta en el hilo, y el escape de `]` y de los saltos de línea
 * lo hace `streamHandlers` contando con exactamente estas clases.
 *
 * `TOOL_CONFIRM` es el quinto y sigue la misma asimetría: una herramienta que
 * pide permiso no ha terminado ni ha fallado, así que necesita marcador propio.
 */
const MARCADORES =
    /\[ARTIFACT:([^:]+):([^\]]+)\]|\[TOOL_START:([^\]]+)\]|\[TOOL_RESULT:([^:]+):([^\]]*)\]|\[TOOL_ERROR:([^:]+):([^:]+):([^\]]*)\]|\[TOOL_CONFIRM:([^:]+):([^\]]*)\]/g;

/**
 * Parte el contenido de un turno en piezas.
 *
 * Reglas, todas heredadas del código que sustituye y conservadas a propósito:
 *
 *  - El texto entre marcadores sólo entra si tiene algo más que espacios.
 *  - Un `TOOL_RESULT` o un `TOOL_ERROR` **sustituyen** a la tarjeta `running`
 *    del mismo utensilio si la hay, en su sitio; si no la hay, se añaden al
 *    final. Es lo que hace que una llamada a herramienta se lea como UNA
 *    tarjeta que cambia de estado y no como dos tarjetas apiladas.
 *  - Si no sale ninguna pieza, se devuelve el contenido entero como texto. Esa
 *    era la rama `if (parts.length === 0)` del JSX y se conserva tal cual para
 *    no cambiar lo que se ve: el caso normal que la dispara es un turno sin
 *    ningún marcador.
 */
/**
 * El remedio del marcador, sin inventarse valores fuera del vocabulario.
 *
 * Lo desconocido cae a `retry`, que es la conducta de hoy: sólo lo probadamente
 * imposible pierde el botón, y nunca por un fallo de transporte.
 */
function remedioDelMarcador(valor: string | undefined): RemedioDeFallo {
    return valor === 'connect' || valor === 'none' ? valor : 'retry';
}

export function parseMessageParts(content: string): ParteDelTurno[] {
    const partes: ParteDelTurno[] = [];
    let desde = 0;
    let m: RegExpExecArray | null;

    // `lastIndex` es estado del propio regex literal: sin reiniciarlo, dos
    // llamadas seguidas con el mismo módulo cargado empezarían donde acabó la
    // anterior. Con el regex declarado en el scope del módulo esto NO es
    // opcional.
    MARCADORES.lastIndex = 0;

    /** La tarjeta `running` de este utensilio, si sigue en pie. */
    const enCurso = (nombre: string) =>
        partes.findIndex(
            (p) => p.tipo === 'utensilio' && p.nombre === nombre && p.estado === 'running',
        );

    while ((m = MARCADORES.exec(content)) !== null) {
        if (m.index > desde) {
            const antes = content.slice(desde, m.index);
            if (antes.trim()) partes.push({ tipo: 'texto', texto: antes });
        }

        if (m[1]) {
            partes.push({ tipo: 'artefacto', artifactId: m[1], titulo: m[2] });
        } else if (m[3]) {
            partes.push({ tipo: 'utensilio', nombre: m[3], estado: 'running' });
        } else if (m[4]) {
            const pieza: ParteDelTurno = {
                tipo: 'utensilio', nombre: m[4], estado: 'completed', resultado: m[5] || '',
            };
            const i = enCurso(m[4]);
            if (i >= 0) partes[i] = pieza; else partes.push(pieza);
        } else if (m[6]) {
            const pieza: ParteDelTurno = {
                tipo: 'utensilio', nombre: m[6], estado: 'failed', error: m[8] || '',
                remedio: remedioDelMarcador(m[7]),
            };
            const i = enCurso(m[6]);
            if (i >= 0) partes[i] = pieza; else partes.push(pieza);
        } else if (m[9]) {
            const pieza: ParteDelTurno = {
                tipo: 'utensilio', nombre: m[9], estado: 'awaiting_confirmation', resumen: m[10] || '',
            };
            const i = enCurso(m[9]);
            if (i >= 0) partes[i] = pieza; else partes.push(pieza);
        }

        desde = m.index + m[0].length;
    }

    if (desde < content.length) {
        const resto = content.slice(desde);
        if (resto.trim()) partes.push({ tipo: 'texto', texto: resto });
    }

    if (partes.length === 0) return [{ tipo: 'texto', texto: content }];
    return partes;
}
