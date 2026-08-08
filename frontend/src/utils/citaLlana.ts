/**
 * El texto de una cita, sin la sintaxis de markdown.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 * El asiento en foco del Palco (§8.1) cita la última intervención del director.
 * Esa intervención es markdown —lo escribe un modelo— y se estaba pintando
 * CRUDO: en pantalla se leía literalmente `**Voto en contra.** Nadie ha puesto
 * número…`. Los asteriscos no son parte de lo que dijo el director.
 *
 * ── Por qué se limpia en vez de renderizar el markdown ──────────────────────
 * Porque la cita es un RECORTE de 220 caracteres a tres líneas, y un recorte
 * parte la sintaxis por la mitad: un `**` sin su pareja, un enlace sin
 * su cierre, una valla de código abierta. Renderizarlo daría asteriscos sueltos
 * en unos casos y un bloque de código sin fin en otros. Para un extracto de tres
 * líneas, texto llano es la respuesta correcta y además la estable.
 *
 * Lo que NO hace: no sanea HTML. Aquí no se inserta nada como HTML — el
 * resultado se pinta como nodo de texto de React, que escapa por su cuenta.
 */

/** El artefacto de artefacto: el bloque que el turno usa para incrustar. */
const ARTEFACTO = /<sphere_artifact[\s\S]*?<\/sphere_artifact>/g;

/** Los marcadores que el store escribe en el contenido (ver `streamHandlers`). */
const MARCADORES = /\[(?:ARTIFACT|TOOL_START|TOOL_RESULT|TOOL_ERROR):[^\]]*\]/g;

const REGLAS: Array<[RegExp, string]> = [
    // Bloques de código cercados: se queda el contenido, se va la valla.
    [/```[\w-]*\n?/g, ''],
    // Imágenes antes que enlaces: `![alt](src)` → `alt`.
    [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
    [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
    // Encabezados y citas al principio de línea.
    [/^\s{0,3}#{1,6}\s+/gm, ''],
    [/^\s{0,3}>\s?/gm, ''],
    // Viñetas y numeración.
    [/^\s{0,3}[-*+]\s+/gm, ''],
    [/^\s{0,3}\d+\.\s+/gm, ''],
    // Reglas horizontales.
    [/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, ''],
    // Énfasis: negrita antes que cursiva, o `**x**` dejaría `*x*`.
    [/\*\*([^*]+)\*\*/g, '$1'],
    [/__([^_]+)__/g, '$1'],
    [/\*([^*]+)\*/g, '$1'],
    [/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1$2'],
    [/~~([^~]+)~~/g, '$1'],
    // Código en línea.
    [/`([^`]*)`/g, '$1'],
    // Los restos de sintaxis que un recorte deja sin pareja.
    [/\*\*|__|~~|`/g, ''],
];

/**
 * Convierte markdown en el texto que se lee, y lo recorta.
 *
 * El recorte va DESPUÉS de limpiar: recortando antes, los 220 caracteres se los
 * comería la sintaxis y la cita saldría más corta de lo que se pidió.
 */
export function citaLlana(markdown: string, maximo = 220): string {
    let texto = markdown.replace(ARTEFACTO, ' ').replace(MARCADORES, ' ');
    for (const [patron, sustituto] of REGLAS) texto = texto.replace(patron, sustituto);
    // Los saltos de línea se colapsan: la cita es una tirada de texto de tres
    // líneas, y un salto dentro del recorte a tres líneas gasta una de ellas.
    // (El nombre de esa utilidad de Tailwind no se escribe ni en un comentario:
    //  el detector de clases muertas lee los literales del fichero.)
    texto = texto.replace(/\s+/g, ' ').trim();
    if (texto.length <= maximo) return texto;
    // Se corta por el último espacio, no a mitad de palabra, y se marca que
    // sigue: un recorte sin elipsis parece una frase que terminó así.
    const corte = texto.slice(0, maximo);
    const ultimoEspacio = corte.lastIndexOf(' ');
    return `${(ultimoEspacio > maximo * 0.6 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
}
