/**
 * Parser del acta del board (F2).
 * Extrae los items de la sección "## Próximos pasos" para convertirlos en
 * issues de GitHub. Cada bullet es un issue; las líneas de continuación
 * (indentadas, sin marcador) se acumulan en el body del item anterior.
 */

export interface ParsedIssue {
    title: string;
    body: string;
}

const HEADING_RE = /^#{1,6}\s+/;
const BULLET_RE = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/;

/**
 * ¿Es esta línea el heading de "Próximos pasos"? Tolerante a la decoración que
 * suele meter el LLM: negritas (**), backticks, numeración ("4."), emoji, dos
 * puntos finales. Antes exigía el texto exacto y `## **Próximos pasos**` no
 * coincidía → la sección existía pero no se detectaba ningún item.
 */
function isProximosPasosHeading(trimmed: string): boolean {
    if (!HEADING_RE.test(trimmed)) return false;
    const text = trimmed
        .replace(HEADING_RE, "")       // quita los #
        .replace(/[*`_#:]/g, "")        // quita markdown/puntuación decorativa
        .replace(/^\s*\d+[.)]\s*/, "")  // quita numeración inicial
        .toLowerCase();
    return /pr[oó]ximos\s+pasos/.test(text);
}

/**
 * Devuelve los items de "## Próximos pasos" del markdown del acta.
 * Si la sección no existe o no tiene items, devuelve [].
 */
export function parseProximosPasos(markdown: string): ParsedIssue[] {
    if (!markdown) return [];
    const lines = markdown.split(/\r?\n/);

    // Localizar el heading de la sección.
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (isProximosPasosHeading(lines[i].trim())) {
            start = i + 1;
            break;
        }
    }
    if (start === -1) return [];

    const issues: ParsedIssue[] = [];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Fin de sección: siguiente heading.
        if (HEADING_RE.test(trimmed)) break;

        const bullet = line.match(BULLET_RE);
        if (bullet) {
            const text = bullet[1].trim();
            if (text) issues.push({ title: text, body: "" });
        } else if (trimmed && issues.length > 0) {
            // Línea de continuación del último item.
            const last = issues[issues.length - 1];
            last.body = last.body ? `${last.body}\n${trimmed}` : trimmed;
        }
    }

    return issues;
}
