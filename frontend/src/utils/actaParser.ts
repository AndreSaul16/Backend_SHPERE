/**
 * Parser del acta del board (F2).
 *
 * Extrae los items de la sección de próximos pasos para convertirlos en issues
 * de GitHub. Cada bullet es un issue; las líneas de continuación (indentadas,
 * sin marcador) se acumulan en el body del item anterior.
 *
 * lanzamiento-p0 · AD-003 — cuatro reglas deterministas, no heurística:
 *
 *   1. NIVEL   · al detectar el encabezado se guarda su nivel (nº de `#`; la
 *                variante en negrita sin `#` toma el nivel más bajo posible).
 *   2. CORTE   · la sección termina en el primer encabezado de nivel <= al
 *                suyo. Los de nivel mayor son sub-secciones y sus bullets
 *                entran. Antes cortaba en CUALQUIER encabezado, así que un
 *                `### Corto plazo` vaciaba la sección entera.
 *   3. TABLA   · cabecera + separador `|---|` → un item por fila de datos.
 *   4. PÁRRAFO · sólo si no hubo NI bullets NI tabla.
 *
 * La regla 4 es la de mayor radio: convierte líneas sueltas en issues del
 * repositorio de un cliente. Está acotada por dos lados — el corte de la regla
 * 2 y la condición de que la sección no tenga ninguna estructura — y por un
 * tercero fuera de este fichero: `ActaActions` enseña los títulos, literales y
 * todos, antes de que se pueda confirmar nada.
 */

export interface ParsedIssue {
    title: string;
    body: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/;

/**
 * Nivel que se le asigna a `**Próximos pasos**` escrito como línea suelta, sin
 * almohadillas. Es el más bajo que existe, de modo que cualquier encabezado
 * real —incluido un `###### `— cierra la sección.
 */
const NIVEL_DE_LA_NEGRITA = 6;

/**
 * Los títulos que valen como sección de próximos pasos. Los cuatro primeros son
 * el mismo en variantes de tilde; los otros tres salieron de la auditoría de
 * actas reales (formatos 8-10).
 */
const TITULOS_DE_LA_SECCION = /pr[oó]ximos\s+pasos|next\s+steps|plan\s+de\s+acci[oó]n|acciones\s+inmediatas/;

/** Quita la decoración con la que el LLM adorna los encabezados. */
function sinDecoracion(texto: string): string {
    return texto
        .replace(/[*`_#:]/g, "")        // negritas, backticks, dos puntos
        .replace(/^\s*\d+[.)]\s*/, "")  // numeración inicial («4. »)
        .trim()
        .toLowerCase();
}

/**
 * ¿Abre esta línea la sección de próximos pasos? Devuelve su nivel, o `null`.
 *
 * El nivel es lo que permite distinguir una sub-sección (que entra) de la
 * siguiente sección hermana (que corta), y es justo lo que el parser anterior
 * no miraba.
 */
function nivelDeLaSeccion(trimmed: string): number | null {
    const conAlmohadillas = HEADING_RE.exec(trimmed);
    if (conAlmohadillas) {
        return TITULOS_DE_LA_SECCION.test(sinDecoracion(conAlmohadillas[2]))
            ? conAlmohadillas[1].length
            : null;
    }
    // Formato 11: `**Próximos pasos**` como línea suelta, sin almohadillas.
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
        return TITULOS_DE_LA_SECCION.test(sinDecoracion(trimmed)) ? NIVEL_DE_LA_NEGRITA : null;
    }
    return null;
}

/** Las celdas de una fila de tabla markdown, sin los pipes de los extremos. */
function celdasDe(fila: string): string[] {
    return fila
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
}

/** `| --- | :---: |` y sus variantes. */
function esSeparadorDeTabla(fila: string): boolean {
    return /^[\s|:-]+$/.test(fila) && /-{3,}/.test(fila);
}

/** Regla 1 (bullets): el comportamiento de siempre, con las sub-secciones ya dentro. */
function itemsDeBullets(cuerpo: string[]): ParsedIssue[] {
    const issues: ParsedIssue[] = [];
    for (const linea of cuerpo) {
        const trimmed = linea.trim();
        if (!trimmed) continue;
        // Un sub-encabezado organiza la sección; no es texto de ningún item.
        if (HEADING_RE.test(trimmed)) continue;

        const bullet = linea.match(BULLET_RE);
        if (bullet) {
            const texto = bullet[1].trim();
            if (texto) issues.push({ title: texto, body: "" });
        } else if (issues.length > 0) {
            const ultimo = issues[issues.length - 1];
            ultimo.body = ultimo.body ? `${ultimo.body}\n${trimmed}` : trimmed;
        }
    }
    return issues;
}

/** Regla 3 (tabla): título = primera celda no vacía, el resto al body. */
function itemsDeTabla(cuerpo: string[]): ParsedIssue[] {
    const filas = cuerpo.map((l) => l.trim()).filter((l) => l.startsWith("|"));
    // Hacen falta cabecera, separador y al menos una fila de datos.
    if (filas.length < 3 || !esSeparadorDeTabla(filas[1])) return [];

    const issues: ParsedIssue[] = [];
    for (const fila of filas.slice(2)) {
        if (esSeparadorDeTabla(fila)) continue;
        const celdas = celdasDe(fila);
        const primera = celdas.findIndex((c) => c.length > 0);
        if (primera === -1) continue;
        issues.push({
            title: celdas[primera],
            body: celdas.slice(primera + 1).filter(Boolean).join(" · "),
        });
    }
    return issues;
}

/** Regla 4 (párrafo): sólo se llega aquí si la sección no tenía estructura. */
function itemsDeParrafo(cuerpo: string[]): ParsedIssue[] {
    return cuerpo
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !HEADING_RE.test(l))
        .map((titulo) => ({ title: titulo, body: "" }));
}

/**
 * Devuelve los items de la sección de próximos pasos del markdown del acta.
 * Si la sección no existe o no tiene items, devuelve [].
 */
export function parseProximosPasos(markdown: string): ParsedIssue[] {
    if (!markdown) return [];
    const lines = markdown.split(/\r?\n/);

    // Regla 1 · localizar el encabezado y quedarse con su nivel.
    let inicio = -1;
    let nivel = 0;
    for (let i = 0; i < lines.length; i++) {
        const n = nivelDeLaSeccion(lines[i].trim());
        if (n !== null) {
            inicio = i + 1;
            nivel = n;
            break;
        }
    }
    if (inicio === -1) return [];

    // Regla 2 · el cuerpo llega hasta el primer encabezado de nivel <= al suyo.
    const cuerpo: string[] = [];
    for (let i = inicio; i < lines.length; i++) {
        const encabezado = HEADING_RE.exec(lines[i].trim());
        if (encabezado && encabezado[1].length <= nivel) break;
        cuerpo.push(lines[i]);
    }

    const bullets = itemsDeBullets(cuerpo);
    if (bullets.length > 0) return bullets;

    const tabla = itemsDeTabla(cuerpo);
    if (tabla.length > 0) return tabla;

    return itemsDeParrafo(cuerpo);
}
